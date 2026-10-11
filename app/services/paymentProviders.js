import crypto from "node:crypto";
import { badRequest, forbidden } from "../lib/errors.js";

// Payment providers Astir can take money through, with an admin on/off
// switch stored in Postgres. New payments through a disabled provider are
// refused; callbacks and store webhooks keep working so payments already in
// flight still complete.
export const PAYMENT_PROVIDERS = [
  { id: "click", name: "Click", kind: "checkout", platforms: ["android", "ios"] },
  { id: "apple", name: "App Store (In-App Purchase)", kind: "store", platforms: ["ios"] },
  { id: "google", name: "Google Play Billing", kind: "store", platforms: ["android"] }
];

// POST endpoints that start a new payment, per provider.
const START_PAYMENT_ROUTES = [
  { provider: "click", pattern: /^\/(?:api\/)?v1\/billing\/(?:click\/)?checkout(?:\/deeplink)?\/?$/ },
  { provider: "click", pattern: /^\/(?:api\/)?v1\/billing\/charge\/recurring\/?$/ },
  { provider: "click", pattern: /^\/(?:api\/)?v1\/payments\/click\/card\/(?:request|verify)\/?$/ },
  { provider: "apple", pattern: /^\/(?:api\/)?v1\/billing\/apple\/verify\/?$/ },
  { provider: "google", pattern: /^\/(?:api\/)?v1\/billing\/google\/verify\/?$/ }
];

const CACHE_MS = 10_000;

// Credentials the admin can edit, per provider, mapped onto the live config
// object each provider reads on every request (config.click / appleIap /
// googlePlay). Saving updates that object in place, so new keys apply without
// a restart and without touching the mobile apps.
export const PROVIDER_FIELDS = {
  click: {
    configKey: "click",
    fields: [
      { key: "serviceId", label: "Service ID" },
      { key: "merchantId", label: "Merchant ID" },
      { key: "merchantUserId", label: "Merchant user ID" },
      { key: "secretKey", label: "Secret key", secret: true },
      { key: "returnUrl", label: "Return URL", placeholder: "https://…" }
    ]
  },
  apple: {
    configKey: "appleIap",
    fields: [
      { key: "bundleId", label: "Bundle ID", placeholder: "uz.astir.app" },
      { key: "issuerId", label: "Issuer ID", placeholder: "App Store Connect → Users and Access → Integrations" },
      { key: "keyId", label: "Key ID", placeholder: "10 символов, из названия .p8 файла" },
      { key: "privateKey", label: "Private key (.p8)", secret: true, multiline: true, placeholder: "-----BEGIN PRIVATE KEY-----" },
      { key: "environment", label: "Окружение", options: ["auto", "production", "sandbox"] },
      { key: "products", label: "Продукты → тарифы", type: "products" }
    ]
  },
  google: {
    configKey: "googlePlay",
    fields: [
      { key: "packageName", label: "Package name", placeholder: "uz.astir.app" },
      { key: "serviceAccountJson", label: "Service account (JSON)", secret: true, multiline: true, placeholder: "{ \"type\": \"service_account\", … }" },
      { key: "products", label: "Продукты → тарифы", type: "products" }
    ]
  }
};

function encryptionKey(config) {
  const seed = process.env.PAYMENT_SETTINGS_KEY || config.jwtSecret || "";
  return seed ? crypto.createHash("sha256").update(`astir-payment-settings:${seed}`).digest() : null;
}

function encrypt(key, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

function decrypt(key, payload) {
  const [version, iv, tag, data] = String(payload).split(":");
  if (version !== "v1") return payload;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

function validateValue(provider, field, value) {
  if (field.options && !field.options.includes(value)) {
    throw badRequest(`${field.label}: допустимо ${field.options.join(", ")}`, "VALIDATION_ERROR");
  }
  if (field.type === "products") {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw badRequest("Продукты: нужен JSON-объект { \"product_id\": \"tariff_id\" }", "VALIDATION_ERROR");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((tariff) => typeof tariff !== "string" || !tariff)) {
      throw badRequest("Продукты: каждому product_id нужен id тарифа", "VALIDATION_ERROR");
    }
  }
  if (provider === "apple" && field.key === "privateKey" && !/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(value)) {
    throw badRequest("Private key: вставьте содержимое .p8 файла целиком, вместе с BEGIN/END", "VALIDATION_ERROR");
  }
  if (provider === "google" && field.key === "serviceAccountJson") {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw badRequest("Service account: нужен JSON файл сервисного аккаунта целиком", "VALIDATION_ERROR");
    }
    if (parsed?.type !== "service_account" || !parsed.private_key || !parsed.client_email) {
      throw badRequest("Service account: в JSON нет type=service_account, private_key или client_email", "VALIDATION_ERROR");
    }
  }
}

export function providerForPaymentRoute(method, path) {
  if (String(method).toUpperCase() !== "POST") return null;
  return START_PAYMENT_ROUTES.find((route) => route.pattern.test(path))?.provider || null;
}

function configured(config, id) {
  if (id === "click") return Boolean(config.click?.serviceId && config.click?.merchantId && config.click?.secretKey);
  if (id === "apple") return Boolean(config.appleIap?.bundleId && config.appleIap?.keyId && config.appleIap?.issuerId && (config.appleIap?.privateKey || config.appleIap?.privateKeyPath));
  if (id === "google") return Boolean(config.googlePlay?.packageName && (config.googlePlay?.serviceAccountJson || config.googlePlay?.serviceAccountPath));
  return false;
}

function storeProducts(config, id) {
  const products = id === "apple" ? config.appleIap?.products : id === "google" ? config.googlePlay?.products : null;
  return Object.entries(products || {}).map(([product_id, tariff_id]) => ({ product_id, tariff_id }));
}

export function createPaymentProviders({ db = null, config = {} } = {}) {
  let cache = null;
  const key = encryptionKey(config);
  // Values from .env, kept so clearing an admin override falls back to them.
  const envDefaults = Object.fromEntries(Object.values(PROVIDER_FIELDS).map(({ configKey, fields }) => [
    configKey,
    Object.fromEntries(fields.map((field) => [field.key, config[configKey]?.[field.key]]))
  ]));
  const overrides = new Map();

  async function loadSettings() {
    if (!db) return;
    let rows = [];
    try {
      rows = await db.many("SELECT provider, key, value, secret, updated_at FROM payment_provider_settings");
    } catch {
      return; // not migrated yet
    }
    overrides.clear();
    for (const row of rows) {
      let value = row.value;
      if (row.secret && key) {
        try {
          value = decrypt(key, row.value);
        } catch {
          continue; // undecryptable (key changed): keep the .env value
        }
      }
      overrides.set(`${row.provider}.${row.key}`, { value, updated_at: row.updated_at });
    }
    applySettings();
  }

  function applySettings() {
    for (const [provider, { configKey, fields }] of Object.entries(PROVIDER_FIELDS)) {
      config[configKey] ||= {};
      for (const field of fields) {
        const override = overrides.get(`${provider}.${field.key}`);
        const value = override ? (field.type === "products" ? JSON.parse(override.value) : override.value) : envDefaults[configKey][field.key];
        if (value === undefined) delete config[configKey][field.key];
        else config[configKey][field.key] = value;
      }
    }
  }

  async function switches() {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
    const map = new Map();
    if (db) {
      try {
        for (const row of await db.many("SELECT provider, enabled, updated_at FROM payment_providers")) map.set(row.provider, row);
      } catch {
        // Table not migrated yet: everything stays enabled.
      }
    }
    cache = { at: Date.now(), map };
    return map;
  }

  async function isEnabled(id) {
    const row = (await switches()).get(id);
    return row ? Boolean(row.enabled) : true;
  }

  return {
    isEnabled,
    loadSettings,

    // Editable credentials for the admin panel: secrets are never returned,
    // only whether they are set and where the value comes from.
    settingsFor(id) {
      const schema = PROVIDER_FIELDS[id];
      if (!schema) return [];
      return schema.fields.map((field) => {
        const override = overrides.get(`${id}.${field.key}`);
        const live = config[schema.configKey]?.[field.key];
        const hasValue = field.type === "products" ? Boolean(live && Object.keys(live).length) : Boolean(live);
        return {
          key: field.key,
          label: field.label,
          secret: Boolean(field.secret),
          multiline: Boolean(field.multiline),
          type: field.type || "text",
          options: field.options || null,
          placeholder: field.placeholder || null,
          set: hasValue,
          source: override ? "admin" : hasValue ? "server" : null,
          value: field.secret ? null : field.type === "products" ? live || {} : live || "",
          updated_at: override?.updated_at || null
        };
      });
    },

    // values: { key: string } to set, { key: null } to drop the admin value.
    async saveSettings(id, values, actorId = null) {
      const schema = PROVIDER_FIELDS[id];
      if (!schema) return null;
      if (!db) throw badRequest("Database is not configured", "DATABASE_REQUIRED");

      const changes = [];
      for (const [fieldKey, raw] of Object.entries(values || {})) {
        const field = schema.fields.find((item) => item.key === fieldKey);
        if (!field) throw badRequest(`Unknown setting ${fieldKey}`, "VALIDATION_ERROR");
        if (raw === null || raw === "") {
          changes.push({ field, value: null });
          continue;
        }
        const value = field.type === "products" && typeof raw === "object" ? JSON.stringify(raw) : String(raw).trim();
        validateValue(id, field, value);
        if (field.secret && !key) throw badRequest("Нет ключа шифрования на сервере (JWT_SECRET)", "ENCRYPTION_KEY_MISSING");
        changes.push({ field, value: field.secret ? encrypt(key, value) : value });
      }

      await db.transaction(async (client) => {
        for (const { field, value } of changes) {
          if (value === null) {
            await client.query("DELETE FROM payment_provider_settings WHERE provider = $1 AND key = $2", [id, field.key]);
          } else {
            await client.query(
              `INSERT INTO payment_provider_settings (provider, key, value, secret, updated_at, updated_by)
               VALUES ($1, $2, $3, $4, now(), $5)
               ON CONFLICT (provider, key) DO UPDATE SET value = EXCLUDED.value, secret = EXCLUDED.secret, updated_at = now(), updated_by = EXCLUDED.updated_by`,
              [id, field.key, value, Boolean(field.secret), actorId]
            );
          }
        }
      });

      await loadSettings();
      return this.settingsFor(id);
    },

    // What the app may offer: enabled by admin and configured on the server.
    async publicList() {
      const map = await switches();
      return PAYMENT_PROVIDERS.map((provider) => {
        const enabled = map.get(provider.id) ? Boolean(map.get(provider.id).enabled) : true;
        return {
          id: provider.id,
          name: provider.name,
          platforms: provider.platforms,
          enabled,
          available: enabled && configured(config, provider.id),
          // Store product ids the app should offer, with the tariff each unlocks.
          products: storeProducts(config, provider.id)
        };
      });
    },

    async adminList() {
      const map = await switches();
      return PAYMENT_PROVIDERS.map((provider) => {
        const row = map.get(provider.id);
        return {
          ...provider,
          enabled: row ? Boolean(row.enabled) : true,
          configured: configured(config, provider.id),
          updated_at: row?.updated_at || null
        };
      });
    },

    async setEnabled(id, enabled, actorId = null) {
      if (!PAYMENT_PROVIDERS.some((provider) => provider.id === id)) return null;
      await db.query(
        `INSERT INTO payment_providers (provider, enabled, updated_at, updated_by) VALUES ($1, $2, now(), $3)
         ON CONFLICT (provider) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [id, Boolean(enabled), actorId]
      );
      cache = null;
      return (await this.adminList()).find((provider) => provider.id === id);
    },

    // Express middleware: refuse to start a payment through a disabled provider.
    guard() {
      return async (request, response, next) => {
        const provider = providerForPaymentRoute(request.method, request.path);
        if (!provider) return next();
        try {
          if (await isEnabled(provider)) return next();
          const name = PAYMENT_PROVIDERS.find((item) => item.id === provider)?.name || provider;
          return next(forbidden(`Оплата через ${name} временно недоступна`, "PAYMENT_PROVIDER_DISABLED"));
        } catch (error) {
          return next(error);
        }
      };
    }
  };
}

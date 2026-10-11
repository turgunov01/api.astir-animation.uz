import { badRequest } from "../lib/errors.js";

// Settings of the whole Astir project (not only the admin panel). Stored in
// Postgres per section, merged over defaults and published to the apps at
// GET /v1/app-config, so changing e.g. the API address or forcing an update
// does not need a new app build.

const text = () => ({ ru: "", uz: "", en: "" });

export const DEFAULT_PROJECT_SETTINGS = {
  api: {
    base_url: "",
    fallback_urls: [],
    media_base_url: ""
  },
  app: {
    min_version: { ios: "", android: "" },
    latest_version: { ios: "", android: "" },
    store_urls: { ios: "", android: "" },
    update_message: text(),
    maintenance: { enabled: false, message: text() }
  },
  features: {
    registration: true,
    google_sign_in: true,
    apple_sign_in: true,
    email_sign_in: true,
    comments: true,
    likes: true,
    support_chat: true,
    offline_downloads: true,
    subscriptions: true,
    tv_pairing: true
  },
  contacts: {
    support_email: "",
    support_phone: "",
    telegram: "",
    website: "",
    instagram: ""
  },
  legal: {
    privacy_policy_url: "",
    terms_url: "",
    company_name: ""
  }
};

const SECTIONS = Object.keys(DEFAULT_PROJECT_SETTINGS);
const CACHE_MS = 15_000;
const VERSION = /^\d+(\.\d+){0,3}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Keep only known keys, with the default's type.
function sanitize(shape, value) {
  if (Array.isArray(shape)) return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 10) : shape;
  if (isPlainObject(shape)) {
    const source = isPlainObject(value) ? value : {};
    return Object.fromEntries(Object.entries(shape).map(([key, item]) => [key, sanitize(item, source[key])]));
  }
  if (typeof shape === "boolean") return typeof value === "boolean" ? value : shape;
  return typeof value === "string" ? value.trim() : shape;
}

function assertUrl(label, value, { required = false } = {}) {
  if (!value) {
    if (required) throw badRequest(`${label}: обязательно`, "VALIDATION_ERROR");
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw badRequest(`${label}: неверный адрес`, "VALIDATION_ERROR");
  }
  if (url.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
    throw badRequest(`${label}: нужен https://`, "VALIDATION_ERROR");
  }
}

function validate(section, value) {
  if (section === "api") {
    assertUrl("Адрес API", value.base_url);
    value.fallback_urls.forEach((url, index) => assertUrl(`Резервный адрес ${index + 1}`, url));
    assertUrl("Адрес медиа", value.media_base_url);
    value.base_url = value.base_url.replace(/\/+$/, "");
    value.fallback_urls = value.fallback_urls.map((url) => url.replace(/\/+$/, ""));
  }
  if (section === "app") {
    for (const platform of ["ios", "android"]) {
      for (const field of ["min_version", "latest_version"]) {
        if (value[field][platform] && !VERSION.test(value[field][platform])) {
          throw badRequest(`Версия ${platform}: формат 1.2.3`, "VALIDATION_ERROR");
        }
      }
      assertUrl(`Ссылка на ${platform === "ios" ? "App Store" : "Google Play"}`, value.store_urls[platform]);
    }
  }
  if (section === "contacts") {
    if (value.support_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.support_email)) throw badRequest("Email поддержки: неверный формат", "VALIDATION_ERROR");
    assertUrl("Сайт", value.website);
  }
  if (section === "legal") {
    assertUrl("Политика конфиденциальности", value.privacy_policy_url);
    assertUrl("Условия использования", value.terms_url);
  }
  return value;
}

export function createProjectSettings({ db = null, config = {} } = {}) {
  let cache = null;

  async function load() {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache;
    const stored = {};
    const meta = {};
    if (db) {
      try {
        for (const row of await db.many("SELECT key, value, updated_at, updated_by FROM project_settings")) {
          stored[row.key] = row.value;
          meta[row.key] = { updated_at: row.updated_at, updated_by: row.updated_by };
        }
      } catch {
        // Not migrated yet: defaults only.
      }
    }
    const settings = Object.fromEntries(SECTIONS.map((section) => [section, sanitize(DEFAULT_PROJECT_SETTINGS[section], stored[section])]));
    // Until an admin sets it, the API address is the one serving this request.
    if (!settings.api.base_url && config.publicBaseUrl) settings.api.base_url = config.publicBaseUrl;
    cache = { at: Date.now(), settings, meta };
    return cache;
  }

  return {
    // `requestBaseUrl` stands in for the API address until an admin sets one.
    async all(requestBaseUrl = "") {
      const { settings, meta } = await load();
      return { settings: { ...settings, api: { ...settings.api, base_url: settings.api.base_url || requestBaseUrl } }, meta };
    },

    async feature(name) {
      const { settings } = await load();
      return settings.features[name] !== false;
    },

    async update(section, value, actorId = null, requestBaseUrl = "") {
      if (!SECTIONS.includes(section)) throw badRequest("Неизвестный раздел настроек", "VALIDATION_ERROR");
      if (!db) throw badRequest("Database is not configured", "DATABASE_REQUIRED");
      const clean = validate(section, sanitize(DEFAULT_PROJECT_SETTINGS[section], value));
      await db.query(
        `INSERT INTO project_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [section, JSON.stringify(clean), actorId]
      );
      cache = null;
      return this.all(requestBaseUrl);
    },

    // What the apps get: everything here is meant to be public.
    async publicConfig(requestBaseUrl = "") {
      const { settings, meta } = await load();
      const updated = Object.values(meta).map((item) => new Date(item.updated_at).getTime()).filter(Number.isFinite);
      return {
        ...settings,
        api: { ...settings.api, base_url: settings.api.base_url || requestBaseUrl },
        updated_at: updated.length ? new Date(Math.max(...updated)).toISOString() : null
      };
    }
  };
}

import { forbidden } from "../lib/errors.js";

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

export function providerForPaymentRoute(method, path) {
  if (String(method).toUpperCase() !== "POST") return null;
  return START_PAYMENT_ROUTES.find((route) => route.pattern.test(path))?.provider || null;
}

function configured(config, id) {
  if (id === "click") return Boolean(config.click?.serviceId && config.click?.merchantId && config.click?.secretKey);
  if (id === "apple") return Boolean(config.appleIap?.bundleId && config.appleIap?.keyId && config.appleIap?.issuerId && (config.appleIap?.privateKey || config.appleIap?.privateKeyPath));
  if (id === "google") return Boolean(config.googlePlay?.packageName && config.googlePlay?.serviceAccountPath);
  return false;
}

export function createPaymentProviders({ db = null, config = {} } = {}) {
  let cache = null;

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
          available: enabled && configured(config, provider.id)
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

import { importPKCS8, SignJWT } from "jose";
import { badRequest, serviceUnavailable } from "../lib/errors.js";
import { normalizePrivateKeyPem } from "../lib/pem.js";

// App Store Connect API: the subscriptions of the app's subscription group.
// Uses its own key (Users and Access → Integrations → App Store Connect API);
// the In-App Purchase key used to verify receipts can't call this API.
// A team key has an Issuer ID; an individual key has none ("sub": "user").

const API_URL = "https://api.appstoreconnect.apple.com";
const TOKEN_TTL_SECONDS = 15 * 60;

// Tariff duration (days) ↔ App Store subscription period.
const PERIODS = [
  [7, "ONE_WEEK"],
  [30, "ONE_MONTH"],
  [60, "TWO_MONTHS"],
  [90, "THREE_MONTHS"],
  [180, "SIX_MONTHS"],
  [365, "ONE_YEAR"]
];

export function periodForDays(days) {
  const value = Number(days) || 30;
  return PERIODS.reduce((best, item) => (Math.abs(item[0] - value) < Math.abs(best[0] - value) ? item : best))[1];
}

export function daysForPeriod(period) {
  return PERIODS.find(([, name]) => name === period)?.[0] || 30;
}

// App Store locales for the tariff's ru/uz/en texts. Uzbek has no App Store
// locale, so it is not sent.
const LOCALES = { en: "en-US", ru: "ru" };

export function createAppStoreConnectClient(settings = {}, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cachedToken = null;
  let cachedFor = "";
  let cachedUntil = 0;

  function isConfigured() {
    return Boolean(settings.ascKeyId && settings.ascPrivateKey && settings.ascAppId);
  }

  function assertConfigured() {
    if (!isConfigured()) {
      throw serviceUnavailable(
        "App Store Connect API is not configured: add its key in Платёжные системы → App Store",
        "APP_STORE_CONNECT_NOT_CONFIGURED"
      );
    }
  }

  async function authToken() {
    const seconds = Math.floor(now() / 1000);
    const credentials = [settings.ascIssuerId, settings.ascKeyId, settings.ascPrivateKey].join("|");
    if (cachedToken && cachedFor === credentials && cachedUntil - 60 > seconds) return cachedToken;

    const key = await importPKCS8(normalizePrivateKeyPem(settings.ascPrivateKey), "ES256");
    const jwt = new SignJWT(settings.ascIssuerId ? {} : { sub: "user" })
      .setProtectedHeader({ alg: "ES256", kid: settings.ascKeyId, typ: "JWT" })
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + TOKEN_TTL_SECONDS)
      .setAudience("appstoreconnect-v1");
    if (settings.ascIssuerId) jwt.setIssuer(settings.ascIssuerId);

    cachedToken = await jwt.sign(key);
    cachedFor = credentials;
    cachedUntil = seconds + TOKEN_TTL_SECONDS;
    return cachedToken;
  }

  async function call(method, path, body) {
    assertConfigured();
    const response = await fetchImpl(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await authToken()}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = payload.errors?.[0];
      const message = error?.detail || error?.title || `App Store Connect answered ${response.status}`;
      const failure = response.status === 401 || response.status === 403
        ? serviceUnavailable(`App Store Connect: ${message}`, "APP_STORE_CONNECT_UNAUTHORIZED")
        : badRequest(`App Store Connect: ${message}`, "APP_STORE_CONNECT_ERROR");
      failure.appStoreStatus = response.status;
      throw failure;
    }
    return payload;
  }

  async function groupId() {
    if (settings.ascGroupId) return settings.ascGroupId;
    const groups = await call("GET", `/v1/apps/${settings.ascAppId}/subscriptionGroups?limit=50`);
    const first = groups.data?.[0]?.id;
    if (!first) {
      throw badRequest("App Store Connect: у приложения нет группы подписок — создайте её в App Store Connect", "APP_STORE_GROUP_MISSING");
    }
    return first;
  }

  // Every subscription in the group, with its texts.
  async function listSubscriptions() {
    const group = await groupId();
    const payload = await call(
      "GET",
      `/v1/subscriptionGroups/${group}/subscriptions?limit=200&include=subscriptionLocalizations&limit[subscriptionLocalizations]=50`
    );
    const localizations = new Map(
      (payload.included || [])
        .filter((item) => item.type === "subscriptionLocalizations")
        .map((item) => [item.id, item.attributes || {}])
    );
    return (payload.data || []).map((item) => {
      const texts = {};
      for (const ref of item.relationships?.subscriptionLocalizations?.data || []) {
        const localization = localizations.get(ref.id);
        if (!localization) continue;
        const lang = Object.entries(LOCALES).find(([, locale]) => locale === localization.locale)?.[0]
          || String(localization.locale || "").slice(0, 2);
        texts[lang] = { name: localization.name || "", description: localization.description || "" };
      }
      return {
        id: item.id,
        productId: item.attributes?.productId,
        name: item.attributes?.name || "",
        state: item.attributes?.state || "",
        period: item.attributes?.subscriptionPeriod || "",
        texts
      };
    });
  }

  // USD price point of a subscription for the given amount ("4.99").
  async function usdPricePoint(subscriptionId, usdPrice) {
    const wanted = Number(usdPrice);
    let path = `/v1/subscriptions/${subscriptionId}/pricePoints?filter[territory]=USA&limit=200`;
    while (path) {
      const page = await call("GET", path);
      const match = (page.data || []).find((point) => Number(point.attributes?.customerPrice) === wanted);
      if (match) return match.id;
      path = page.links?.next ? page.links.next.replace(API_URL, "") : null;
    }
    throw badRequest(`App Store Connect: нет цены $${usdPrice} — выберите цену из сетки Apple`, "APP_STORE_PRICE_POINT_MISSING");
  }

  // Current USD price ("4.99"), or null when none is set yet.
  async function currentUsdPrice(subscriptionId) {
    const payload = await call(
      "GET",
      `/v1/subscriptions/${subscriptionId}/prices?filter[territory]=USA&include=subscriptionPricePoint&limit=50`
    );
    const points = new Map(
      (payload.included || [])
        .filter((item) => item.type === "subscriptionPricePoints")
        .map((item) => [item.id, item.attributes?.customerPrice])
    );
    const today = new Date(now()).toISOString().slice(0, 10);
    const current = (payload.data || [])
      .filter((price) => !price.attributes?.startDate || price.attributes.startDate <= today)
      .sort((left, right) => String(right.attributes?.startDate || "").localeCompare(String(left.attributes?.startDate || "")))[0];
    const pointId = current?.relationships?.subscriptionPricePoint?.data?.id;
    const value = pointId ? points.get(pointId) : null;
    return value ? Number(value).toFixed(2) : null;
  }

  // Sets the USD price and Apple's equalized price in every other territory.
  // preserveCurrentPrice keeps existing subscribers on the price they pay.
  async function setPrice(subscriptionId, usdPrice, { preserveCurrentPrice = false } = {}) {
    const usaPoint = await usdPricePoint(subscriptionId, usdPrice);
    const points = [usaPoint];
    let path = `/v1/subscriptionPricePoints/${usaPoint}/equalizations?limit=200`;
    while (path) {
      const page = await call("GET", path);
      points.push(...(page.data || []).map((point) => point.id));
      path = page.links?.next ? page.links.next.replace(API_URL, "") : null;
    }
    for (const point of points) {
      await call("POST", "/v1/subscriptionPrices", {
        data: {
          type: "subscriptionPrices",
          attributes: { preserveCurrentPrice },
          relationships: {
            subscription: { data: { type: "subscriptions", id: subscriptionId } },
            subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: point } }
          }
        }
      });
    }
    return points.length;
  }

  // Sold in every territory, including future ones.
  async function setAvailability(subscriptionId) {
    const territories = [];
    let path = "/v1/territories?limit=200";
    while (path) {
      const page = await call("GET", path);
      territories.push(...(page.data || []).map((territory) => ({ type: "territories", id: territory.id })));
      path = page.links?.next ? page.links.next.replace(API_URL, "") : null;
    }
    await call("POST", "/v1/subscriptionAvailabilities", {
      data: {
        type: "subscriptionAvailabilities",
        attributes: { availableInNewTerritories: true },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
          availableTerritories: { data: territories }
        }
      }
    });
  }

  // Creates the subscription with texts, availability and price. The review
  // screenshot is still added by hand in App Store Connect.
  async function createSubscription({ productId, name, durationDays, title = {}, description = {}, usdPrice }) {
    const group = await groupId();
    const created = await call("POST", "/v1/subscriptions", {
      data: {
        type: "subscriptions",
        attributes: { name, productId, subscriptionPeriod: periodForDays(durationDays), familySharable: false },
        relationships: { group: { data: { type: "subscriptionGroups", id: group } } }
      }
    });
    const subscriptionId = created.data.id;

    for (const [lang, locale] of Object.entries(LOCALES)) {
      const localizedName = String(title[lang] || title.ru || name).slice(0, 30);
      if (!localizedName) continue;
      await call("POST", "/v1/subscriptionLocalizations", {
        data: {
          type: "subscriptionLocalizations",
          attributes: {
            locale,
            name: localizedName,
            description: String(description[lang] || description.ru || localizedName).slice(0, 45)
          },
          relationships: { subscription: { data: { type: "subscriptions", id: subscriptionId } } }
        }
      });
    }

    await setAvailability(subscriptionId);
    if (usdPrice) await setPrice(subscriptionId, usdPrice);

    return { id: subscriptionId, productId, state: created.data.attributes?.state || "MISSING_METADATA" };
  }

  return { isConfigured, listSubscriptions, createSubscription, setPrice, currentUsdPrice };
}

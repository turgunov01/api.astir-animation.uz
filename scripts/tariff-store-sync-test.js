import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { JsonStore } from "../app/store/jsonStore.js";
import { createTariffRepository } from "../app/repositories/tariffRepository.js";
import { createTariffService, missingTariffFields } from "../app/services/tariffService.js";
import { createAppStoreConnectClient, periodForDays } from "../app/services/appStoreConnect.js";
import { createTariffStoreSync, defaultProductId } from "../app/services/tariffStoreSync.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astir-tariff-sync-"));
const store = new JsonStore(path.join(dir, "store.json"));
const tariffService = createTariffService({
  parents: { list: async () => [], update: async () => null },
  subscriptions: { listByTariffId: async () => [], serializeSubscription: () => null },
  tariffs: createTariffRepository(store)
});

assert.equal(periodForDays(30), "ONE_MONTH");
assert.equal(periodForDays(365), "ONE_YEAR");
assert.equal(defaultProductId({ id: "x", title: { en: "Family Plus" }, duration_days: 30 }), "astir.family_plus.monthly");

// ---- a fake App Store Connect ----
const calls = [];
const subscriptions = [
  { id: "sub-premium", type: "subscriptions", attributes: { productId: "astir.premium.monthly", name: "Premium", state: "READY_TO_SUBMIT", subscriptionPeriod: "ONE_MONTH" }, relationships: { subscriptionLocalizations: { data: [] } } },
  {
    id: "sub-family", type: "subscriptions",
    attributes: { productId: "astir.family.yearly", name: "Family", state: "MISSING_METADATA", subscriptionPeriod: "ONE_YEAR" },
    relationships: { subscriptionLocalizations: { data: [{ type: "subscriptionLocalizations", id: "l1" }] } }
  }
];
async function fakeFetch(url, { method = "GET", body } = {}) {
  const pathname = url.replace("https://api.appstoreconnect.apple.com", "");
  calls.push({ method, path: pathname, body: body ? JSON.parse(body) : null });
  const json = (payload, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(payload) });
  if (method === "GET" && pathname.startsWith("/v1/subscriptionGroups/g1/subscriptions")) {
    return json({ data: subscriptions, included: [{ type: "subscriptionLocalizations", id: "l1", attributes: { locale: "ru", name: "Семья", description: "Для всей семьи" } }] });
  }
  if (method === "GET" && /^\/v1\/subscriptions\/[^/]+\/prices/.test(pathname)) {
    return json({
      data: [
        { id: "p-old", attributes: { startDate: "2020-01-01" }, relationships: { subscriptionPricePoint: { data: { id: "pp-3.99" } } } },
        { id: "p-new", attributes: { startDate: "2026-01-01" }, relationships: { subscriptionPricePoint: { data: { id: "pp-4.99" } } } },
        { id: "p-future", attributes: { startDate: "2099-01-01" }, relationships: { subscriptionPricePoint: { data: { id: "pp-9.99" } } } }
      ],
      included: [
        { type: "subscriptionPricePoints", id: "pp-3.99", attributes: { customerPrice: "3.99" } },
        { type: "subscriptionPricePoints", id: "pp-4.99", attributes: { customerPrice: "4.99" } },
        { type: "subscriptionPricePoints", id: "pp-9.99", attributes: { customerPrice: "9.99" } }
      ]
    });
  }
  if (method === "GET" && pathname.startsWith("/v1/subscriptions/sub-premium/pricePoints")) {
    return json({ data: [{ id: "pp-premium-6.99", attributes: { customerPrice: "6.99" } }] });
  }
  if (method === "GET" && pathname.startsWith("/v1/subscriptionPricePoints/pp-premium-6.99/equalizations")) return json({ data: [] });
  if (method === "POST" && pathname === "/v1/subscriptions") return json({ data: { id: "sub-new", attributes: { state: "MISSING_METADATA" } } }, 201);
  if (method === "GET" && pathname === "/v1/territories?limit=200") return json({ data: [{ id: "USA" }, { id: "UZB" }] });
  if (method === "GET" && pathname.startsWith("/v1/subscriptions/sub-new/pricePoints")) {
    return json({ data: [{ id: "pp-0.99", attributes: { customerPrice: "0.99" } }, { id: "pp-4.99", attributes: { customerPrice: "4.99" } }] });
  }
  if (method === "GET" && pathname.startsWith("/v1/subscriptionPricePoints/pp-4.99/equalizations")) return json({ data: [{ id: "pp-uzb" }] });
  if (method === "POST") return json({ data: { id: "ok" } }, 201);
  return json({ errors: [{ status: "404", title: "not found" }] }, 404);
}

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const config = {
  appleIap: {
    products: { "astir.premium.monthly": "premium" },
    ascKeyId: "KEY123", ascIssuerId: "issuer", ascAppId: "6811844903", ascGroupId: "g1",
    ascPrivateKey: privateKey.export({ type: "pkcs8", format: "pem" })
  }
};
const saved = [];
const paymentProviders = {
  async saveSettings(provider, values) {
    saved.push({ provider, values });
    config.appleIap.products = values.products || {};
  }
};
const sync = createTariffStoreSync({
  config,
  tariffService,
  paymentProviders,
  client: createAppStoreConnectClient(config.appleIap, { fetchImpl: fakeFetch })
});

// ---- App Store Connect → admin: a new subscription becomes a hidden draft ----
const imported = await sync.importFromAppStore();
assert.equal(imported.subscriptions, 2);
assert.equal(imported.created.length, 1, "premium was already linked");
const draft = imported.created[0];
assert.equal(draft.active, false);
assert.equal(draft.store_draft, true);
assert.equal(draft.title.ru, "Семья");
assert.equal(draft.duration_days, 365);
assert.equal(draft.app_store.product_id, "astir.family.yearly");
assert.equal(config.appleIap.products["astir.family.yearly"], draft.id, "linked for the app and receipt checks");
assert.equal(tariffService.getTariff("premium").app_store.state, "READY_TO_SUBMIT", "linked tariff gets the store state");
assert.equal(tariffService.getTariff("premium").app_store.usd_price, "4.99", "current price, not a past or future one");

// ---- App Store price changes from the admin panel ----
calls.length = 0;
assert.equal((await sync.updatePrice("premium", "6.99")).app_store.usd_price, "6.99");
const priceChange = calls.find((call) => call.path === "/v1/subscriptionPrices");
assert.equal(priceChange.body.data.relationships.subscriptionPricePoint.data.id, "pp-premium-6.99");
assert.equal(priceChange.body.data.attributes.preserveCurrentPrice, true, "current subscribers keep their price");

assert.ok(!tariffService.listTariffs().some((tariff) => tariff.id === draft.id), "the app doesn't see the draft");
assert.ok(tariffService.listTariffs({ includeInactive: true }).some((tariff) => tariff.id === draft.id), "the admin does");

const again = await sync.importFromAppStore();
assert.equal(again.created.length, 0, "a second sync creates nothing");

// ---- the draft goes live once the constructor is filled in ----
assert.ok(missingTariffFields(draft).includes("price"));
assert.throws(() => tariffService.updateTariff(draft.id, { active: true }), (error) => error.code === "TARIFF_INCOMPLETE");
let updated = tariffService.updateTariff(draft.id, { price_cents: 29900000 });
assert.equal(updated.active, false, "uz/en texts still missing");
updated = tariffService.updateTariff(draft.id, {
  title: { ru: "Семья", uz: "Oila", en: "Family" },
  description: { ru: "Для всей семьи", uz: "Butun oila uchun", en: "For the whole family" }
});
assert.equal(updated.active, true);
assert.equal(updated.store_draft, false);
assert.ok(tariffService.listTariffs().some((tariff) => tariff.id === draft.id), "now the app sees it");

// A live tariff the admin hides stays hidden.
assert.equal(tariffService.updateTariff(draft.id, { active: false }).active, false);
assert.equal(tariffService.updateTariff(draft.id, { max_children: 3 }).active, false);

// ---- admin → App Store Connect ----
const own = tariffService.createTariff({
  title: { ru: "Детский", uz: "Bolalar", en: "Kids" },
  description: { ru: "Мультфильмы", uz: "Multfilmlar", en: "Cartoons" },
  duration_days: 30, max_children: 2, price_cents: 1500000, currency: "UZS"
});
calls.length = 0;
const pushed = await sync.pushTariff(own.id, { usdPrice: "4.99" });
assert.equal(pushed.app_store.product_id, "astir.kids.monthly");
assert.equal(pushed.app_store.subscription_id, "sub-new");
assert.equal(config.appleIap.products["astir.kids.monthly"], own.id);
const created = calls.find((call) => call.method === "POST" && call.path === "/v1/subscriptions");
assert.equal(created.body.data.attributes.subscriptionPeriod, "ONE_MONTH");
assert.equal(created.body.data.relationships.group.data.id, "g1");
const locales = calls.filter((call) => call.path === "/v1/subscriptionLocalizations").map((call) => call.body.data.attributes.locale);
assert.deepEqual(locales.sort(), ["en-US", "ru"]);
assert.ok(calls.some((call) => call.path === "/v1/subscriptionAvailabilities"));
const prices = calls.filter((call) => call.path === "/v1/subscriptionPrices").map((call) => call.body.data.relationships.subscriptionPricePoint.data.id);
assert.deepEqual(prices, ["pp-4.99", "pp-uzb"], "USA price plus Apple's equalized prices");

await assert.rejects(sync.pushTariff(own.id, {}), (error) => error.code === "TARIFF_ALREADY_IN_APP_STORE");

// ---- an individual key signs without an issuer ----
const individual = createAppStoreConnectClient({ ...config.appleIap, ascIssuerId: "" }, {
  fetchImpl: async (url, options) => {
    const [, payload] = options.headers.Authorization.slice(7).split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    assert.equal(claims.sub, "user");
    assert.equal(claims.iss, undefined);
    assert.equal(claims.aud, "appstoreconnect-v1");
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) };
  }
});
assert.deepEqual(await individual.listSubscriptions(), []);

// ---- exactly one default tariff, the free one ----
{
  const second = new JsonStore(path.join(dir, "defaults.json"));
  const repository = createTariffRepository(second);
  repository.create({ id: "basic", title: { ru: "Базовый" }, is_default: true });
  createTariffService({ parents: {}, subscriptions: {}, tariffs: repository });
  assert.deepEqual(repository.list().filter((tariff) => tariff.is_default).map((tariff) => tariff.id), ["free"]);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log("tariff store sync tests passed");

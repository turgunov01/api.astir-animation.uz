import assert from "node:assert/strict";
import { createPaymentProviders, providerForPaymentRoute } from "../app/services/paymentProviders.js";

assert.equal(providerForPaymentRoute("POST", "/api/v1/billing/click/checkout"), "click");
assert.equal(providerForPaymentRoute("POST", "/v1/billing/checkout/deeplink"), "click");
assert.equal(providerForPaymentRoute("POST", "/v1/billing/charge/recurring"), "click");
assert.equal(providerForPaymentRoute("POST", "/api/v1/payments/click/card/request"), "click");
assert.equal(providerForPaymentRoute("POST", "/api/v1/billing/apple/verify"), "apple");
assert.equal(providerForPaymentRoute("POST", "/api/v1/billing/google/verify"), "google");
assert.equal(providerForPaymentRoute("POST", "/api/v1/billing/click/prepare"), null, "callbacks keep working");
assert.equal(providerForPaymentRoute("POST", "/api/v1/billing/webhook/apple"), null, "store webhooks keep working");
assert.equal(providerForPaymentRoute("GET", "/api/v1/billing/click/checkout"), null);

const rows = new Map();
const db = {
  async many() { return [...rows.values()]; },
  async query(sql, [provider, enabled]) { rows.set(provider, { provider, enabled, updated_at: new Date().toISOString() }); }
};
const providers = createPaymentProviders({ db, config: { click: { serviceId: "1", merchantId: "2", secretKey: "3" } } });

let list = await providers.publicList();
assert.deepEqual(list.map((row) => [row.id, row.enabled, row.available]), [["click", true, true], ["apple", true, false], ["google", true, false]]);

await providers.setEnabled("click", false);
list = await providers.publicList();
assert.equal(list.find((row) => row.id === "click").available, false);

const guard = providers.guard();
const run = (method, path) => new Promise((resolve) => guard({ method, path }, {}, resolve));
const refused = await run("POST", "/api/v1/billing/click/checkout");
assert.equal(refused?.statusCode, 403);
assert.equal(refused?.code, "PAYMENT_PROVIDER_DISABLED");
assert.equal(await run("POST", "/api/v1/billing/click/complete"), undefined);
assert.equal(await run("POST", "/api/v1/billing/apple/verify"), undefined, "apple still on");
assert.equal(await providers.setEnabled("paypal", true), null);

console.log("payment providers tests passed");

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

// ---- admin-entered credentials apply live, secrets encrypted ----
{
  const stored = new Map();
  const settingsDb = {
    async many(sql) {
      if (sql.includes("payment_provider_settings")) return [...stored.values()];
      return [];
    },
    async query() {},
    async transaction(work) {
      return await work({
        async query(sql, params) {
          if (sql.startsWith("DELETE")) stored.delete(`${params[0]}.${params[1]}`);
          else stored.set(`${params[0]}.${params[1]}`, { provider: params[0], key: params[1], value: params[2], secret: params[3], updated_at: "now" });
        }
      });
    }
  };
  const config = { jwtSecret: "test-secret", click: { serviceId: "1", merchantId: "2", secretKey: "3" }, appleIap: { environment: "auto" }, googlePlay: {} };
  const live = createPaymentProviders({ db: settingsDb, config });
  await live.loadSettings();
  assert.equal((await live.publicList()).find((row) => row.id === "apple").available, false);

  const pem = "-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49\n-----END PRIVATE KEY-----";
  await live.saveSettings("apple", { bundleId: "uz.astir.app", issuerId: "issuer", keyId: "KEY123", privateKey: pem, products: { "astir.premium.month": "premium" } });
  assert.equal(config.appleIap.bundleId, "uz.astir.app", "live config updated in place");
  assert.equal(config.appleIap.privateKey, pem);
  assert.notEqual(stored.get("apple.privateKey").value, pem, "secret stored encrypted");
  assert.ok(stored.get("apple.privateKey").value.startsWith("v1:"));
  const apple = (await live.publicList()).find((row) => row.id === "apple");
  assert.equal(apple.available, true);
  assert.deepEqual(apple.products, [{ product_id: "astir.premium.month", tariff_id: "premium" }]);

  const fields = live.settingsFor("apple");
  assert.equal(fields.find((field) => field.key === "privateKey").value, null, "secrets never returned");
  assert.equal(fields.find((field) => field.key === "privateKey").set, true);
  assert.equal(fields.find((field) => field.key === "bundleId").source, "admin");

  // Clearing an override falls back to the .env value.
  await live.saveSettings("click", { serviceId: "99" });
  assert.equal(config.click.serviceId, "99");
  await live.saveSettings("click", { serviceId: null });
  assert.equal(config.click.serviceId, "1");

  await assert.rejects(live.saveSettings("apple", { privateKey: "not a key" }), (error) => error.statusCode === 400);
  await assert.rejects(live.saveSettings("apple", { environment: "staging" }), (error) => error.statusCode === 400);
  await assert.rejects(live.saveSettings("google", { serviceAccountJson: "{\"type\":\"user\"}" }), (error) => error.statusCode === 400);

  // A restart reads the encrypted values back.
  const config2 = { jwtSecret: "test-secret", click: {}, appleIap: {}, googlePlay: {} };
  await createPaymentProviders({ db: settingsDb, config: config2 }).loadSettings();
  assert.equal(config2.appleIap.privateKey, pem);
  assert.deepEqual(config2.appleIap.products, { "astir.premium.month": "premium" });
}

console.log("payment provider settings tests passed");

// ---- SMTP settings for OTP emails ----
import { otpMessage, smtpConfigured } from "../app/lib/mailer.js";
{
  const stored = new Map();
  const settingsDb = {
    async many() { return [...stored.values()]; },
    async transaction(work) {
      return await work({ async query(sql, params) { if (!sql.startsWith("DELETE")) stored.set(params[1], { provider: params[0], key: params[1], value: params[2], secret: params[3] }); } });
    }
  };
  const config = { jwtSecret: "x", smtp: { port: 587, secure: false } };
  const mail = createPaymentProviders({ db: settingsDb, config });
  await mail.loadSettings();
  assert.equal(smtpConfigured(config.smtp), false);
  await mail.saveSettings("email", { host: "smtp.example.uz", port: "465", secure: "true", user: "noreply@example.uz", pass: "app-password", from: "Astir <noreply@example.uz>", otp_text: "Код: {code} ({minutes} мин)" });
  assert.equal(config.smtp.port, 465, "port cast to a number");
  assert.equal(config.smtp.secure, true, "secure cast to a boolean");
  assert.equal(smtpConfigured(config.smtp), true);
  assert.notEqual(stored.get("pass").value, "app-password", "password stored encrypted");
  assert.deepEqual(otpMessage(config.smtp, "482915", 10), { subject: "Код подтверждения Astir", text: "Код: 482915 (10 мин)" });
  await assert.rejects(mail.saveSettings("email", { otp_text: "no placeholder" }), (error) => error.statusCode === 400);
  await assert.rejects(mail.saveSettings("email", { port: "abc" }), (error) => error.statusCode === 400);
  assert.equal(mail.settingsFor("email").find((field) => field.key === "pass").value, null);
  console.log("smtp settings tests passed");
}

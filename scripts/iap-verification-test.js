import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT, decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { createAppStoreClient, createGooglePlayClient } from "../app/services/storeVerifiers.js";
import { createSubscriptionService } from "../app/services/subscriptionService.js";

const BUNDLE_ID = "uz.astiranimation.astir";
const PRODUCT_ID = "astir.premium.monthly";
const DAY = 24 * 60 * 60 * 1000;

// Payloads the fake store APIs return. Signature is irrelevant: the server
// trusts these because it fetched them itself, never because the client sent them.
async function jws(payload) {
  const { privateKey } = await generateKeyPair("ES256");

  return await new SignJWT(payload).setProtectedHeader({ alg: "ES256" }).sign(privateKey);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function memoryRepositories() {
  const rows = new Map();

  return {
    parents: {
      async findById() { return null; },
      async update() { return null; }
    },
    subscriptions: {
      async create(attributes) {
        const row = { id: randomUUID(), ...attributes };
        rows.set(row.id, row);
        return row;
      },
      async update(id, attributes) {
        const row = { ...rows.get(id), ...attributes };
        rows.set(id, row);
        return row;
      },
      async findById(id) { return rows.get(id) || null; },
      async findByProviderSubscriptionId(provider, providerSubscriptionId) {
        return [...rows.values()].find((row) => row.provider === provider
          && row.providerSubscriptionId === providerSubscriptionId) || null;
      },
      async listByParentId(parentId) { return [...rows.values()].filter((row) => row.parentId === parentId); }
    },
    tariffs: {
      findById(id) {
        return id === "premium"
          ? { id: "premium", title: {}, description: {}, can_watch_premium: true, duration_days: 30, price_cents: 0 }
          : null;
      }
    },
    transactions: (() => {
      const payments = [];
      return {
        payments,
        async findByProviderRef(provider, ref) { return payments.find((row) => row.provider === provider && row.provider_ref === ref) || null; },
        async create(attributes) { const row = { id: `tx-${payments.length + 1}`, ...attributes }; payments.push(row); return row; }
      };
    })()
  };
}

async function expectError(promise, statusCode, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode, error.message);
    assert.equal(error.code, code);
    return true;
  });
}

const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const appleConfig = {
  bundleId: BUNDLE_ID,
  issuerId: "issuer-123",
  keyId: "KEY123",
  privateKey: await exportPKCS8(privateKey),
  environment: "auto",
  products: { [PRODUCT_ID]: "premium" }
};
const appleTransactions = new Map();
const appleRequests = [];

let unreleasedApp = false;

async function appleFetch(url, options) {
  const { pathname, origin } = new URL(url);
  const token = options.headers.authorization.replace("Bearer ", "");
  appleRequests.push({ origin, pathname, token });

  // Production does not know sandbox transactions; the client must fall back.
  const id = decodeURIComponent(pathname.split("/").pop());
  // An app that isn't released yet: production rejects the key with 401.
  if (unreleasedApp && !origin.includes("sandbox")) return jsonResponse(401, {});
  const transaction = appleTransactions.get(id);

  if (!transaction || transaction.environment !== (origin.includes("sandbox") ? "Sandbox" : "Production")) {
    return jsonResponse(404, { errorCode: 4040010 });
  }

  if (pathname.startsWith("/inApps/v1/transactions/")) {
    return jsonResponse(200, { signedTransactionInfo: await jws(transaction) });
  }

  return jsonResponse(200, {
    data: [{
      lastTransactions: [{
        originalTransactionId: transaction.originalTransactionId,
        status: transaction.statusCode,
        signedTransactionInfo: await jws(transaction)
      }]
    }]
  });
}

function appleTransaction(overrides = {}) {
  const id = String(Math.floor(Math.random() * 1e12));
  const transaction = {
    transactionId: id,
    originalTransactionId: id,
    bundleId: BUNDLE_ID,
    productId: PRODUCT_ID,
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 30 * DAY,
    environment: "Production",
    statusCode: 1,
    ...overrides
  };
  appleTransactions.set(transaction.transactionId, transaction);
  return transaction;
}

const repos = memoryRepositories();
const googlePurchases = new Map();
const googleAcks = [];
const service = createSubscriptionService({
  ...repos,
  config: { appleIap: appleConfig, googlePlay: { packageName: "com.turgunovtech.astir_mobile", products: { [PRODUCT_ID]: "premium" } } },
  appStore: createAppStoreClient(appleConfig, { fetchImpl: appleFetch }),
  googlePlay: createGooglePlayClient(
    { packageName: "com.turgunovtech.astir_mobile" },
    {
      accessTokenProvider: async () => "google-token",
      fetchImpl: async (url, options) => {
        const { pathname } = new URL(url);

        if (pathname.endsWith(":acknowledge")) {
          googleAcks.push(pathname);
          return new Response("", { status: 200 });
        }

        const token = decodeURIComponent(pathname.split("/").pop());
        return googlePurchases.has(token) ? jsonResponse(200, googlePurchases.get(token)) : jsonResponse(404, {});
      }
    }
  )
});
const parent = { id: randomUUID() };
const otherParent = { id: randomUUID() };

// 1. Valid Apple purchase: tariff and expiry come from Apple, not the client.
const valid = appleTransaction({ appAccountToken: parent.id });
const result = await service.verifyApplePurchase(parent, { transactionId: valid.transactionId });
assert.equal(result.subscription.provider, "apple");
assert.equal(result.subscription.providerSubscriptionId, valid.originalTransactionId);
assert.equal(result.subscription.status, "active");
assert.equal(result.subscription.expiresAt, new Date(valid.expiresDate).toISOString());
assert.equal(result.tariff.id, "premium");
assert.equal(result.access.can_watch_premium, true);

// The App Store Server API request is authenticated with an ES256 JWT.
const { token } = appleRequests.at(-1);
assert.equal(decodeProtectedHeader(token).kid, "KEY123");
const { payload } = await jwtVerify(token, publicKey, { audience: "appstoreconnect-v1", issuer: "issuer-123" });
assert.equal(payload.bid, BUNDLE_ID);

// 1b. Each App Store charge is a payment for the revenue: once, in the
// currency paid; sandbox charges don't count as revenue.
{
  const paid = appleTransaction({ appAccountToken: parent.id, price: 4990, currency: "USD" });
  await service.verifyApplePurchase(parent, { transactionId: paid.transactionId });
  await service.verifyApplePurchase(parent, { transactionId: paid.transactionId });
  const rows = repos.transactions.payments.filter((row) => row.provider_ref === paid.transactionId);
  assert.equal(rows.length, 1, "recorded once");
  assert.equal(rows[0].amount_cents, 499);
  assert.equal(rows[0].currency, "USD");
  assert.equal(rows[0].status, "succeeded");
  const test = appleTransaction({ appAccountToken: parent.id, environment: "Sandbox", price: 1990, currency: "USD" });
  await service.verifyApplePurchase(parent, { transactionId: test.transactionId });
  assert.equal(repos.transactions.payments.find((row) => row.provider_ref === test.transactionId).status, "sandbox");
}

// 2. The signed transaction from StoreKit is accepted as an id carrier only.
const viaJws = await service.verifyApplePurchase(parent, { signedTransaction: await jws({ transactionId: valid.transactionId }) });
assert.equal(viaJws.subscription.id, result.subscription.id);

// 3. A forged JWS pointing to a transaction Apple does not know is rejected.
await expectError(
  service.verifyApplePurchase(parent, { signedTransaction: await jws({ transactionId: "999", expiresDate: Date.now() + 365 * DAY }) }),
  400,
  "APPLE_TRANSACTION_NOT_FOUND"
);

// 4. Sandbox purchases (TestFlight / App Review) are found after production 404.
const sandbox = appleTransaction({ environment: "Sandbox" });
assert.equal((await service.verifyApplePurchase(parent, { transactionId: sandbox.transactionId })).subscription.status, "active");

// 4b. Before release production answers 401; sandbox purchases still verify.
unreleasedApp = true;
const beforeRelease = appleTransaction({ environment: "Sandbox" });
assert.equal((await service.verifyApplePurchase(parent, { transactionId: beforeRelease.transactionId })).subscription.status, "active");
unreleasedApp = false;

// 5. Another app's transaction, unknown product, other account's token, reuse.
await expectError(
  service.verifyApplePurchase(parent, { transactionId: appleTransaction({ bundleId: "com.other.app" }).transactionId }),
  400,
  "APPLE_BUNDLE_MISMATCH"
);
await expectError(
  service.verifyApplePurchase(parent, { transactionId: appleTransaction({ productId: "unknown.product" }).transactionId }),
  400,
  "UNKNOWN_STORE_PRODUCT"
);
await expectError(
  service.verifyApplePurchase(otherParent, { transactionId: valid.transactionId }),
  403,
  "PURCHASE_ACCOUNT_MISMATCH"
);
const shared = appleTransaction();
await service.verifyApplePurchase(parent, { transactionId: shared.transactionId });
await expectError(
  service.verifyApplePurchase(otherParent, { transactionId: shared.transactionId }),
  409,
  "PURCHASE_BELONGS_TO_ANOTHER_ACCOUNT"
);

// 6. Expired and refunded purchases never grant access.
const expired = await service.verifyApplePurchase(parent, {
  transactionId: appleTransaction({ expiresDate: Date.now() - DAY }).transactionId
});
assert.equal(expired.subscription.status, "expired");
assert.equal(expired.access.can_watch_premium, false);
const revoked = await service.verifyApplePurchase(parent, {
  transactionId: appleTransaction({ revocationDate: Date.now() }).transactionId
});
assert.equal(revoked.subscription.status, "cancelled");
assert.equal(revoked.access.can_watch_premium, false);

// 7. Notifications: state is re-fetched from Apple, payload claims are ignored.
appleTransactions.set(valid.transactionId, { ...valid, statusCode: 5, revocationDate: Date.now() });
const notification = await service.applyAppleNotification({
  signedPayload: await jws({
    notificationType: "REFUND",
    data: { signedTransactionInfo: await jws({ originalTransactionId: valid.originalTransactionId, status: "active" }) }
  })
});
assert.equal(notification.subscription.status, "cancelled");
await expectError(service.applyAppleNotification({ status: "active" }), 400, "VALIDATION_ERROR");

// 8. Missing credentials fail closed.
const unconfigured = createSubscriptionService({
  ...memoryRepositories(),
  config: {},
  appStore: createAppStoreClient({}),
  googlePlay: createGooglePlayClient({})
});
await expectError(unconfigured.verifyApplePurchase(parent, { transactionId: "1" }), 503, "APPLE_IAP_NOT_CONFIGURED");
await expectError(unconfigured.verifyGooglePurchase(parent, { purchaseToken: "t" }), 503, "GOOGLE_PLAY_NOT_CONFIGURED");

// 9. Google Play: verified via subscriptionsv2, acknowledged, refreshed by RTDN.
googlePurchases.set("token-1", {
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  latestOrderId: "GPA.1",
  lineItems: [{ productId: PRODUCT_ID, expiryTime: new Date(Date.now() + 30 * DAY).toISOString() }],
  externalAccountIdentifiers: { obfuscatedExternalAccountId: parent.id }
});
const google = await service.verifyGooglePurchase(parent, { purchaseToken: "token-1" });
assert.equal(google.subscription.status, "active");
assert.equal(google.access.can_watch_premium, true);
assert.equal(googleAcks.length, 1);
await expectError(service.verifyGooglePurchase(parent, { purchaseToken: "forged" }), 400, "GOOGLE_PURCHASE_NOT_FOUND");
await expectError(service.verifyGooglePurchase(otherParent, { purchaseToken: "token-1" }), 403, "PURCHASE_ACCOUNT_MISMATCH");

googlePurchases.set("token-1", { ...googlePurchases.get("token-1"), subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" });
const rtdn = await service.applyGoogleNotification({
  message: { data: Buffer.from(JSON.stringify({ subscriptionNotification: { purchaseToken: "token-1" } })).toString("base64") }
});
assert.equal(rtdn.subscription.status, "expired");

console.log("IAP verification tests passed");

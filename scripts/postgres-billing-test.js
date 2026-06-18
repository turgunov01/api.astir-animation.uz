import assert from "node:assert/strict";
import { createRepositories } from "../app/repositories/index.js";

const parentId = "10000000-0000-4000-8000-000000000001";
const subscriptionId = "20000000-0000-4000-8000-000000000002";
const transactionId = "30000000-0000-4000-8000-000000000003";
const calls = [];

function subscriptionRow(overrides = {}) {
  return {
    id: subscriptionId,
    parent_id: parentId,
    tariff_id: "premium",
    provider: "click",
    provider_subscription_id: "click:123",
    status: "active",
    started_at: "2026-06-01T00:00:00.000Z",
    expires_at: "2026-07-01T00:00:00.000Z",
    provider_payload: { source: "test" },
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

function transactionRow(overrides = {}) {
  return {
    id: transactionId,
    parent_id: parentId,
    tariff_id: "premium",
    subscription_id: overrides.subscription_id ?? null,
    provider: "click",
    provider_ref: overrides.provider_ref ?? null,
    kind: "subscription",
    status: overrides.status || "pending",
    amount: "49000.00",
    amount_cents: 4900000,
    currency: "UZS",
    description: "Click checkout for premium",
    checkout_url: overrides.checkout_url || null,
    click_trans_id: overrides.click_trans_id || null,
    click_paydoc_id: overrides.click_paydoc_id || null,
    merchant_prepare_id: overrides.merchant_prepare_id || null,
    merchant_confirm_id: overrides.merchant_confirm_id || null,
    expires_at: "2026-07-01T00:00:00.000Z",
    processed_at: overrides.processed_at || null,
    provider_payload: overrides.provider_payload || null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z"
  };
}

const db = {
  async one(sql, params = []) {
    calls.push({ method: "one", sql, params });

    if (/INSERT INTO v1_subscriptions/.test(sql)) {
      return subscriptionRow({
        parent_id: params[0],
        tariff_id: params[1],
        provider: params[2],
        provider_subscription_id: params[3],
        status: params[4],
        started_at: params[5],
        expires_at: params[6],
        provider_payload: params[7]
      });
    }

    if (/UPDATE v1_subscriptions/.test(sql)) {
      return subscriptionRow({ status: "expired" });
    }

    if (/FROM v1_subscriptions WHERE provider = \$1/.test(sql)) {
      return subscriptionRow({
        provider: params[0],
        provider_subscription_id: params[1]
      });
    }

    if (/INSERT INTO v1_transactions/.test(sql)) {
      return transactionRow({
        parent_id: params[0],
        tariff_id: params[1],
        provider: params[2],
        provider_ref: params[3],
        kind: params[4],
        status: params[5],
        amount: params[6],
        amount_cents: params[7],
        currency: params[8],
        description: params[9],
        expires_at: params[10],
        provider_payload: params[11]
      });
    }

    if (/UPDATE v1_transactions/.test(sql)) {
      return transactionRow({
        status: "succeeded",
        subscription_id: subscriptionId,
        provider_ref: "123",
        merchant_confirm_id: 999
      });
    }

    if (/FROM v1_transactions WHERE id = \$1/.test(sql)) {
      return transactionRow();
    }

    throw new Error(`unexpected one query: ${sql}`);
  },

  async many(sql, params = []) {
    calls.push({ method: "many", sql, params });

    if (/FROM v1_subscriptions/.test(sql)) {
      return [subscriptionRow()];
    }

    if (/FROM v1_transactions/.test(sql)) {
      return [transactionRow()];
    }

    throw new Error(`unexpected many query: ${sql}`);
  },

  async query() {
    throw new Error("query should not be used by billing repositories");
  }
};

const repositories = createRepositories({}, { billingDb: db });

const createdSubscription = await repositories.subscriptions.create({
  parentId,
  tariffId: "premium",
  provider: "click",
  providerSubscriptionId: "click:123",
  status: "active",
  startedAt: "2026-06-01T00:00:00.000Z",
  expiresAt: "2026-07-01T00:00:00.000Z",
  providerPayload: { source: "test" }
});

assert.equal(createdSubscription.parentId, parentId);
assert.equal(createdSubscription.tariffId, "premium");
assert.equal(createdSubscription.providerSubscriptionId, "click:123");
assert.match(calls.at(-1).sql, /INSERT INTO v1_subscriptions/);

const foundSubscription = await repositories.subscriptions.findByProviderSubscriptionId("click", "click:123");

assert.equal(foundSubscription.id, subscriptionId);
assert.match(calls.at(-1).sql, /FROM v1_subscriptions WHERE provider = \$1/);

const updatedSubscription = await repositories.subscriptions.update(subscriptionId, {
  status: "expired"
});

assert.equal(updatedSubscription.status, "expired");
assert.match(calls.at(-1).sql, /UPDATE v1_subscriptions/);

const createdTransaction = await repositories.transactions.create({
  parentId,
  tariffId: "premium",
  provider: "click",
  kind: "subscription",
  status: "pending",
  amount: "49000.00",
  amount_cents: 4900000,
  currency: "UZS",
  description: "Click checkout for premium",
  expiresAt: "2026-07-01T00:00:00.000Z"
});

assert.equal(createdTransaction.id, transactionId);
assert.equal(createdTransaction.parentId, parentId);
assert.equal(createdTransaction.tariffId, "premium");
assert.match(calls.at(-1).sql, /INSERT INTO v1_transactions/);

const updatedTransaction = await repositories.transactions.update(transactionId, {
  status: "succeeded",
  subscriptionId,
  provider_ref: "123",
  merchant_confirm_id: 999
});

assert.equal(updatedTransaction.status, "succeeded");
assert.equal(updatedTransaction.subscription_id, subscriptionId);
assert.match(calls.at(-1).sql, /UPDATE v1_transactions/);

console.log("PostgreSQL billing repositories test passed");

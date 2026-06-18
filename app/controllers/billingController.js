import { optionalString, requiredString } from "../lib/validation.js";

function firstString(body, ...fields) {
  for (const field of fields) {
    const value = optionalString(body, field);

    if (value) {
      return value;
    }
  }

  return null;
}

function firstValue(body, ...fields) {
  for (const field of fields) {
    const value = body?.[field];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function purchasePayload(body, requiredPurchaseField) {
  const normalized = {
    tariff_id: firstString(body, "tariff_id", "tariffId"),
    expires_at: firstString(body, "expires_at", "expiresAt"),
    provider_subscription_id: firstString(body, "provider_subscription_id", "providerSubscriptionId", "subscription_id", "subscriptionId"),
    original_transaction_id: firstString(body, "original_transaction_id", "originalTransactionId"),
    transaction_id: firstString(body, "transaction_id", "transactionId"),
    product_id: firstString(body, "product_id", "productId"),
    purchase_token: firstString(body, "purchase_token", "purchaseToken"),
    receipt: firstString(body, "receipt", "receipt_data", "receiptData")
  };

  const payload = {
    tariff_id: requiredString(normalized, "tariff_id"),
    expires_at: normalized.expires_at,
    provider_subscription_id: normalized.provider_subscription_id,
    original_transaction_id: normalized.original_transaction_id,
    transaction_id: normalized.transaction_id,
    product_id: normalized.product_id,
    purchase_token: normalized.purchase_token,
    receipt: normalized.receipt
  };

  payload[requiredPurchaseField] = requiredString(normalized, requiredPurchaseField);

  return payload;
}

export function createBillingController({ subscriptionService }) {
  return {
    async clickCheckout(request, response) {
      response.status(201).json(await subscriptionService.createClickCheckout(request.parent, {
        amount: firstValue(request.body || {}, "amount", "amount_uzs", "amountUzs"),
        cardType: firstString(request.body || {}, "card_type", "cardType"),
        expiresAt: firstString(request.body || {}, "expires_at", "expiresAt"),
        returnUrl: firstString(request.body || {}, "return_url", "returnUrl"),
        tariffId: requiredString({
          tariff_id: firstString(request.body || {}, "tariff_id", "tariffId", "plan_id", "planId")
        }, "tariff_id")
      }));
    },

    async currentSubscription(request, response) {
      response.json(await subscriptionService.currentForActor(request.actor));
    },

    async clickTransaction(request, response) {
      response.json(await subscriptionService.getClickTransaction(request.parent, request.params.transactionId));
    },

    async clickComplete(request, response) {
      response.json(await subscriptionService.handleClickComplete(request.body || {}));
    },

    async clickPrepare(request, response) {
      response.json(await subscriptionService.handleClickPrepare(request.body || {}));
    },

    async googleWebhook(request, response) {
      response.json(await subscriptionService.applyWebhook("google", request.body || {}));
    },

    async verifyApple(request, response) {
      response.status(201).json(await subscriptionService.verifyApplePurchase(
        request.parent,
        purchasePayload(request.body, "receipt")
      ));
    },

    async verifyGoogle(request, response) {
      response.status(201).json(await subscriptionService.verifyGooglePurchase(
        request.parent,
        purchasePayload(request.body, "purchase_token")
      ));
    },

    async appleWebhook(request, response) {
      response.json(await subscriptionService.applyWebhook("apple", request.body || {}));
    }
  };
}

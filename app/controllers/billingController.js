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
    currentSubscription(request, response) {
      response.json(subscriptionService.currentForActor(request.actor));
    },

    googleWebhook(request, response) {
      response.json(subscriptionService.applyWebhook("google", request.body || {}));
    },

    verifyApple(request, response) {
      response.status(201).json(subscriptionService.verifyApplePurchase(
        request.parent,
        purchasePayload(request.body, "receipt")
      ));
    },

    verifyGoogle(request, response) {
      response.status(201).json(subscriptionService.verifyGooglePurchase(
        request.parent,
        purchasePayload(request.body, "purchase_token")
      ));
    },

    appleWebhook(request, response) {
      response.json(subscriptionService.applyWebhook("apple", request.body || {}));
    }
  };
}

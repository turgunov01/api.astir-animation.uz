import { optionalString, requiredString } from "../lib/validation.js";

function purchasePayload(body, requiredPurchaseField) {
  const payload = {
    tariff_id: requiredString(body, "tariff_id"),
    expires_at: optionalString(body, "expires_at"),
    provider_subscription_id: optionalString(body, "provider_subscription_id"),
    original_transaction_id: optionalString(body, "original_transaction_id"),
    transaction_id: optionalString(body, "transaction_id"),
    product_id: optionalString(body, "product_id"),
    purchase_token: optionalString(body, "purchase_token"),
    receipt: optionalString(body, "receipt")
  };

  payload[requiredPurchaseField] = requiredString(body, requiredPurchaseField);

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

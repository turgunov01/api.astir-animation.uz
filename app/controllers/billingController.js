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

// Only identifiers are read from the client. Tariff, expiry and status come
// from the store API (see subscriptionService.verify*Purchase).
function applePurchasePayload(body = {}) {
  return {
    transactionId: firstString(body, "transaction_id", "transactionId"),
    signedTransaction: firstString(body, "signed_transaction", "signedTransaction", "jws_representation", "jwsRepresentation")
  };
}

function googlePurchasePayload(body = {}) {
  return {
    productId: firstString(body, "product_id", "productId"),
    purchaseToken: requiredString({
      purchase_token: firstString(body, "purchase_token", "purchaseToken")
    }, "purchase_token")
  };
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
      response.json(await subscriptionService.applyGoogleNotification(request.body || {}));
    },

    async verifyApple(request, response) {
      response.status(201).json(await subscriptionService.verifyApplePurchase(
        request.parent,
        applePurchasePayload(request.body)
      ));
    },

    async verifyGoogle(request, response) {
      response.status(201).json(await subscriptionService.verifyGooglePurchase(
        request.parent,
        googlePurchasePayload(request.body)
      ));
    },

    async appleWebhook(request, response) {
      response.json(await subscriptionService.applyAppleNotification(request.body || {}));
    }
  };
}

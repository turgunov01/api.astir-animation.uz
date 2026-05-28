import { badRequest, forbidden, notFound } from "../lib/errors.js";

const activeStatuses = new Set(["active", "grace_period"]);
const allowedWebhookStatuses = new Set(["active", "grace_period", "expired", "cancelled"]);

function defaultExpiry() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function assertDate(value, field) {
  if (!value) {
    return defaultExpiry();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw badRequest(`${field} must be a valid date`, "VALIDATION_ERROR");
  }

  return date.toISOString();
}

function serializeSubscription(subscription) {
  if (!subscription) {
    return null;
  }

  return {
    id: subscription.id,
    parentId: subscription.parentId,
    tariffId: subscription.tariffId,
    provider: subscription.provider,
    providerSubscriptionId: subscription.providerSubscriptionId,
    status: subscription.status,
    startedAt: subscription.startedAt,
    expiresAt: subscription.expiresAt,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt
  };
}

function serializeTariff(tariff) {
  return {
    id: tariff.id,
    code: tariff.id,
    title: { ...tariff.title },
    description: { ...tariff.description },
    is_default: Boolean(tariff.is_default),
    can_watch_premium: Boolean(tariff.can_watch_premium),
    createdAt: tariff.createdAt,
    updatedAt: tariff.updatedAt
  };
}

function isSubscriptionActive(subscription) {
  if (!subscription || !activeStatuses.has(subscription.status)) {
    return false;
  }

  return new Date(subscription.expiresAt).getTime() > Date.now();
}

export function createSubscriptionService({ parents, subscriptions, tariffs }) {
  function parentFromActor(actor) {
    if (actor?.type === "parent" && actor.parent) {
      return parents.findById(actor.parent.id) || actor.parent;
    }

    if (actor?.type === "device" && actor.device?.parentId) {
      const parent = parents.findById(actor.device.parentId);

      if (parent) {
        return parent;
      }
    }

    throw forbidden("Subscription owner was not found", "SUBSCRIPTION_OWNER_NOT_FOUND");
  }

  function getTariff(tariffId) {
    const tariff = tariffs.findById(tariffId);

    if (!tariff) {
      throw notFound("Tariff not found", "TARIFF_NOT_FOUND");
    }

    return tariff;
  }

  function latestActiveForParent(parentId) {
    const activeSubscriptions = subscriptions.listByParentId(parentId)
      .filter(isSubscriptionActive)
      .sort((left, right) => new Date(right.expiresAt).getTime() - new Date(left.expiresAt).getTime());

    return activeSubscriptions[0] || null;
  }

  function upsertVerifiedSubscription(parent, {
    expiresAt,
    provider,
    providerPayload,
    providerSubscriptionId,
    tariffId
  }) {
    getTariff(tariffId);

    const now = new Date().toISOString();
    const attributes = {
      parentId: parent.id,
      tariffId,
      provider,
      providerSubscriptionId,
      status: "active",
      startedAt: now,
      expiresAt: assertDate(expiresAt, "expires_at"),
      providerPayload
    };
    const existingSubscription = subscriptions.findByProviderSubscriptionId(provider, providerSubscriptionId);

    if (existingSubscription) {
      return subscriptions.update(existingSubscription.id, attributes);
    }

    return subscriptions.create(attributes);
  }

  function findWebhookSubscription(provider, body) {
    if (body.subscription_id) {
      return subscriptions.findById(body.subscription_id);
    }

    const providerSubscriptionId = body.provider_subscription_id
      || body.original_transaction_id
      || body.transaction_id
      || body.purchase_token;

    if (!providerSubscriptionId) {
      throw badRequest("provider_subscription_id is required", "VALIDATION_ERROR");
    }

    return subscriptions.findByProviderSubscriptionId(provider, providerSubscriptionId);
  }

  function verifyPurchase(parent, provider, body) {
    const providerSubscriptionId = body.provider_subscription_id
      || body.original_transaction_id
      || body.transaction_id
      || body.purchase_token;

    if (!providerSubscriptionId) {
      throw badRequest("provider_subscription_id is required", "VALIDATION_ERROR");
    }

    const subscription = upsertVerifiedSubscription(parent, {
      expiresAt: body.expires_at,
      provider,
      providerPayload: body.provider_payload || null,
      providerSubscriptionId,
      tariffId: body.tariff_id
    });
    const tariff = getTariff(subscription.tariffId);

    return {
      subscription: serializeSubscription(subscription),
      tariff: serializeTariff(tariff),
      access: {
        can_watch_premium: Boolean(tariff.can_watch_premium)
      }
    };
  }

  return {
    activeForParent(parentId) {
      return latestActiveForParent(parentId);
    },

    applyWebhook(provider, body) {
      const subscription = findWebhookSubscription(provider, body);

      if (!subscription) {
        return {
          accepted: true,
          subscription: null
        };
      }

      const status = body.status || subscription.status;

      if (!allowedWebhookStatuses.has(status)) {
        throw badRequest("status is not supported", "VALIDATION_ERROR");
      }

      const updatedSubscription = subscriptions.update(subscription.id, {
        status,
        expiresAt: assertDate(body.expires_at || subscription.expiresAt, "expires_at"),
        providerPayload: body.provider_payload || subscription.providerPayload || null
      });

      return {
        accepted: true,
        subscription: serializeSubscription(updatedSubscription)
      };
    },

    currentForParent(parent) {
      return {
        subscription: serializeSubscription(latestActiveForParent(parent.id))
      };
    },

    currentForActor(actor) {
      return {
        subscription: serializeSubscription(latestActiveForParent(parentFromActor(actor).id))
      };
    },

    listByTariffId(tariffId) {
      return subscriptions.listByTariffId(tariffId);
    },

    serializeSubscription,

    verifyApplePurchase(parent, body) {
      if (!body.receipt) {
        throw badRequest("receipt is required", "VALIDATION_ERROR");
      }

      return verifyPurchase(parent, "apple", {
        ...body,
        provider_payload: {
          receipt: body.receipt
        }
      });
    },

    verifyGooglePurchase(parent, body) {
      if (!body.purchase_token) {
        throw badRequest("purchase_token is required", "VALIDATION_ERROR");
      }

      return verifyPurchase(parent, "google", {
        ...body,
        provider_subscription_id: body.provider_subscription_id || body.purchase_token,
        provider_payload: {
          product_id: body.product_id || null,
          purchase_token: body.purchase_token
        }
      });
    }
  };
}

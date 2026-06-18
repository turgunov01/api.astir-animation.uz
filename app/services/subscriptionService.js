import { createHash } from "node:crypto";
import { badRequest, forbidden, notFound } from "../lib/errors.js";

const activeStatuses = new Set(["active", "grace_period"]);
const allowedWebhookStatuses = new Set(["active", "grace_period", "expired", "cancelled"]);
const clickSuccess = { error: 0, error_note: "Success" };
const clickErrors = {
  signFailed: { error: -1, error_note: "SIGN CHECK FAILED!" },
  incorrectAmount: { error: -2, error_note: "Incorrect parameter amount" },
  actionNotFound: { error: -3, error_note: "Action not found" },
  alreadyPaid: { error: -4, error_note: "Already paid" },
  notFound: { error: -5, error_note: "User does not exist" },
  transactionNotFound: { error: -6, error_note: "Transaction does not exist" },
  requestError: { error: -8, error_note: "Error in request from click" },
  cancelled: { error: -9, error_note: "Transaction cancelled" }
};

function defaultExpiry() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function expiryAfterDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
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

function serializeTransaction(transaction) {
  if (!transaction) {
    return null;
  }

  return {
    id: transaction.id,
    parentId: transaction.parentId,
    user_id: transaction.parentId,
    tariffId: transaction.tariffId,
    plan_id: transaction.tariffId,
    subscription_id: transaction.subscriptionId || transaction.subscription_id || null,
    provider: transaction.provider,
    provider_ref: transaction.provider_ref || null,
    kind: transaction.kind,
    status: transaction.status,
    amount: transaction.amount,
    amount_cents: transaction.amount_cents,
    currency: transaction.currency,
    description: transaction.description || null,
    checkout_url: transaction.checkout_url || null,
    click_trans_id: transaction.click_trans_id || null,
    click_paydoc_id: transaction.click_paydoc_id || null,
    merchant_prepare_id: transaction.merchant_prepare_id || null,
    processed_at: transaction.processed_at || null,
    created_at: transaction.createdAt,
    updated_at: transaction.updatedAt,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt
  };
}

function isSubscriptionActive(subscription) {
  if (!subscription || !activeStatuses.has(subscription.status)) {
    return false;
  }

  return new Date(subscription.expiresAt).getTime() > Date.now();
}

function md5(value) {
  return createHash("md5").update(String(value)).digest("hex");
}

function amountCents(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100);
}

function amountString(value) {
  return (amountCents(value) / 100).toFixed(2);
}

function moneyStringFromCents(cents) {
  return (cents / 100).toFixed(2);
}

function tariffPriceCents(tariff) {
  const priceCents = Number(tariff.price_cents);

  return Number.isFinite(priceCents) && priceCents >= 0
    ? Math.round(priceCents)
    : 0;
}

function serializeTariff(tariff) {
  const priceCents = tariffPriceCents(tariff);

  return {
    id: tariff.id,
    code: tariff.id,
    title: { ...tariff.title },
    description: { ...tariff.description },
    is_default: Boolean(tariff.is_default),
    can_watch_premium: Boolean(tariff.can_watch_premium),
    duration_days: Number(tariff.duration_days) || 30,
    max_children: Number(tariff.max_children) || 1,
    features: Array.isArray(tariff.features) ? tariff.features : [],
    price: moneyStringFromCents(priceCents),
    price_cents: priceCents,
    currency: tariff.currency || "UZS",
    createdAt: tariff.createdAt,
    updatedAt: tariff.updatedAt
  };
}

function clickBodyValue(body, field) {
  const value = body?.[field];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function clickString(body, field) {
  const value = clickBodyValue(body, field);

  return value === undefined || value === null ? "" : String(value);
}

function clickNumber(body, field) {
  const value = Number(clickBodyValue(body, field));

  return Number.isFinite(value) ? value : null;
}

function clickPrepareSign(body, secretKey) {
  return md5(
    `${clickString(body, "click_trans_id")}`
    + `${clickString(body, "service_id")}`
    + `${secretKey}`
    + `${clickString(body, "merchant_trans_id")}`
    + `${clickString(body, "amount")}`
    + `${clickString(body, "action")}`
    + `${clickString(body, "sign_time")}`
  );
}

function clickCompleteSign(body, secretKey) {
  return md5(
    `${clickString(body, "click_trans_id")}`
    + `${clickString(body, "service_id")}`
    + `${secretKey}`
    + `${clickString(body, "merchant_trans_id")}`
    + `${clickString(body, "merchant_prepare_id")}`
    + `${clickString(body, "amount")}`
    + `${clickString(body, "action")}`
    + `${clickString(body, "sign_time")}`
  );
}

function clickResponse(base, body, transaction = null, extra = {}) {
  return {
    click_trans_id: clickNumber(body, "click_trans_id") || clickString(body, "click_trans_id"),
    merchant_trans_id: clickString(body, "merchant_trans_id"),
    ...extra,
    ...base,
    ...(transaction ? {
      transaction: serializeTransaction(transaction)
    } : {})
  };
}

function nextClickLocalId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9));
}

export function createSubscriptionService({ config, parents, subscriptions, tariffs, transactions }) {
  async function parentFromActor(actor) {
    if (actor?.type === "parent" && actor.parent) {
      return await parents.findById(actor.parent.id) || actor.parent;
    }

    if (actor?.type === "device" && actor.device?.parentId) {
      const parent = await parents.findById(actor.device.parentId);

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

  function clickConfig() {
    return config?.click || {};
  }

  function assertClickCheckoutConfig() {
    const click = clickConfig();

    if (!click.merchantId || !click.serviceId) {
      throw badRequest("CLICK_MERCHANT_ID and CLICK_SERVICE_ID are required", "CLICK_CONFIG_MISSING");
    }

    return click;
  }

  function assertClickCallbackConfig() {
    const click = clickConfig();

    if (!click.serviceId || !click.secretKey) {
      throw badRequest("CLICK_SERVICE_ID and CLICK_SECRET_KEY are required", "CLICK_CONFIG_MISSING");
    }

    return click;
  }

  function buildClickPaymentUrl(transaction, { cardType = "", returnUrl = "" } = {}) {
    const click = assertClickCheckoutConfig();
    const url = new URL(click.paymentUrl || "https://my.click.uz/services/pay");

    url.searchParams.set("service_id", click.serviceId);
    url.searchParams.set("merchant_id", click.merchantId);
    url.searchParams.set("amount", amountString(transaction.amount));
    url.searchParams.set("transaction_param", transaction.id);

    if (click.merchantUserId) {
      url.searchParams.set("merchant_user_id", click.merchantUserId);
    }

    if (returnUrl || click.returnUrl) {
      url.searchParams.set("return_url", returnUrl || click.returnUrl);
    }

    if (cardType) {
      url.searchParams.set("card_type", cardType);
    }

    return url.toString();
  }

  function getClickTransaction(merchantTransId) {
    return transactions.findById(merchantTransId);
  }

  async function transactionParent(transaction) {
    const parent = await parents.findById(transaction.parentId);

    if (!parent) {
      throw notFound("Parent account no longer exists", "PARENT_NOT_FOUND");
    }

    return parent;
  }

  function clickAmountMatches(transaction, body) {
    return amountCents(clickString(body, "amount")) === transaction.amount_cents;
  }

  function clickServiceMatches(body) {
    return clickString(body, "service_id") === String(clickConfig().serviceId);
  }

  async function activateClickTransaction(transaction, body) {
    const parent = await transactionParent(transaction);
    const providerSubscriptionId = `click:${clickString(body, "click_trans_id")}`;
    const subscription = upsertVerifiedSubscription(parent, {
      expiresAt: transaction.expiresAt,
      provider: "click",
      providerPayload: {
        click_trans_id: clickString(body, "click_trans_id"),
        click_paydoc_id: clickString(body, "click_paydoc_id"),
        merchant_trans_id: transaction.id
      },
      providerSubscriptionId,
      tariffId: transaction.tariffId
    });
    await parents.update?.(parent.id, { tariff: transaction.tariffId });
    const confirmId = transaction.merchant_confirm_id || nextClickLocalId();

    return {
      subscription,
      transaction: transactions.update(transaction.id, {
        status: "succeeded",
        subscriptionId: subscription.id,
        subscription_id: subscription.id,
        provider_ref: clickString(body, "click_trans_id"),
        click_trans_id: clickString(body, "click_trans_id"),
        click_paydoc_id: clickString(body, "click_paydoc_id"),
        merchant_confirm_id: confirmId,
        processed_at: new Date().toISOString(),
        provider_payload: {
          ...(transaction.provider_payload || {}),
          complete: body
        }
      })
    };
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

  async function verifyPurchase(parent, provider, body) {
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
    await parents.update?.(parent.id, { tariff: subscription.tariffId });
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

    async createClickCheckout(parent, {
      amount,
      cardType = "",
      expiresAt = "",
      returnUrl = "",
      tariffId
    }) {
      const tariff = getTariff(tariffId);
      const cents = tariffPriceCents(tariff);
      const requestedCents = amount === undefined || amount === null || amount === ""
        ? null
        : amountCents(amount);

      if (!cents || cents <= 0) {
        throw badRequest("tariff price must be greater than 0 for Click checkout", "TARIFF_PRICE_REQUIRED");
      }

      if (requestedCents === null && amount !== undefined && amount !== null && amount !== "") {
        throw badRequest("amount must be a valid number", "VALIDATION_ERROR");
      }

      if (requestedCents !== null && requestedCents !== cents) {
        throw badRequest("amount does not match tariff price", "CLICK_AMOUNT_MISMATCH");
      }

      const expiresAtValue = expiresAt
        ? assertDate(expiresAt, "expires_at")
        : expiryAfterDays(clickConfig().defaultSubscriptionDays || 30);
      const transaction = transactions.create({
        parentId: parent.id,
        tariffId: tariff.id,
        provider: "click",
        kind: "subscription",
        status: "pending",
        amount: moneyStringFromCents(cents),
        amount_cents: cents,
        currency: tariff.currency || "UZS",
        description: `Click checkout for ${tariff.id}`,
        expiresAt: expiresAtValue,
        provider_ref: null,
        provider_payload: null
      });
      const checkoutUrl = buildClickPaymentUrl(transaction, { cardType, returnUrl });
      const updatedTransaction = transactions.update(transaction.id, {
        checkout_url: checkoutUrl
      });

      return {
        checkout_url: checkoutUrl,
        payment_url: checkoutUrl,
        deeplink_url: checkoutUrl,
        transaction: serializeTransaction(updatedTransaction),
        subscription: null,
        tariff: serializeTariff(tariff)
      };
    },

    async getClickTransaction(parent, transactionId) {
      const transaction = transactions.findById(transactionId);

      if (!transaction || transaction.parentId !== parent.id || transaction.provider !== "click") {
        throw notFound("Click transaction not found", "CLICK_TRANSACTION_NOT_FOUND");
      }

      return {
        transaction: serializeTransaction(transaction),
        subscription: serializeSubscription(
          transaction.subscriptionId || transaction.subscription_id
            ? subscriptions.findById(transaction.subscriptionId || transaction.subscription_id)
            : null
        )
      };
    },

    async handleClickPrepare(body = {}) {
      const click = assertClickCallbackConfig();
      const merchantTransId = clickString(body, "merchant_trans_id");
      const transaction = getClickTransaction(merchantTransId);

      if (clickString(body, "action") !== "0") {
        return clickResponse(clickErrors.actionNotFound, body, transaction);
      }

      if (!clickServiceMatches(body) || clickString(body, "sign_string") !== clickPrepareSign(body, click.secretKey)) {
        return clickResponse(clickErrors.signFailed, body, transaction);
      }

      if (!transaction || transaction.provider !== "click") {
        return clickResponse(clickErrors.notFound, body);
      }

      if (transaction.status === "succeeded") {
        return clickResponse(clickErrors.alreadyPaid, body, transaction, {
          merchant_prepare_id: transaction.merchant_prepare_id || null
        });
      }

      if (transaction.status === "canceled") {
        return clickResponse(clickErrors.cancelled, body, transaction);
      }

      if (!clickAmountMatches(transaction, body)) {
        return clickResponse(clickErrors.incorrectAmount, body, transaction);
      }

      const prepareId = transaction.merchant_prepare_id || nextClickLocalId();
      const updatedTransaction = transactions.update(transaction.id, {
        click_trans_id: clickString(body, "click_trans_id"),
        click_paydoc_id: clickString(body, "click_paydoc_id"),
        merchant_prepare_id: prepareId,
        provider_payload: {
          ...(transaction.provider_payload || {}),
          prepare: body
        }
      });

      return clickResponse(clickSuccess, body, updatedTransaction, {
        merchant_prepare_id: prepareId
      });
    },

    async handleClickComplete(body = {}) {
      const click = assertClickCallbackConfig();
      const merchantTransId = clickString(body, "merchant_trans_id");
      const transaction = getClickTransaction(merchantTransId);

      if (clickString(body, "action") !== "1") {
        return clickResponse(clickErrors.actionNotFound, body, transaction);
      }

      if (!clickServiceMatches(body) || clickString(body, "sign_string") !== clickCompleteSign(body, click.secretKey)) {
        return clickResponse(clickErrors.signFailed, body, transaction);
      }

      if (!transaction || transaction.provider !== "click") {
        return clickResponse(clickErrors.notFound, body);
      }

      if (String(transaction.merchant_prepare_id || "") !== clickString(body, "merchant_prepare_id")) {
        return clickResponse(clickErrors.transactionNotFound, body, transaction);
      }

      if (transaction.status === "succeeded") {
        return clickResponse(clickErrors.alreadyPaid, body, transaction, {
          merchant_confirm_id: transaction.merchant_confirm_id || null
        });
      }

      if (transaction.status === "canceled") {
        return clickResponse(clickErrors.cancelled, body, transaction);
      }

      if (!clickAmountMatches(transaction, body)) {
        return clickResponse(clickErrors.incorrectAmount, body, transaction);
      }

      if ((clickNumber(body, "error") || 0) < 0) {
        const cancelledTransaction = transactions.update(transaction.id, {
          status: "canceled",
          provider_payload: {
            ...(transaction.provider_payload || {}),
            complete: body
          }
        });

        return clickResponse(clickErrors.cancelled, body, cancelledTransaction);
      }

      const result = await activateClickTransaction(transaction, body);

      return clickResponse(clickSuccess, body, result.transaction, {
        merchant_confirm_id: result.transaction.merchant_confirm_id,
        subscription: serializeSubscription(result.subscription)
      });
    },

    async applyWebhook(provider, body) {
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

    async currentForActor(actor) {
      const parent = await parentFromActor(actor);

      return {
        subscription: serializeSubscription(latestActiveForParent(parent.id))
      };
    },

    listByTariffId(tariffId) {
      return subscriptions.listByTariffId(tariffId);
    },

    serializeSubscription,

    async verifyApplePurchase(parent, body) {
      if (!body.receipt) {
        throw badRequest("receipt is required", "VALIDATION_ERROR");
      }

      return await verifyPurchase(parent, "apple", {
        ...body,
        provider_payload: {
          receipt: body.receipt
        }
      });
    },

    async verifyGooglePurchase(parent, body) {
      if (!body.purchase_token) {
        throw badRequest("purchase_token is required", "VALIDATION_ERROR");
      }

      return await verifyPurchase(parent, "google", {
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

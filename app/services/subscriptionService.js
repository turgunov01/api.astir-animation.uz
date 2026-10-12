import { createHash } from "node:crypto";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { decodeStorePayload } from "./storeVerifiers.js";

const activeStatuses = new Set(["active", "grace_period"]);
// App Store Server API subscription status codes.
const appleSubscriptionStatuses = {
  1: "active",
  2: "expired",
  3: "expired", // billing retry: no access until Apple recovers the payment
  4: "grace_period",
  5: "cancelled" // revoked (refund / family sharing removed)
};
const googleSubscriptionStates = {
  SUBSCRIPTION_STATE_ACTIVE: "active",
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace_period",
  // Auto-renew turned off; the user keeps access until expiryTime.
  SUBSCRIPTION_STATE_CANCELED: "active",
  SUBSCRIPTION_STATE_ON_HOLD: "expired",
  SUBSCRIPTION_STATE_PAUSED: "expired",
  SUBSCRIPTION_STATE_EXPIRED: "expired"
};
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

export function createSubscriptionService({
  appStore = null,
  config,
  googlePlay = null,
  notificationService = null,
  parents,
  subscriptions,
  tariffs,
  transactions
}) {
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

  async function latestActiveForParent(parentId) {
    const activeSubscriptions = (await subscriptions.listByParentId(parentId))
      .filter(isSubscriptionActive)
      .sort((left, right) => new Date(right.expiresAt).getTime() - new Date(left.expiresAt).getTime());

    return activeSubscriptions[0] || null;
  }

  async function upsertVerifiedSubscription(parent, {
    expiresAt,
    provider,
    providerPayload,
    providerSubscriptionId,
    status = "active",
    tariffId
  }) {
    getTariff(tariffId);

    const now = new Date().toISOString();
    const attributes = {
      parentId: parent.id,
      tariffId,
      provider,
      providerSubscriptionId,
      status,
      startedAt: now,
      expiresAt: assertDate(expiresAt, "expires_at"),
      providerPayload
    };
    const existingSubscription = await subscriptions.findByProviderSubscriptionId(provider, providerSubscriptionId);

    if (existingSubscription) {
      return await subscriptions.update(existingSubscription.id, attributes);
    }

    return await subscriptions.create(attributes);
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

  async function getClickTransaction(merchantTransId) {
    return await transactions.findById(merchantTransId);
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
    const subscription = await upsertVerifiedSubscription(parent, {
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
    const updatedTransaction = await transactions.update(transaction.id, {
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
    });

    await notifyPaymentActivated(parent, {
      provider: "click",
      subscription,
      tariff: getTariff(transaction.tariffId),
      transaction: updatedTransaction
    });

    return {
      subscription,
      transaction: updatedTransaction
    };
  }

  function requireStore(client, provider) {
    if (!client) {
      throw badRequest(`${provider} purchase verification is not available`, "STORE_NOT_CONFIGURED");
    }

    return client;
  }

  function tariffForProduct(provider, productId) {
    const products = (provider === "apple" ? config?.appleIap?.products : config?.googlePlay?.products) || {};
    const tariffId = products[productId];

    if (!tariffId) {
      throw badRequest(`Unknown ${provider} product: ${productId}`, "UNKNOWN_STORE_PRODUCT");
    }

    return tariffId;
  }

  // A store purchase is bound to the first account that redeems it.
  async function assertPurchaseOwner(parent, provider, providerSubscriptionId) {
    const existing = await subscriptions.findByProviderSubscriptionId(provider, providerSubscriptionId);

    if (existing && existing.parentId !== parent.id) {
      throw conflict("This purchase is already linked to another account", "PURCHASE_BELONGS_TO_ANOTHER_ACCOUNT");
    }
  }

  function assertAccountToken(parent, token) {
    if (token && String(token).toLowerCase() !== String(parent.id).toLowerCase()) {
      throw forbidden("Purchase was made for another account", "PURCHASE_ACCOUNT_MISMATCH");
    }
  }

  async function activateStorePurchase(parent, { expiresAt, provider, providerPayload, providerSubscriptionId, status, tariffId }) {
    const subscription = await upsertVerifiedSubscription(parent, {
      expiresAt,
      provider,
      providerPayload,
      providerSubscriptionId,
      status,
      tariffId
    });
    const tariff = getTariff(subscription.tariffId);

    if (isSubscriptionActive(subscription)) {
      await parents.update?.(parent.id, { tariff: subscription.tariffId });
      await notifyPaymentActivated(parent, { provider, subscription, tariff, transaction: null });
    }

    return {
      subscription: serializeSubscription(subscription),
      tariff: serializeTariff(tariff),
      access: {
        can_watch_premium: isSubscriptionActive(subscription) && Boolean(tariff.can_watch_premium)
      }
    };
  }

  // Each App Store charge (purchase or renewal) becomes a payment for the
  // revenue stats, once per transaction id, in the currency the buyer paid.
  // Sandbox charges are kept with status "sandbox" so they don't count.
  async function recordApplePayment(parentId, tariffId, transaction) {
    if (!transactions?.findByProviderRef || !transaction?.transactionId || transaction.revocationDate) return;
    const ref = String(transaction.transactionId);
    if (await transactions.findByProviderRef("apple", ref)) return;

    const tariff = getTariff(tariffId);
    const hasPrice = Number.isFinite(Number(transaction.price)) && transaction.currency;
    const cents = hasPrice ? Math.round(Number(transaction.price) / 10) : Number(tariff.price_cents) || 0;
    const sandbox = String(transaction.environment || "").toLowerCase() === "sandbox";
    await transactions.create({
      parentId,
      tariffId,
      provider: "apple",
      kind: "subscription",
      status: sandbox ? "sandbox" : "succeeded",
      amount: moneyStringFromCents(cents),
      amount_cents: cents,
      currency: hasPrice ? String(transaction.currency).toUpperCase() : tariff.currency || "UZS",
      description: `App Store ${transaction.productId}`,
      expiresAt: transaction.expiresDate ? new Date(Number(transaction.expiresDate)).toISOString() : null,
      provider_ref: ref,
      provider_payload: applePayload(transaction)
    });
  }

  function appleExpiry(transaction, tariffId) {
    if (transaction.expiresDate) {
      return new Date(Number(transaction.expiresDate)).toISOString();
    }

    // Non-renewing purchase: grant the tariff duration from the purchase date.
    const days = Number(getTariff(tariffId).duration_days) || 30;

    return new Date(Number(transaction.purchaseDate) + days * 24 * 60 * 60 * 1000).toISOString();
  }

  function appleStatus(transaction, expiresAt) {
    if (transaction.revocationDate) {
      return "cancelled";
    }

    return new Date(expiresAt).getTime() > Date.now() ? "active" : "expired";
  }

  function applePayload(transaction) {
    return {
      transaction_id: transaction.transactionId,
      original_transaction_id: transaction.originalTransactionId,
      product_id: transaction.productId,
      environment: transaction.environment || null
    };
  }

  function assertAppleBundle(transaction) {
    if (transaction.bundleId !== config?.appleIap?.bundleId) {
      throw badRequest("Transaction belongs to another app", "APPLE_BUNDLE_MISMATCH");
    }
  }

  function googleExpiry(purchase, productId) {
    const lineItem = (purchase.lineItems || []).find((item) => item.productId === productId)
      || (purchase.lineItems || [])[0];

    if (!lineItem?.expiryTime) {
      throw badRequest("Google Play purchase has no expiry time", "GOOGLE_PURCHASE_INVALID");
    }

    return new Date(lineItem.expiryTime).toISOString();
  }

  function googleStatus(purchase, expiresAt) {
    const status = googleSubscriptionStates[purchase.subscriptionState] || "expired";

    return status === "active" && new Date(expiresAt).getTime() <= Date.now() ? "expired" : status;
  }

  async function refreshAppleSubscription(originalTransactionId) {
    const subscription = await subscriptions.findByProviderSubscriptionId("apple", originalTransactionId);

    if (!subscription) {
      return null;
    }

    const statuses = await requireStore(appStore, "Apple").getSubscriptionStatuses(originalTransactionId);
    const latest = statuses.find((item) => item.transaction.originalTransactionId === originalTransactionId)
      || statuses[0];

    if (!latest) {
      return subscription;
    }

    assertAppleBundle(latest.transaction);
    const expiresAt = appleExpiry(latest.transaction, subscription.tariffId);
    await recordApplePayment(subscription.parentId, subscription.tariffId, { ...latest.transaction, environment: latest.environment });

    return await subscriptions.update(subscription.id, {
      status: appleSubscriptionStatuses[latest.status] || appleStatus(latest.transaction, expiresAt),
      expiresAt,
      providerPayload: applePayload({ ...latest.transaction, environment: latest.environment })
    });
  }

  async function refreshGoogleSubscription(purchaseToken) {
    const subscription = await subscriptions.findByProviderSubscriptionId("google", purchaseToken);

    if (!subscription) {
      return null;
    }

    const purchase = await requireStore(googlePlay, "Google Play").getSubscription(purchaseToken);
    const productId = subscription.providerPayload?.product_id;
    const expiresAt = googleExpiry(purchase, productId);

    return await subscriptions.update(subscription.id, {
      status: googleStatus(purchase, expiresAt),
      expiresAt
    });
  }

  async function notifyPaymentActivated(parent, {
    provider,
    subscription,
    tariff,
    transaction
  }) {
    if (!notificationService?.sendPush || !parent?.id || !tariff) {
      return null;
    }

    try {
      return await notificationService.sendPush(
        { type: "parent", parent },
        {
          title: "Оплата прошла",
          body: `Тариф ${tariff.id} активирован.`,
          data: {
            type: "billing.payment_succeeded",
            provider,
            tariff_id: tariff.id,
            subscription_id: subscription?.id || "",
            transaction_id: transaction?.id || ""
          }
        }
      );
    } catch {
      return null;
    }
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
      const transaction = await transactions.create({
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
      const updatedTransaction = await transactions.update(transaction.id, {
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
      const transaction = await transactions.findById(transactionId);

      if (!transaction || transaction.parentId !== parent.id || transaction.provider !== "click") {
        throw notFound("Click transaction not found", "CLICK_TRANSACTION_NOT_FOUND");
      }

      const subscriptionId = transaction.subscriptionId || transaction.subscription_id;

      return {
        transaction: serializeTransaction(transaction),
        subscription: serializeSubscription(
          subscriptionId
            ? await subscriptions.findById(subscriptionId)
            : null
        )
      };
    },

    async handleClickPrepare(body = {}) {
      const click = assertClickCallbackConfig();
      const merchantTransId = clickString(body, "merchant_trans_id");
      const transaction = await getClickTransaction(merchantTransId);

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
      const updatedTransaction = await transactions.update(transaction.id, {
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
      const transaction = await getClickTransaction(merchantTransId);

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
        const cancelledTransaction = await transactions.update(transaction.id, {
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

    // App Store Server Notifications V2. The notification is only used to learn
    // WHICH subscription changed; its state is re-fetched from Apple.
    async applyAppleNotification(body = {}) {
      if (!body.signedPayload) {
        throw badRequest("signedPayload is required", "VALIDATION_ERROR");
      }

      const notification = decodeStorePayload(body.signedPayload, "signedPayload");
      const signedTransaction = notification.data?.signedTransactionInfo;
      const originalTransactionId = signedTransaction
        ? decodeStorePayload(signedTransaction, "signedTransactionInfo").originalTransactionId
        : null;

      if (!originalTransactionId) {
        return { accepted: true, subscription: null };
      }

      return {
        accepted: true,
        notification_type: notification.notificationType || null,
        subscription: serializeSubscription(await refreshAppleSubscription(originalTransactionId))
      };
    },

    // Google Play Real-time Developer Notifications delivered by a Pub/Sub push
    // subscription. The token is re-fetched from the Play Developer API.
    async applyGoogleNotification(body = {}) {
      let notification;

      try {
        notification = JSON.parse(Buffer.from(body.message?.data || "", "base64").toString("utf8"));
      } catch {
        throw badRequest("message.data must be base64-encoded JSON", "VALIDATION_ERROR");
      }

      const purchaseToken = notification.subscriptionNotification?.purchaseToken;

      if (!purchaseToken) {
        return { accepted: true, subscription: null };
      }

      return {
        accepted: true,
        subscription: serializeSubscription(await refreshGoogleSubscription(purchaseToken))
      };
    },

    async currentForParent(parent) {
      return {
        subscription: serializeSubscription(await latestActiveForParent(parent.id))
      };
    },

    async currentForActor(actor) {
      const parent = await parentFromActor(actor);

      return {
        subscription: serializeSubscription(await latestActiveForParent(parent.id))
      };
    },

    async listByTariffId(tariffId) {
      return await subscriptions.listByTariffId(tariffId);
    },

    serializeSubscription,

    async update(id, attributes) {
      return await subscriptions.update(id, attributes);
    },

    // StoreKit 2: the client sends the transaction id (or the signed
    // transaction it got from StoreKit). The server looks it up at Apple.
    async verifyApplePurchase(parent, { signedTransaction = null, transactionId = null } = {}) {
      const id = transactionId
        || (signedTransaction ? decodeStorePayload(signedTransaction, "signed_transaction").transactionId : null);

      if (!id) {
        throw badRequest("transaction_id or signed_transaction is required", "VALIDATION_ERROR");
      }

      const transaction = await requireStore(appStore, "Apple").getTransaction(String(id));

      assertAppleBundle(transaction);
      assertAccountToken(parent, transaction.appAccountToken);
      const tariffId = tariffForProduct("apple", transaction.productId);
      const providerSubscriptionId = String(transaction.originalTransactionId);
      await assertPurchaseOwner(parent, "apple", providerSubscriptionId);
      const expiresAt = appleExpiry(transaction, tariffId);
      await recordApplePayment(parent.id, tariffId, transaction);

      return await activateStorePurchase(parent, {
        expiresAt,
        provider: "apple",
        providerPayload: applePayload(transaction),
        providerSubscriptionId,
        status: appleStatus(transaction, expiresAt),
        tariffId
      });
    },

    async verifyGooglePurchase(parent, { productId = null, purchaseToken } = {}) {
      if (!purchaseToken) {
        throw badRequest("purchase_token is required", "VALIDATION_ERROR");
      }

      const store = requireStore(googlePlay, "Google Play");
      const purchase = await store.getSubscription(purchaseToken);
      const lineItem = (purchase.lineItems || []).find((item) => !productId || item.productId === productId);

      if (!lineItem) {
        throw badRequest("Purchase does not contain the requested product", "GOOGLE_PURCHASE_INVALID");
      }

      assertAccountToken(parent, purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId);
      const tariffId = tariffForProduct("google", lineItem.productId);
      await assertPurchaseOwner(parent, "google", purchaseToken);
      const expiresAt = googleExpiry(purchase, lineItem.productId);
      const status = googleStatus(purchase, expiresAt);

      if (status === "active" && purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
        await store.acknowledgeSubscription(lineItem.productId, purchaseToken);
      }

      return await activateStorePurchase(parent, {
        expiresAt,
        provider: "google",
        providerPayload: {
          product_id: lineItem.productId,
          order_id: purchase.latestOrderId || null
        },
        providerSubscriptionId: purchaseToken,
        status,
        tariffId
      });
    }
  };
}

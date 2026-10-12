import { conflict } from "../lib/errors.js";
import { createAppStoreConnectClient, daysForPeriod } from "./appStoreConnect.js";

// Keeps admin tariffs and App Store Connect subscriptions in step:
// - a subscription created in App Store Connect shows up as a hidden draft
//   tariff, linked to its product id; it goes live once the admin fills in
//   the constructor (see tariffService.updateTariff);
// - a tariff created in the admin panel can be created in App Store Connect.
// The link is the Apple "products" setting (product id → tariff id), the same
// one the app and receipt verification use.

const AUTO_SYNC_EVERY_MS = 5 * 60 * 1000;

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

const PERIOD_SUFFIX = { 7: "weekly", 30: "monthly", 60: "two_months", 90: "quarterly", 180: "half_year", 365: "yearly" };

export function defaultProductId(tariff) {
  const days = [7, 30, 60, 90, 180, 365].reduce((best, value) =>
    Math.abs(value - (Number(tariff.duration_days) || 30)) < Math.abs(best - (Number(tariff.duration_days) || 30)) ? value : best);
  const name = slug(tariff.title?.en) || slug(tariff.id) || "plan";
  return `astir.${name}.${PERIOD_SUFFIX[days]}`;
}

export function createTariffStoreSync({
  config,
  tariffService,
  paymentProviders,
  client = createAppStoreConnectClient(config.appleIap),
  now = () => Date.now()
}) {
  let lastSyncAt = 0;
  let running = null;

  const products = () => ({ ...(config.appleIap?.products || {}) });

  async function saveProducts(next) {
    await paymentProviders.saveSettings("apple", { products: Object.keys(next).length ? next : null });
  }

  function tariffExists(id) {
    try {
      tariffService.getTariff(id);
      return true;
    } catch {
      return false;
    }
  }

  async function runImport() {
    const subscriptions = await client.listSubscriptions();
    const links = products();
    const created = [];
    let linksChanged = false;

    for (const subscription of subscriptions) {
      if (!subscription.productId) continue;
      const linkedTariff = links[subscription.productId];
      const appStore = {
        product_id: subscription.productId,
        subscription_id: subscription.id,
        state: subscription.state,
        usd_price: await client.currentUsdPrice(subscription.id).catch(() => null),
        synced_at: new Date(now()).toISOString()
      };

      if (linkedTariff && tariffExists(linkedTariff)) {
        tariffService.updateTariff(linkedTariff, { app_store: appStore });
        continue;
      }

      const name = subscription.texts.ru?.name || subscription.texts.en?.name || subscription.name || subscription.productId;
      const description = subscription.texts.ru?.description || subscription.texts.en?.description || "";
      const tariff = tariffService.createTariff({
        title: { ru: name, uz: "", en: subscription.texts.en?.name || "" },
        description: { ru: description, uz: "", en: subscription.texts.en?.description || "" },
        duration_days: daysForPeriod(subscription.period),
        max_children: 1,
        features: [],
        is_default: false,
        can_watch_premium: false,
        price_cents: 0,
        currency: "UZS",
        active: false,
        store_draft: true,
        app_store: appStore
      });
      links[subscription.productId] = tariff.id;
      linksChanged = true;
      created.push(tariff);
    }

    if (linksChanged) await saveProducts(links);
    lastSyncAt = now();
    return { created, subscriptions: subscriptions.length };
  }

  return {
    isConfigured: () => client.isConfigured(),

    // Pulls App Store Connect subscriptions; new ones become draft tariffs.
    async importFromAppStore() {
      running ||= runImport().finally(() => {
        running = null;
      });
      return running;
    },

    // For the admin list: refreshes at most every few minutes, never fails it.
    async autoImport() {
      if (!client.isConfigured() || now() - lastSyncAt < AUTO_SYNC_EVERY_MS) return null;
      try {
        return await this.importFromAppStore();
      } catch (error) {
        lastSyncAt = now();
        console.error(JSON.stringify({ event: "app_store_sync_failed", message: error.message }));
        return null;
      }
    },

    // Changes the App Store price of a linked tariff; current subscribers keep
    // the price they already pay.
    async updatePrice(tariffId, usdPrice) {
      const tariff = tariffService.getTariff(tariffId);
      const subscriptionId = tariff.app_store?.subscription_id;
      if (!subscriptionId) throw conflict("Тариф ещё не связан с подпиской App Store", "TARIFF_NOT_IN_APP_STORE");
      await client.setPrice(subscriptionId, usdPrice, { preserveCurrentPrice: true });
      return tariffService.updateTariff(tariff.id, {
        app_store: { ...tariff.app_store, usd_price: Number(usdPrice).toFixed(2), synced_at: new Date(now()).toISOString() }
      });
    },

    // Creates the tariff's subscription in App Store Connect and links it.
    async pushTariff(tariffId, { usdPrice, productId } = {}) {
      const tariff = tariffService.getTariff(tariffId);
      const links = products();
      const linked = Object.entries(links).find(([, id]) => id === tariff.id);
      if (linked) throw conflict(`Тариф уже связан с ${linked[0]}`, "TARIFF_ALREADY_IN_APP_STORE");

      const id = String(productId || defaultProductId(tariff)).trim();
      if (links[id]) throw conflict(`${id} уже связан с другим тарифом`, "APP_STORE_PRODUCT_TAKEN");

      const created = await client.createSubscription({
        productId: id,
        name: tariff.title.ru || tariff.title.en || tariff.id,
        durationDays: tariff.duration_days,
        title: tariff.title,
        description: tariff.description,
        usdPrice
      });
      links[id] = tariff.id;
      await saveProducts(links);
      return tariffService.updateTariff(tariff.id, {
        app_store: {
          product_id: id,
          subscription_id: created.id,
          state: created.state,
          usd_price: usdPrice ? String(usdPrice) : null,
          synced_at: new Date(now()).toISOString()
        }
      });
    }
  };
}

import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";

const defaultTariffId = "free";

const defaultTariffs = [
  {
    id: "free",
    title: {
      en: "Free",
      ru: "Free",
      uz: "Bepul"
    },
    description: {
      en: "Default access for free content.",
      ru: "Default access for free content.",
      uz: "Bepul kontent uchun asosiy kirish."
    },
    is_default: true,
    can_watch_premium: false,
    price_cents: 0,
    currency: "UZS"
  },
  {
    id: "premium",
    title: {
      en: "Premium",
      ru: "Premium",
      uz: "Premium"
    },
    description: {
      en: "Access to all free and premium content.",
      ru: "Access to all free and premium content.",
      uz: "Barcha bepul va premium kontentga kirish."
    },
    is_default: false,
    can_watch_premium: true,
    price_cents: 4900000,
    currency: "UZS"
  }
];

function priceString(priceCents) {
  return (priceCents / 100).toFixed(2);
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
    price: priceString(priceCents),
    price_cents: priceCents,
    currency: tariff.currency || "UZS",
    createdAt: tariff.createdAt,
    updatedAt: tariff.updatedAt
  };
}

function tariffResponse(tariff, subscription = null) {
  const serializedTariff = serializeTariff(tariff);

  return {
    tariff: serializedTariff,
    subscription,
    access: {
      can_watch_premium: serializedTariff.can_watch_premium
    }
  };
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || null;
}

export function createTariffService({ parents, subscriptions, tariffs }) {
  function seedDefaultTariffs() {
    for (const tariff of defaultTariffs) {
      const existingTariff = tariffs.findById(tariff.id);

      if (!existingTariff) {
        tariffs.create(tariff);
        continue;
      }

      const attributes = {};

      if (existingTariff.price_cents === undefined || existingTariff.price_cents === null) {
        attributes.price_cents = tariff.price_cents;
      }

      if (!existingTariff.currency) {
        attributes.currency = tariff.currency;
      }

      if (Object.keys(attributes).length > 0) {
        tariffs.update(existingTariff.id, attributes);
      }
    }
  }

  function defaultTariff() {
    return tariffs.findDefault() || tariffs.findById(defaultTariffId);
  }

  function getTariffRecord(tariffId) {
    const tariff = tariffs.findById(tariffId);

    if (!tariff) {
      throw notFound("Tariff not found", "TARIFF_NOT_FOUND");
    }

    return tariff;
  }

  function clearOtherDefaultTariffs(currentTariffId) {
    for (const tariff of tariffs.list()) {
      if (tariff.id !== currentTariffId && tariff.is_default) {
        tariffs.update(tariff.id, { is_default: false });
      }
    }
  }

  function parentFromActor(actor) {
    if (actor?.type === "parent" && actor.parent) {
      return actor.parent;
    }

    if (actor?.type === "device") {
      if (actor.device?.parent?.id) {
        return actor.device.parent;
      }

      const parentId = firstValue(actor.device?.parentId, actor.device?.parent_id);

      if (parentId) {
        return { id: parentId, tariff: firstValue(actor.device?.parentTariff, actor.device?.parent_tariff, "free") };
      }
    }

    throw forbidden("Tariff owner was not found", "TARIFF_OWNER_NOT_FOUND");
  }

  function currentTariffForParent(parent) {
    const subscription = subscriptions.activeForParent(parent.id);
    const tariff = tariffs.findById(subscription?.tariffId)
      || tariffs.findById(parent?.tariff)
      || defaultTariff();

    return { subscription, tariff };
  }

  function canWatchPremium(actor) {
    return currentTariffForParent(parentFromActor(actor)).tariff.can_watch_premium;
  }

  seedDefaultTariffs();

  return {
    assertCanWatchMovie(actor, movie) {
      if (!movie.is_premium) {
        return;
      }

      if (!canWatchPremium(actor)) {
        throw forbidden("Premium tariff is required to watch this content", "PREMIUM_TARIFF_REQUIRED");
      }
    },

    canWatchMovie(actor, movie) {
      return !movie.is_premium || canWatchPremium(actor);
    },

    createTariff(attributes) {
      if (attributes.id && tariffs.findById(attributes.id)) {
        throw conflict("Tariff already exists", "TARIFF_EXISTS");
      }

      const createAttributes = { ...attributes };

      if (!createAttributes.id) {
        delete createAttributes.id;
      }

      if (attributes.is_default) {
        clearOtherDefaultTariffs(createAttributes.id);
      }

      return serializeTariff(tariffs.create(createAttributes));
    },

    currentForActor(actor) {
      const currentTariff = currentTariffForParent(parentFromActor(actor));

      return tariffResponse(
        currentTariff.tariff,
        subscriptions.serializeSubscription(currentTariff.subscription)
      );
    },

    currentForParent(parent) {
      const currentTariff = currentTariffForParent(parent);

      return tariffResponse(
        currentTariff.tariff,
        subscriptions.serializeSubscription(currentTariff.subscription)
      );
    },

    deleteTariff(tariffId) {
      const tariff = getTariffRecord(tariffId);

      if (tariff.is_default) {
        throw badRequest("Default tariff cannot be deleted", "DEFAULT_TARIFF_DELETE_FORBIDDEN");
      }

      // Get the free/default tariff
      const freeTariff = defaultTariff();

      // Cascade: Update all subscriptions using this tariff to free tariff
      const subscriptionsUsingTariff = subscriptions.listByTariffId(tariff.id);
      for (const subscription of subscriptionsUsingTariff) {
        subscriptions.update(subscription.id, { tariffId: freeTariff.id });
      }

      // Cascade: Update all parent accounts using this tariff to free tariff
      const parentsUsingTariff = parents.list().filter((parent) => parent.tariff === tariff.id);
      for (const parent of parentsUsingTariff) {
        parents.update(parent.id, { tariff: freeTariff.id });
      }

      return {
        deleted: true,
        tariff: serializeTariff(tariffs.delete(tariff.id)),
        affected: {
          subscriptionsUpdated: subscriptionsUsingTariff.length,
          parentsUpdated: parentsUsingTariff.length
        }
      };
    },

    getTariff(tariffId) {
      return serializeTariff(getTariffRecord(tariffId));
    },

    listTariffs() {
      return tariffs.list().map(serializeTariff);
    },

    updateParentTariff(parent, tariffId) {
      const tariff = getTariffRecord(tariffId);
      const updatedParent = parents.update(parent.id, {
        tariff: tariff.id
      }) || { ...parent, tariff: tariff.id };
      const currentTariff = currentTariffForParent(updatedParent);

      return tariffResponse(
        currentTariff.tariff,
        subscriptions.serializeSubscription(currentTariff.subscription)
      );
    },

    updateTariff(tariffId, attributes) {
      const tariff = getTariffRecord(tariffId);

      if (attributes.is_default === false && tariff.is_default) {
        throw badRequest("One default tariff is required", "DEFAULT_TARIFF_REQUIRED");
      }

      if (attributes.is_default === true) {
        clearOtherDefaultTariffs(tariff.id);
      }

      return serializeTariff(tariffs.update(tariff.id, attributes));
    }
  };
}

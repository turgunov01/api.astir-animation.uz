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
    duration_days: 30,
    max_children: 1,
    features: ["free_content"],
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
    duration_days: 30,
    max_children: 5,
    features: ["free_content", "premium_content"],
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
    duration_days: Number(tariff.duration_days) || 30,
    max_children: Number(tariff.max_children) || 1,
    features: Array.isArray(tariff.features) ? tariff.features : [],
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

function parentTariffId(parent) {
  return firstValue(parent?.tariff, parent?.tariffId, parent?.tariff_id);
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

      if (existingTariff.duration_days === undefined || existingTariff.duration_days === null) {
        attributes.duration_days = tariff.duration_days;
      }

      if (existingTariff.max_children === undefined || existingTariff.max_children === null) {
        attributes.max_children = tariff.max_children;
      }

      if (!Array.isArray(existingTariff.features)) {
        attributes.features = tariff.features;
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

  function currentTariffForParentSync(parent) {
    const tariff = tariffs.findById(parentTariffId(parent))
      || defaultTariff();

    return { subscription: null, tariff };
  }

  async function currentTariffForParent(parent) {
    const subscription = await subscriptions.activeForParent(parent.id);
    const tariff = tariffs.findById(subscription?.tariffId)
      || tariffs.findById(parentTariffId(parent))
      || defaultTariff();

    return { subscription, tariff };
  }

  function canWatchPremium(actor) {
    return currentTariffForParentSync(parentFromActor(actor)).tariff.can_watch_premium;
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

    async currentForActor(actor) {
      const currentTariff = await currentTariffForParent(parentFromActor(actor));

      return tariffResponse(
        currentTariff.tariff,
        subscriptions.serializeSubscription(currentTariff.subscription)
      );
    },

    async currentForParent(parent) {
      const currentTariff = await currentTariffForParent(parent);

      return tariffResponse(
        currentTariff.tariff,
        subscriptions.serializeSubscription(currentTariff.subscription)
      );
    },

    async deleteTariff(tariffId, { hard = false } = {}) {
      const tariff = getTariffRecord(tariffId);

      if (tariff.is_default) {
        throw badRequest("Default tariff cannot be deleted", "DEFAULT_TARIFF_DELETE_FORBIDDEN");
      }

      const subscriptionsUsingTariff = await subscriptions.listByTariffId(tariff.id);
      const parentRows = parents?.list ? await parents.list() : [];
      const parentsUsingTariff = parentRows.filter((parent) => parentTariffId(parent) === tariff.id);

      if (!hard) {
        const freeTariff = defaultTariff();

        if (!freeTariff) {
          throw badRequest("Default tariff was not found", "DEFAULT_TARIFF_NOT_FOUND");
        }

        for (const subscription of subscriptionsUsingTariff) {
          await subscriptions.update(subscription.id, { tariffId: freeTariff.id });
        }

        for (const parent of parentsUsingTariff) {
          if (parents?.update) {
            await parents.update(parent.id, { tariff: freeTariff.id });
          }
        }
      }
      const deletedTariff = tariffs.delete(tariff.id);

      if (!deletedTariff) {
        throw notFound("Tariff not found", "TARIFF_NOT_FOUND");
      }

      return {
        deleted: true,
        hard_deleted: hard,
        mode: hard ? "hard" : "cascade_to_default",
        tariff: serializeTariff(deletedTariff),
        affected: {
          subscriptionsLinked: subscriptionsUsingTariff.length,
          parentsLinked: parentsUsingTariff.length,
          subscriptionsUpdated: hard ? 0 : subscriptionsUsingTariff.length,
          parentsUpdated: hard ? 0 : parentsUsingTariff.length
        }
      };
    },

    getTariff(tariffId) {
      return serializeTariff(getTariffRecord(tariffId));
    },

    listTariffs() {
      return tariffs.list().map(serializeTariff);
    },

    async updateParentTariff(parent, tariffId) {
      const tariff = getTariffRecord(tariffId);
      const updatedParent = parents?.update
        ? await parents.update(parent.id, { tariff: tariff.id }) || { ...parent, tariff: tariff.id }
        : { ...parent, tariff: tariff.id };
      const currentTariff = await currentTariffForParent(updatedParent);

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

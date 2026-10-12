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

// Content rules of a tariff (the admin "constructor"). Free content is open
// to everyone; a tariff decides which premium content it unlocks. Empty
// lists mean "any", so a premium tariff without rules unlocks everything.
const EMPTY_ACCESS = {
  category_ids: [],
  tag_ids: [],
  content_types: [],
  max_age_rating: null,
  include_ids: [],
  exclude_ids: []
};

function list(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function normalizeTariffAccess(access) {
  const source = access && typeof access === "object" ? access : {};
  const maxAge = Number(source.max_age_rating);

  return {
    category_ids: list(source.category_ids),
    tag_ids: list(source.tag_ids),
    content_types: list(source.content_types).filter((type) => ["movie", "series", "episode"].includes(type)),
    max_age_rating: source.max_age_rating === null || source.max_age_rating === undefined || source.max_age_rating === "" || !Number.isFinite(maxAge) ? null : Math.max(0, Math.round(maxAge)),
    include_ids: list(source.include_ids),
    exclude_ids: list(source.exclude_ids)
  };
}

function movieKind(movie) {
  const type = String(movie.content_type || "").toLowerCase();
  if (type === "episode" || movie.series_id) return "episode";
  if (type === "series") return "series";
  return "movie";
}

export function tariffUnlocksMovie(tariff, movie) {
  if (!movie?.is_premium) return true;
  if (!tariff) return false;

  const access = normalizeTariffAccess(tariff.access);
  if (movie.id && access.include_ids.includes(String(movie.id))) return true;
  if (!tariff.can_watch_premium) return false;
  if (movie.id && access.exclude_ids.includes(String(movie.id))) return false;
  if (access.category_ids.length && !access.category_ids.includes(String(movie.category_id || ""))) return false;
  if (access.tag_ids.length && !list(movie.tag_ids).some((tagId) => access.tag_ids.includes(tagId))) return false;
  if (access.content_types.length && !access.content_types.includes(movieKind(movie))) return false;
  if (access.max_age_rating !== null && (Number(movie.age_rating) || 0) > access.max_age_rating) return false;

  return true;
}

const LANGS = ["ru", "uz", "en"];

// What a tariff still lacks before the app may offer it. Tariffs imported
// from App Store Connect start hidden (store_draft) and go live by themselves
// once the admin has filled all of this in.
export function missingTariffFields(tariff) {
  const missing = [];
  for (const lang of LANGS) {
    if (!String(tariff.title?.[lang] || "").trim()) missing.push(`title.${lang}`);
  }
  for (const lang of LANGS) {
    if (!String(tariff.description?.[lang] || "").trim()) missing.push(`description.${lang}`);
  }
  if (!(tariffPriceCents(tariff) > 0) && !tariff.is_default) missing.push("price");
  if (!(Number(tariff.duration_days) > 0)) missing.push("duration_days");
  if (!(Number(tariff.max_children) > 0)) missing.push("max_children");
  return missing;
}

export function isTariffActive(tariff) {
  return tariff.active !== false;
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
    access: { ...EMPTY_ACCESS, ...normalizeTariffAccess(tariff.access) },
    price: priceString(priceCents),
    price_cents: priceCents,
    currency: tariff.currency || "UZS",
    active: isTariffActive(tariff),
    store_draft: Boolean(tariff.store_draft),
    missing_fields: missingTariffFields(tariff),
    app_store: tariff.app_store || null,
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

    // Exactly one default tariff — the free one when it is among several.
    const defaults = tariffs.list().filter((tariff) => tariff.is_default);
    if (defaults.length > 1) {
      const keep = defaults.find((tariff) => tariff.id === defaultTariffId) || defaults[0];
      for (const tariff of defaults) {
        if (tariff.id !== keep.id) tariffs.update(tariff.id, { is_default: false });
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

  function actorTariff(actor) {
    return currentTariffForParentSync(parentFromActor(actor)).tariff;
  }

  seedDefaultTariffs();

  return {
    assertCanWatchMovie(actor, movie) {
      if (!tariffUnlocksMovie(actorTariff(actor), movie)) {
        throw forbidden("Premium tariff is required to watch this content", "PREMIUM_TARIFF_REQUIRED");
      }
    },

    canWatchMovie(actor, movie) {
      return tariffUnlocksMovie(actorTariff(actor), movie);
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

    // The app sees only active tariffs; the admin panel sees all of them.
    listTariffs({ includeInactive = false } = {}) {
      return tariffs.list().filter((tariff) => includeInactive || isTariffActive(tariff)).map(serializeTariff);
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

      const next = { ...tariff, ...attributes };
      const missing = missingTariffFields(next);
      if (attributes.active === true && missing.length) {
        throw badRequest(`Tariff is not complete: ${missing.join(", ")}`, "TARIFF_INCOMPLETE");
      }
      if (attributes.active === false && tariff.is_default) {
        throw badRequest("The default tariff cannot be hidden", "DEFAULT_TARIFF_REQUIRED");
      }
      // A draft from App Store Connect goes live once the constructor is filled in.
      if (tariff.store_draft && !missing.length && attributes.active !== false) {
        attributes.active = true;
        attributes.store_draft = false;
      }

      return serializeTariff(tariffs.update(tariff.id, attributes));
    }
  };
}

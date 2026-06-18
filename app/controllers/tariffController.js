import {
  optionalBoolean,
  optionalString,
  requiredLocalizedText,
  requiredString
} from "../lib/validation.js";
import { badRequest } from "../lib/errors.js";

function firstValue(body, ...fields) {
  for (const field of fields) {
    const value = body?.[field];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function priceCentsFromAmount(value, field) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw badRequest(`${field} must be a non-negative amount`, "VALIDATION_ERROR");
  }

  return Math.round(amount * 100);
}

function priceCentsValue(body) {
  const centsValue = firstValue(body, "price_cents", "priceCents");

  if (centsValue === null) {
    return null;
  }

  const priceCents = Number(centsValue);

  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw badRequest("price_cents must be a non-negative integer", "VALIDATION_ERROR");
  }

  return priceCents;
}

function pricingAttributes(body, { defaults = false } = {}) {
  const attributes = {};
  const cents = priceCentsValue(body);
  const amountValue = firstValue(body, "price", "price_uzs", "priceUzs", "amount", "amount_uzs", "amountUzs");
  const amountCents = amountValue === null ? null : priceCentsFromAmount(amountValue, "price");

  if (cents !== null && amountCents !== null && cents !== amountCents) {
    throw badRequest("price and price_cents must describe the same amount", "VALIDATION_ERROR");
  }

  if (cents !== null || amountCents !== null) {
    attributes.price_cents = cents ?? amountCents;
  } else if (defaults) {
    attributes.price_cents = 0;
  }

  const currency = optionalString(body, "currency") || optionalString(body, "price_currency");

  if (currency) {
    const normalizedCurrency = currency.toUpperCase();

    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw badRequest("currency must be a 3-letter ISO code", "VALIDATION_ERROR");
    }

    attributes.currency = normalizedCurrency;
  } else if (defaults) {
    attributes.currency = "UZS";
  }

  return attributes;
}

function optionalIntegerValue(body, field, fallback = null, options = {}) {
  const value = body?.[field];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numeric)) {
    throw badRequest(`${field} must be an integer`, "VALIDATION_ERROR");
  }

  if (options.min !== undefined && numeric < options.min) {
    throw badRequest(`${field} must be at least ${options.min}`, "VALIDATION_ERROR");
  }

  if (options.max !== undefined && numeric > options.max) {
    throw badRequest(`${field} must be at most ${options.max}`, "VALIDATION_ERROR");
  }

  return numeric;
}

function optionalStringList(body, field, fallback = null) {
  const value = body?.[field];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (!Array.isArray(value)) {
    throw badRequest(`${field} must be an array`, "VALIDATION_ERROR");
  }

  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      throw badRequest(`${field} must contain only non-empty strings`, "VALIDATION_ERROR");
    }
  }

  return value.map((item) => item.trim());
}

function constructorAttributes(body, { defaults = false } = {}) {
  const attributes = {};

  if (defaults || Object.hasOwn(body || {}, "duration_days") || Object.hasOwn(body || {}, "durationDays")) {
    attributes.duration_days = optionalIntegerValue({
      duration_days: firstValue(body, "duration_days", "durationDays")
    }, "duration_days", defaults ? 30 : null, { min: 1, max: 3660 });
  }

  if (defaults || Object.hasOwn(body || {}, "max_children") || Object.hasOwn(body || {}, "maxChildren")) {
    attributes.max_children = optionalIntegerValue({
      max_children: firstValue(body, "max_children", "maxChildren")
    }, "max_children", defaults ? 1 : null, { min: 1, max: 100 });
  }

  if (defaults || Object.hasOwn(body || {}, "features")) {
    attributes.features = optionalStringList(body, "features", defaults ? [] : null);
  }

  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== null)
  );
}

function optionalDeleteBoolean(request, defaultValue, ...fields) {
  for (const source of [request.query, request.body]) {
    for (const field of fields) {
      const value = source?.[field];

      if (value !== undefined && value !== null && value !== "") {
        return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
      }
    }
  }

  return defaultValue;
}

function hardDeleteRequested(request) {
  const cascade = optionalDeleteBoolean(request, false, "cascade", "cascade_to_default", "cascadeToDefault");

  if (cascade) {
    return false;
  }

  return optionalDeleteBoolean(request, true, "hard", "force");
}

export function createTariffController({ tariffService }) {
  return {
    create(request, response) {
      const attributes = {
        title: requiredLocalizedText(request.body, "title"),
        description: requiredLocalizedText(request.body, "description"),
        is_default: optionalBoolean(request.body, "is_default", false),
        can_watch_premium: optionalBoolean(request.body, "can_watch_premium", false),
        ...constructorAttributes(request.body, { defaults: true }),
        ...pricingAttributes(request.body, { defaults: true })
      };
      const id = optionalString(request.body, "id");

      if (id) {
        attributes.id = id;
      }

      response.status(201).json({
        tariff: tariffService.createTariff(attributes)
      });
    },

    async current(request, response) {
      response.json(await tariffService.currentForActor(request.actor));
    },

    async delete(request, response) {
      response.json(await tariffService.deleteTariff(request.params.tariff_id, {
        hard: hardDeleteRequested(request)
      }));
    },

    get(request, response) {
      response.json({
        tariff: tariffService.getTariff(request.params.tariff_id)
      });
    },

    list(request, response) {
      response.json({
        tariffs: tariffService.listTariffs()
      });
    },

    update(request, response) {
      const attributes = {};

      if (Object.hasOwn(request.body, "title")) {
        attributes.title = requiredLocalizedText(request.body, "title");
      }

      if (Object.hasOwn(request.body, "description")) {
        attributes.description = requiredLocalizedText(request.body, "description");
      }

      if (Object.hasOwn(request.body, "is_default")) {
        attributes.is_default = optionalBoolean(request.body, "is_default");
      }

      if (Object.hasOwn(request.body, "can_watch_premium")) {
        attributes.can_watch_premium = optionalBoolean(request.body, "can_watch_premium");
      }

      Object.assign(attributes, constructorAttributes(request.body));
      Object.assign(attributes, pricingAttributes(request.body));

      if (Object.keys(attributes).length === 0) {
        throw badRequest("At least one field is required", "VALIDATION_ERROR");
      }

      response.json({
        tariff: tariffService.updateTariff(request.params.tariff_id, attributes)
      });
    },

    async updateCurrent(request, response) {
      response.json(await tariffService.updateParentTariff(
        request.parent,
        requiredString(request.body, "tariff")
      ));
    }
  };
}

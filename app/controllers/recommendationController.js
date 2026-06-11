import { badRequest } from "../lib/errors.js";
import { optionalBoolean, optionalString, requiredString } from "../lib/validation.js";

function optionalInteger(body, field, fallback = 0) {
  const value = body?.[field];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(numeric)) {
    throw badRequest(`${field} must be an integer`, "VALIDATION_ERROR");
  }

  return numeric;
}

function firstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return value || "";
}

export function createRecommendationController({ recommendationService }) {
  return {
    async list(request, response) {
      response.json(await recommendationService.list(request.actor, {
        includeInactive: request.query.includeInactive === "true" || request.query.admin === "true",
        limit: firstQueryValue(request.query.limit)
      }));
    },

    async popular(request, response) {
      response.json(await recommendationService.popular(request.actor, {
        childId: firstQueryValue(request.query.childId || request.query.child_id),
        limit: firstQueryValue(request.query.limit)
      }));
    },

    create(request, response) {
      response.status(201).json(recommendationService.create({
        type: requiredString(request.body, "type"),
        referenceId: requiredString({
          referenceId: request.body.referenceId || request.body.reference_id
        }, "referenceId"),
        sortOrder: optionalInteger(request.body, "sortOrder", optionalInteger(request.body, "sort_order", 0)),
        active: optionalBoolean(request.body, "active", true)
      }));
    },

    update(request, response) {
      const attributes = {};

      if (Object.hasOwn(request.body || {}, "type")) {
        attributes.type = optionalString(request.body, "type");
      }

      if (Object.hasOwn(request.body || {}, "referenceId") || Object.hasOwn(request.body || {}, "reference_id")) {
        attributes.referenceId = optionalString({
          referenceId: request.body.referenceId || request.body.reference_id
        }, "referenceId");
      }

      if (Object.hasOwn(request.body || {}, "sortOrder") || Object.hasOwn(request.body || {}, "sort_order")) {
        attributes.sortOrder = optionalInteger(
          request.body,
          Object.hasOwn(request.body || {}, "sortOrder") ? "sortOrder" : "sort_order"
        );
      }

      if (Object.hasOwn(request.body || {}, "active")) {
        attributes.active = optionalBoolean(request.body, "active", true);
      }

      if (Object.keys(attributes).length === 0) {
        throw badRequest("At least one field is required", "VALIDATION_ERROR");
      }

      response.json(recommendationService.update(request.params.recommendationId, attributes));
    },

    delete(request, response) {
      response.json(recommendationService.delete(request.params.recommendationId));
    }
  };
}

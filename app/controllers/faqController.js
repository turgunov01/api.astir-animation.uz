import { badRequest } from "../lib/errors.js";
import { optionalBoolean, optionalLocalizedText, requiredLocalizedText } from "../lib/validation.js";

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

export function createFaqController({ faqService }) {
  return {
    list(request, response) {
      response.json(faqService.list({
        includeInactive: request.query.includeInactive === "true" || request.query.admin === "true"
      }));
    },

    create(request, response) {
      response.status(201).json(faqService.create({
        question: requiredLocalizedText(request.body, "question"),
        answer: requiredLocalizedText(request.body, "answer"),
        sortOrder: optionalInteger(request.body, "sortOrder", optionalInteger(request.body, "sort_order", 0)),
        active: optionalBoolean(request.body, "active", true)
      }));
    },

    update(request, response) {
      const attributes = {};

      if (Object.hasOwn(request.body || {}, "question")) {
        attributes.question = optionalLocalizedText(request.body, "question");
      }

      if (Object.hasOwn(request.body || {}, "answer")) {
        attributes.answer = optionalLocalizedText(request.body, "answer");
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

      response.json(faqService.update(request.params.faqId, attributes));
    },

    delete(request, response) {
      response.json(faqService.delete(request.params.faqId));
    }
  };
}

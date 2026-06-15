import { badRequest, notFound } from "../lib/errors.js";

const allowedTypes = new Set(["category", "content", "movie", "series"]);
const defaultRecommendationLimit = 10;
const maxRecommendationLimit = 10;

function normalizeType(type) {
  const normalized = String(type || "").trim().toLowerCase();

  if (normalized === "movie") {
    return "content";
  }

  if (!allowedTypes.has(normalized)) {
    throw badRequest("type must be category, content, movie, or series", "VALIDATION_ERROR");
  }

  return normalized;
}

function sortOrder(recommendation) {
  return recommendation.sortOrder ?? recommendation.sort_order ?? 0;
}

function serializeRecommendation(recommendation) {
  return {
    id: recommendation.id,
    type: recommendation.type,
    referenceId: recommendation.referenceId || recommendation.reference_id,
    reference_id: recommendation.referenceId || recommendation.reference_id,
    sortOrder: sortOrder(recommendation),
    sort_order: sortOrder(recommendation),
    active: recommendation.active !== false,
    createdAt: recommendation.createdAt || recommendation.created_at || null,
    updatedAt: recommendation.updatedAt || recommendation.updated_at || null
  };
}

function boundedRecommendationLimit(limit) {
  const numeric = Number(limit);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return defaultRecommendationLimit;
  }

  return Math.min(Math.trunc(numeric), maxRecommendationLimit);
}

export function createRecommendationService({ contentService, recommendations }) {
  function getRecommendation(recommendationId) {
    const recommendation = recommendations.findById(recommendationId);

    if (!recommendation) {
      throw notFound("Recommendation not found", "RECOMMENDATION_NOT_FOUND");
    }

    return recommendation;
  }

  async function hydrateRecommendation(actor, recommendation) {
    const serialized = serializeRecommendation(recommendation);

    try {
      if (serialized.type === "category") {
        return {
          ...serialized,
          item: await contentService.getCategory(serialized.referenceId)
        };
      }

      return {
        ...serialized,
        item: (await contentService.getMovie(actor, serialized.referenceId)).movie
      };
    } catch (error) {
      return {
        ...serialized,
        item: null,
        unavailable: true,
        unavailableCode: error.code || "RECOMMENDATION_TARGET_UNAVAILABLE"
      };
    }
  }

  return {
    async list(actor, { includeInactive = false, limit = defaultRecommendationLimit } = {}) {
      const maxItems = boundedRecommendationLimit(limit);
      const list = includeInactive ? recommendations.list() : recommendations.listActive();
      const hydrated = await Promise.all(
        list.slice(0, maxItems).map((recommendation) => hydrateRecommendation(actor, recommendation))
      );
      const visible = includeInactive ? hydrated : hydrated.filter((recommendation) => !recommendation.unavailable);

      return {
        recommendations: visible
      };
    },

    async popular(actor, { childId = "", limit = defaultRecommendationLimit } = {}) {
      return contentService.listPopularMovies(actor, {
        childId,
        limit: boundedRecommendationLimit(limit)
      });
    },

    create({ type, referenceId, sortOrder = 0, active = true }) {
      return {
        recommendation: serializeRecommendation(recommendations.create({
          type: normalizeType(type),
          referenceId,
          sortOrder,
          active
        }))
      };
    },

    update(recommendationId, attributes) {
      getRecommendation(recommendationId);

      const updates = { ...attributes };

      if (Object.hasOwn(updates, "type")) {
        updates.type = normalizeType(updates.type);
      }

      return {
        recommendation: serializeRecommendation(recommendations.update(recommendationId, updates))
      };
    },

    delete(recommendationId) {
      const recommendation = getRecommendation(recommendationId);
      const deleted = recommendations.delete(recommendation.id);

      return {
        deleted: true,
        recommendation: serializeRecommendation(deleted)
      };
    }
  };
}

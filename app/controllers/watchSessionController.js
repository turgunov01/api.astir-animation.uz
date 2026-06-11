import { badRequest } from "../lib/errors.js";
import { requiredString } from "../lib/validation.js";

function firstPresentField(body, fields) {
  return fields.find((field) => Object.hasOwn(body || {}, field));
}

function integerAlias(body, fields, { fallback = null, required = false } = {}) {
  const field = firstPresentField(body, fields);

  if (!field) {
    if (required) {
      throw badRequest(`${fields[0]} is required`, "VALIDATION_ERROR");
    }

    return fallback;
  }

  const rawValue = body[field];
  const value = typeof rawValue === "number" ? rawValue : Number(rawValue);

  if (!Number.isInteger(value) || value < 0) {
    throw badRequest(`${field} must be a non-negative integer`, "VALIDATION_ERROR");
  }

  return value;
}

function optionalQueryString(query, ...fields) {
  for (const field of fields) {
    const value = query?.[field];

    if (Array.isArray(value) && value[0]) {
      return value[0];
    }

    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  return "";
}

export function createWatchSessionController({ watchService }) {
  return {
    async start(request, response) {
      const watchSession = await watchService.startWatchSessionForActor(request.actor, {
        contentId: requiredString(request.body, "contentId")
      });

      response.status(201).json({ watchSession });
    },

    async progress(request, response) {
      const watchedSeconds = integerAlias(
        request.body,
        ["watchedSec", "watchedSeconds", "watched_sec"],
        { required: true }
      );
      const positionSeconds = integerAlias(
        request.body,
        ["positionSec", "positionSeconds", "position_sec"],
        { fallback: watchedSeconds }
      );

      response.json({
        watchSession: await watchService.progressWatchSessionForActor(request.actor, request.params.watchSessionId, {
          positionSeconds,
          watchedSeconds
        })
      });
    },

    stop(request, response) {
      response.json({
        watchSession: watchService.stopWatchSessionForActor(request.actor, request.params.watchSessionId)
      });
    },

    async history(request, response) {
      response.json(await watchService.listHistory(request.actor, {
        childId: optionalQueryString(request.query, "childId", "child_id"),
        limit: optionalQueryString(request.query, "limit"),
        unique: request.query.unique !== "false"
      }));
    },

    async progressForContent(request, response) {
      response.json({
        progress: await watchService.getProgress(request.actor, request.params.contentId, {
          childId: optionalQueryString(request.query, "childId", "child_id")
        })
      });
    }
  };
}

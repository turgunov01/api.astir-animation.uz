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

export function createWatchSessionController({ watchService }) {
  return {
    async start(request, response) {
      const watchSession = await watchService.startWatchSession(request.device, {
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
        watchSession: await watchService.progressWatchSession(request.device, request.params.watchSessionId, {
          positionSeconds,
          watchedSeconds
        })
      });
    },

    stop(request, response) {
      response.json({
        watchSession: watchService.stopWatchSession(request.device, request.params.watchSessionId)
      });
    }
  };
}

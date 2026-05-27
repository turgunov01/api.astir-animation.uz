import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";
import { requiredString } from "../lib/validation.js";
import { requireDevice } from "../middleware/auth.js";
import { startWatchSession, stopWatchSession } from "../services/watchService.js";

export const watchSessionRoutes = Router();

watchSessionRoutes.post(
  "/start",
  requireDevice,
  asyncHandler((request, response) => {
    const watchSession = startWatchSession(request.device, {
      contentId: requiredString(request.body, "contentId")
    });

    response.status(201).json({ watchSession });
  })
);

watchSessionRoutes.patch(
  "/:watchSessionId/stop",
  requireDevice,
  asyncHandler((request, response) => {
    response.json({
      watchSession: stopWatchSession(request.device, request.params.watchSessionId)
    });
  })
);

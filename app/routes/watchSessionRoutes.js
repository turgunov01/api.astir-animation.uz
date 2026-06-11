import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createWatchSessionRoutes({ authMiddleware, watchSessionController }) {
  const router = Router();

  router.get("/history", authMiddleware.requireActor, asyncHandler(watchSessionController.history));
  router.get("/progress/:contentId", authMiddleware.requireActor, asyncHandler(watchSessionController.progressForContent));
  router.post("/start", authMiddleware.requireActor, asyncHandler(watchSessionController.start));
  router.patch("/:watchSessionId/progress", authMiddleware.requireActor, asyncHandler(watchSessionController.progress));
  router.patch("/:watchSessionId/stop", authMiddleware.requireActor, asyncHandler(watchSessionController.stop));

  return router;
}

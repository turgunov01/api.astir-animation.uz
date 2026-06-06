import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createWatchSessionRoutes({ authMiddleware, watchSessionController }) {
  const router = Router();

  router.post("/start", authMiddleware.requireDevice, asyncHandler(watchSessionController.start));
  router.patch("/:watchSessionId/progress", authMiddleware.requireDevice, asyncHandler(watchSessionController.progress));
  router.patch("/:watchSessionId/stop", authMiddleware.requireDevice, asyncHandler(watchSessionController.stop));

  return router;
}

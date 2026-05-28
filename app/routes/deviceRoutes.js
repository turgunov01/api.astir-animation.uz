import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createDeviceRoutes({ authMiddleware, deviceController }) {
  const router = Router();

  router.get("/config", authMiddleware.requireDevice, asyncHandler(deviceController.getConfig));

  return router;
}

import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createAdminDeviceRoutes({ adminDeviceController, authMiddleware }) {
  const router = Router();

  router.get("/", authMiddleware.requireParent, asyncHandler(adminDeviceController.list));
  router.get("/stats", authMiddleware.requireParent, asyncHandler(adminDeviceController.stats));
  router.post("/pairing/:sessionId/approve", authMiddleware.requireParent, asyncHandler(adminDeviceController.approvePairing));
  router.delete("/:deviceId", authMiddleware.requireParent, asyncHandler(adminDeviceController.revoke));

  return router;
}

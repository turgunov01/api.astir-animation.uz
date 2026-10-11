import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createAdminDeviceRoutes({ adminDeviceController, authMiddleware }) {
  const router = Router();

  router.get("/", authMiddleware.requireParent, asyncHandler(adminDeviceController.list));
  router.delete("/:deviceId", authMiddleware.requireParent, asyncHandler(adminDeviceController.revoke));

  return router;
}

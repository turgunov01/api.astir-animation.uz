import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createChildrenRoutes({ authMiddleware, childrenController }) {
  const router = Router();

  router.get("/", authMiddleware.requireParent, asyncHandler(childrenController.list));
  router.post("/", authMiddleware.requireParent, asyncHandler(childrenController.create));
  router.get("/:childId", authMiddleware.requireParent, asyncHandler(childrenController.get));
  router.get("/:childId/limits", authMiddleware.requireParent, asyncHandler(childrenController.getLimits));
  router.put("/:childId/limits", authMiddleware.requireParent, asyncHandler(childrenController.updateLimits));
  router.get("/:childId/devices", authMiddleware.requireParent, asyncHandler(childrenController.listDevices));
  router.get("/:childId/blacklist", authMiddleware.requireParent, asyncHandler(childrenController.listBlacklist));
  router.post("/:childId/blacklist", authMiddleware.requireParent, asyncHandler(childrenController.addToBlacklist));
  router.delete("/:childId/blacklist/:contentId", authMiddleware.requireParent, asyncHandler(childrenController.removeFromBlacklist));

  return router;
}

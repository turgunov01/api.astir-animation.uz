import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createChildrenRoutes({ authMiddleware, childrenController }) {
  const router = Router();

  router.use(authMiddleware.requireParent);

  router.get("/", asyncHandler(childrenController.list));
  router.post("/", asyncHandler(childrenController.create));
  router.get("/:childId", asyncHandler(childrenController.get));
  router.get("/:childId/limits", asyncHandler(childrenController.getLimits));
  router.put("/:childId/limits", asyncHandler(childrenController.updateLimits));
  router.get("/:childId/devices", asyncHandler(childrenController.listDevices));
  router.get("/:childId/blacklist", asyncHandler(childrenController.listBlacklist));
  router.post("/:childId/blacklist", asyncHandler(childrenController.addToBlacklist));
  router.delete("/:childId/blacklist/:contentId", asyncHandler(childrenController.removeFromBlacklist));

  return router;
}

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

  return router;
}

import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createRecommendationRoutes({ authMiddleware, recommendationController }) {
  const router = Router();

  router.get("/", authMiddleware.requireActor, asyncHandler(recommendationController.list));
  router.get("/popular", authMiddleware.requireActor, asyncHandler(recommendationController.popular));
  router.post("/", authMiddleware.requireParent, asyncHandler(recommendationController.create));
  router.patch("/:recommendationId", authMiddleware.requireParent, asyncHandler(recommendationController.update));
  router.delete("/:recommendationId", authMiddleware.requireParent, asyncHandler(recommendationController.delete));

  return router;
}

import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createFaqRoutes({ authMiddleware, faqController }) {
  const router = Router();

  router.get("/", asyncHandler(faqController.list));
  router.post("/", authMiddleware.requireParent, asyncHandler(faqController.create));
  router.patch("/:faqId", authMiddleware.requireParent, asyncHandler(faqController.update));
  router.delete("/:faqId", authMiddleware.requireParent, asyncHandler(faqController.delete));

  return router;
}

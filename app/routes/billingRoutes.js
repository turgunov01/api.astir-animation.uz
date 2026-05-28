import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createBillingRoutes({ authMiddleware, billingController }) {
  const router = Router();

  router.get("/subscription/current", authMiddleware.requireActor, asyncHandler(billingController.currentSubscription));
  router.post("/apple/verify", authMiddleware.requireParent, asyncHandler(billingController.verifyApple));
  router.post("/google/verify", authMiddleware.requireParent, asyncHandler(billingController.verifyGoogle));
  router.post("/webhook/apple", asyncHandler(billingController.appleWebhook));
  router.post("/webhook/google", asyncHandler(billingController.googleWebhook));

  return router;
}

import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createBillingRoutes({ authMiddleware, billingController }) {
  const router = Router();

  router.get("/subscription/current", authMiddleware.requireActor, asyncHandler(billingController.currentSubscription));
  router.post("/click/checkout", authMiddleware.requireParent, asyncHandler(billingController.clickCheckout));
  router.post("/click/checkout/deeplink", authMiddleware.requireParent, asyncHandler(billingController.clickCheckout));
  router.get("/click/transactions/:transactionId", authMiddleware.requireParent, asyncHandler(billingController.clickTransaction));
  router.post("/click/prepare", asyncHandler(billingController.clickPrepare));
  router.post("/click/complete", asyncHandler(billingController.clickComplete));
  router.post("/apple/verify", authMiddleware.requireParent, asyncHandler(billingController.verifyApple));
  router.post("/google/verify", authMiddleware.requireParent, asyncHandler(billingController.verifyGoogle));
  router.post("/webhook/apple", asyncHandler(billingController.appleWebhook));
  router.post("/webhook/google", asyncHandler(billingController.googleWebhook));

  return router;
}

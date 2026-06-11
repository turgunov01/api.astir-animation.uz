import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createNotificationRoutes({ authMiddleware, notificationController }) {
  const router = Router();

  router.get("/", authMiddleware.requireActor, asyncHandler(notificationController.list));
  router.post("/device-token", authMiddleware.requireActor, asyncHandler(notificationController.registerToken));
  router.post("/push", authMiddleware.requireParent, asyncHandler(notificationController.sendPush));
  router.post("/email", authMiddleware.requireParent, asyncHandler(notificationController.sendEmail));

  return router;
}

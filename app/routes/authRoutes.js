import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createAuthRoutes({ authController, authMiddleware }) {
  const router = Router();

  router.get("/email/check", asyncHandler(authController.checkEmail));
  router.post("/email/check", asyncHandler(authController.checkEmail));
  router.get("/check-email", asyncHandler(authController.checkEmail));
  router.post("/check-email", asyncHandler(authController.checkEmail));
  router.post("/otp/request", asyncHandler(authController.requestRegistrationOtp));
  router.post("/otp/verify", asyncHandler(authController.verifyRegistrationOtp));
  router.post("/register", asyncHandler(authController.register));
  router.post("/login", asyncHandler(authController.login));
  router.get("/me", authMiddleware.requireParent, asyncHandler(authController.me));
  router.post("/pin/verify", authMiddleware.requireParent, asyncHandler(authController.verifyPin));
  router.patch("/pin", authMiddleware.requireParent, asyncHandler(authController.changePin));
  router.put("/pin", authMiddleware.requireParent, asyncHandler(authController.changePin));

  return router;
}

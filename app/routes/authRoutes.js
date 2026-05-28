import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createAuthRoutes({ authController, authMiddleware }) {
  const router = Router();

  router.post("/register", asyncHandler(authController.register));
  router.post("/login", asyncHandler(authController.login));
  router.get("/me", authMiddleware.requireParent, asyncHandler(authController.me));
  router.post("/pin/verify", authMiddleware.requireParent, asyncHandler(authController.verifyPin));

  return router;
}

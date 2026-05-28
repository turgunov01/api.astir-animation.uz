import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";

export function createPairingRoutes({ authMiddleware, pairingController }) {
  const router = Router();

  router.post("/sessions", asyncHandler(pairingController.createSession));
  router.get("/sessions/:sessionId", asyncHandler(pairingController.getSession));
  router.post(
    "/sessions/:sessionId/approve",
    authMiddleware.requireParent,
    asyncHandler(pairingController.approveSession)
  );

  return router;
}

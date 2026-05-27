import { Router } from "express";
import { asyncHandler, badRequest } from "../lib/errors.js";
import { requiredString } from "../lib/validation.js";
import { requireParent } from "../middleware/auth.js";
import { approvePairingSession, createPairingSession, getPairingSessionForSetup } from "../services/pairingService.js";

export const pairingRoutes = Router();

pairingRoutes.post(
  "/sessions",
  asyncHandler((request, response) => {
    const session = createPairingSession({
      deviceName: requiredString(request.body, "deviceName"),
      platform: requiredString(request.body, "platform")
    });

    response.status(201).json({ pairingSession: session });
  })
);

pairingRoutes.get(
  "/sessions/:sessionId",
  asyncHandler((request, response) => {
    const setupToken = request.get("x-setup-token");

    if (!setupToken) {
      throw badRequest("x-setup-token header is required", "SETUP_TOKEN_REQUIRED");
    }

    response.json({
      pairingSession: getPairingSessionForSetup(request.params.sessionId, setupToken)
    });
  })
);

pairingRoutes.post(
  "/sessions/:sessionId/approve",
  requireParent,
  asyncHandler((request, response) => {
    response.json({
      pairingSession: approvePairingSession(
        request.parent.id,
        request.params.sessionId,
        requiredString(request.body, "childId")
      )
    });
  })
);

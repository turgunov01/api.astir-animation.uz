import { badRequest } from "../lib/errors.js";
import { requiredString } from "../lib/validation.js";

export function createPairingController({ pairingService }) {
  return {
    createSession(request, response) {
      const session = pairingService.createPairingSession({
        deviceName: requiredString(request.body, "deviceName"),
        platform: requiredString(request.body, "platform")
      });

      response.status(201).json({ pairingSession: session });
    },

    getSession(request, response) {
      const setupToken = request.get("x-setup-token");

      if (!setupToken) {
        throw badRequest("x-setup-token header is required", "SETUP_TOKEN_REQUIRED");
      }

      response.json({
        pairingSession: pairingService.getPairingSessionForSetup(request.params.sessionId, setupToken)
      });
    },

    async approveSession(request, response) {
      response.json({
        pairingSession: await pairingService.approvePairingSession(
          request.parent.id,
          request.params.sessionId,
          requiredString(request.body, "childId")
        )
      });
    }
  };
}

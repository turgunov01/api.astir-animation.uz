import { requiredString } from "../lib/validation.js";

export function createAdminDeviceController({ adminDeviceService }) {
  return {
    async list(request, response) {
      response.json(await adminDeviceService.list(request.parent));
    },

    async approvePairing(request, response) {
      response.json({
        pairingSession: await adminDeviceService.approvePairing(
          request.parent,
          request.params.sessionId,
          requiredString(request.body, "childId")
        )
      });
    },

    async revoke(request, response) {
      response.json(adminDeviceService.revoke(request.parent, request.params.deviceId));
    }
  };
}

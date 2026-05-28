import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { randomCode, randomToken, sha256, verifySecret, hashSecret } from "../lib/security.js";
import { signDeviceToken } from "../lib/tokens.js";

function isExpired(session) {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

function generateUniqueCode(pairingSessions) {
  let code = randomCode();

  while (pairingSessions.findPendingByCode(code)) {
    code = randomCode();
  }

  return code;
}

export function createPairingService({ childService, config, devices, pairingSessions }) {
  function expireSessionIfNeeded(session) {
    if (!session) {
      return null;
    }

    if (session.status === "pending" && isExpired(session)) {
      return pairingSessions.update(session.id, { status: "expired" });
    }

    return session;
  }

  function createPairingSession({ deviceName, platform }) {
    const setupToken = randomToken();
    const expiresAt = new Date(Date.now() + config.pairingTtlMinutes * 60 * 1000).toISOString();
    const session = pairingSessions.create({
      code: generateUniqueCode(pairingSessions),
      setupTokenHash: hashSecret(setupToken),
      deviceName,
      platform,
      status: "pending",
      parentId: null,
      childId: null,
      deviceId: null,
      deviceToken: null,
      expiresAt
    });

    return {
      id: session.id,
      code: session.code,
      setupToken,
      status: session.status,
      expiresAt: session.expiresAt,
      qrPayload: {
        type: "astir-pairing",
        sessionId: session.id,
        code: session.code
      }
    };
  }

  function getPairingSessionForSetup(sessionId, setupToken) {
    const session = expireSessionIfNeeded(pairingSessions.findById(sessionId));

    if (!session) {
      throw notFound("Pairing session not found", "PAIRING_SESSION_NOT_FOUND");
    }

    if (!verifySecret(setupToken, session.setupTokenHash)) {
      throw forbidden("Invalid pairing setup token", "PAIRING_SETUP_FORBIDDEN");
    }

    const response = {
      id: session.id,
      code: session.code,
      status: session.status,
      expiresAt: session.expiresAt
    };

    if (session.status === "approved") {
      response.deviceToken = session.deviceToken;
      response.deviceId = session.deviceId;
      response.childId = session.childId;
    }

    return response;
  }

  function approvePairingSession(parentId, sessionId, childId) {
    const session = expireSessionIfNeeded(pairingSessions.findById(sessionId));

    if (!session) {
      throw notFound("Pairing session not found", "PAIRING_SESSION_NOT_FOUND");
    }

    if (session.status !== "pending") {
      throw badRequest(`Pairing session is ${session.status}`, "PAIRING_SESSION_NOT_PENDING");
    }

    const child = childService.getChildForParent(parentId, childId);
    const device = devices.create({
      parentId,
      childId,
      name: session.deviceName,
      platform: session.platform,
      tokenHash: null,
      pairedAt: new Date().toISOString()
    });
    const deviceToken = signDeviceToken(device);

    devices.update(device.id, {
      tokenHash: sha256(deviceToken)
    });

    const updatedSession = pairingSessions.update(session.id, {
      status: "approved",
      parentId,
      childId,
      deviceId: device.id,
      deviceToken
    });

    return {
      id: updatedSession.id,
      code: updatedSession.code,
      status: updatedSession.status,
      expiresAt: updatedSession.expiresAt,
      device: {
        id: device.id,
        name: device.name,
        platform: device.platform,
        child: childService.serializeChild(child),
        pairedAt: device.pairedAt
      }
    };
  }

  return {
    approvePairingSession,
    createPairingSession,
    getPairingSessionForSetup
  };
}

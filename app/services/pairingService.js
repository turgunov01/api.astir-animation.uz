import { config } from "../config.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { randomCode, randomToken, sha256, verifySecret, hashSecret } from "../lib/security.js";
import { signDeviceToken } from "../lib/tokens.js";
import { store } from "../store/jsonStore.js";
import { getChildForParent, serializeChild } from "./childService.js";

function isExpired(session) {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

function expireIfNeeded(session) {
  if (!session) {
    return null;
  }

  if (session.status === "pending" && isExpired(session)) {
    return store.update("pairingSessions", session.id, { status: "expired" });
  }

  return session;
}

function generateUniqueCode() {
  let code = randomCode();

  while (store.findOne("pairingSessions", (session) => session.code === code && session.status === "pending")) {
    code = randomCode();
  }

  return code;
}

export function createPairingSession({ deviceName, platform }) {
  const setupToken = randomToken();
  const expiresAt = new Date(Date.now() + config.pairingTtlMinutes * 60 * 1000).toISOString();
  const session = store.insert("pairingSessions", {
    code: generateUniqueCode(),
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

export function getPairingSessionForSetup(sessionId, setupToken) {
  const session = expireIfNeeded(store.findById("pairingSessions", sessionId));

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

export function approvePairingSession(parentId, sessionId, childId) {
  const session = expireIfNeeded(store.findById("pairingSessions", sessionId));

  if (!session) {
    throw notFound("Pairing session not found", "PAIRING_SESSION_NOT_FOUND");
  }

  if (session.status !== "pending") {
    throw badRequest(`Pairing session is ${session.status}`, "PAIRING_SESSION_NOT_PENDING");
  }

  const child = getChildForParent(parentId, childId);
  const device = store.insert("devices", {
    parentId,
    childId,
    name: session.deviceName,
    platform: session.platform,
    tokenHash: null,
    pairedAt: new Date().toISOString()
  });
  const deviceToken = signDeviceToken(device);

  store.update("devices", device.id, {
    tokenHash: sha256(deviceToken)
  });

  const updatedSession = store.update("pairingSessions", session.id, {
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
      child: serializeChild(child),
      pairedAt: device.pairedAt
    }
  };
}

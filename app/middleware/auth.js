import { unauthorized } from "../lib/errors.js";
import { sha256 } from "../lib/security.js";
import { verifyToken } from "../lib/tokens.js";
import { store } from "../store/jsonStore.js";

function bearerToken(request) {
  const header = request.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw unauthorized("Bearer token is required");
  }

  return token;
}

function verifyRequestToken(request) {
  try {
    const token = bearerToken(request);
    return { token, payload: verifyToken(token) };
  } catch (error) {
    throw unauthorized("Invalid or expired token");
  }
}

export function requireParent(request, response, next) {
  try {
    const { payload } = verifyRequestToken(request);

    if (payload.type !== "parent") {
      throw unauthorized("Parent token is required");
    }

    const parent = store.findById("parents", payload.parentId);

    if (!parent) {
      throw unauthorized("Parent account no longer exists");
    }

    request.parent = parent;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireDevice(request, response, next) {
  try {
    const { token, payload } = verifyRequestToken(request);

    if (payload.type !== "device") {
      throw unauthorized("Device token is required");
    }

    const device = store.findById("devices", payload.deviceId);

    if (!device || device.tokenHash !== sha256(token)) {
      throw unauthorized("Device token is no longer valid");
    }

    request.device = device;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireActor(request, response, next) {
  try {
    const { token, payload } = verifyRequestToken(request);

    if (payload.type === "parent") {
      const parent = store.findById("parents", payload.parentId);

      if (!parent) {
        throw unauthorized("Parent account no longer exists");
      }

      request.parent = parent;
      request.actor = { type: "parent", parent };
      next();
      return;
    }

    if (payload.type === "device") {
      const device = store.findById("devices", payload.deviceId);

      if (!device || device.tokenHash !== sha256(token)) {
        throw unauthorized("Device token is no longer valid");
      }

      request.device = device;
      request.actor = { type: "device", device };
      next();
      return;
    }

    throw unauthorized("Unsupported token type");
  } catch (error) {
    next(error);
  }
}

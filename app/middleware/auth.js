import { unauthorized } from "../lib/errors.js";
import { hashSecret, sha256 } from "../lib/security.js";
import { verifyToken } from "../lib/tokens.js";

const localParentEmail = "local-parent@astir.dev";
const localChildName = "Local Child";
const localDeviceName = "Local Device";
const superAdminRole = "super_admin";

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

function isLegacySuperAdminPayload(payload) {
  return payload.kind === "user" && payload.role === superAdminRole && Boolean(payload.user_id || payload.sub);
}

function legacySuperAdminParent(payload) {
  return {
    id: payload.user_id || payload.sub,
    name: payload.name || "Super Admin",
    email: payload.email || "",
    role: superAdminRole,
    tariff: "premium",
    active: true
  };
}

export function createAuthMiddleware({ children, config, devices, parents, watchLimits }) {
  let localContext = null;

  function getLocalContext() {
    if (localContext) {
      return localContext;
    }

    const now = new Date().toISOString();
    const parent = parents.findByEmail(localParentEmail) || parents.create({
      name: "Local Parent",
      email: localParentEmail,
      passwordHash: hashSecret("password123"),
      pinHash: hashSecret("1234"),
      tariff: "free"
    });
    const child = children.findByParentIdAndName(parent.id, localChildName) || children.create({
      parentId: parent.id,
      name: localChildName,
      birthYear: 2018
    });

    if (!watchLimits.findByChildId(child.id)) {
      watchLimits.create({
        parentId: parent.id,
        childId: child.id,
        dailyMinutes: 1440,
        allowedFrom: "00:00",
        allowedTo: "23:59",
        allowedDays: [1, 2, 3, 4, 5, 6, 7]
      });
    }

    const device = devices.findByChildIdAndName(child.id, localDeviceName) || devices.create({
      parentId: parent.id,
      childId: child.id,
      name: localDeviceName,
      platform: "local",
      tokenHash: "auth-disabled",
      pairedAt: now
    });

    localContext = {
      actor: { type: "parent", parent },
      child,
      device,
      parent
    };

    return localContext;
  }

  function attachLocalParent(request, response, next) {
    const context = getLocalContext();

    request.parent = context.parent;
    request.actor = context.actor;
    next();
  }

  function attachLocalDevice(request, response, next) {
    const context = getLocalContext();

    request.device = context.device;
    request.actor = { type: "device", device: context.device };
    next();
  }

  function attachLocalActor(request, response, next) {
    const context = getLocalContext();

    request.parent = context.parent;
    request.device = context.device;
    request.actor = context.actor;
    next();
  }

  if (!config.requireAuth) {
    return {
      requireActor: attachLocalActor,
      requireDevice: attachLocalDevice,
      requireParent: attachLocalParent
    };
  }

  function requireParent(request, response, next) {
    try {
      const { payload } = verifyRequestToken(request);

      if (isLegacySuperAdminPayload(payload)) {
        request.parent = legacySuperAdminParent(payload);
        next();
        return;
      }

      if (payload.type !== "parent") {
        throw unauthorized("Parent token is required");
      }

      const parent = parents.findById(payload.parentId);

      if (!parent) {
        throw unauthorized("Parent account no longer exists");
      }

      request.parent = parent;
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireDevice(request, response, next) {
    try {
      const { token, payload } = verifyRequestToken(request);

      if (payload.type !== "device") {
        throw unauthorized("Device token is required");
      }

      const device = devices.findById(payload.deviceId);

      if (!device || device.tokenHash !== sha256(token)) {
        throw unauthorized("Device token is no longer valid");
      }

      request.device = device;
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireActor(request, response, next) {
    try {
      const { token, payload } = verifyRequestToken(request);

      if (payload.type === "parent") {
        const parent = parents.findById(payload.parentId);

        if (!parent) {
          throw unauthorized("Parent account no longer exists");
        }

        request.parent = parent;
        request.actor = { type: "parent", parent };
        next();
        return;
      }

      if (isLegacySuperAdminPayload(payload)) {
        const parent = legacySuperAdminParent(payload);

        request.parent = parent;
        request.actor = { type: "parent", parent };
        next();
        return;
      }

      if (payload.type === "device") {
        const device = devices.findById(payload.deviceId);

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

  return {
    requireActor,
    requireDevice,
    requireParent
  };
}

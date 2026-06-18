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

  function firstValue(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== "") || null;
  }

  function legacyUserId(payload) {
    return firstValue(payload.user_id, payload.userId, payload.sub);
  }

  function legacyDeviceId(payload) {
    return firstValue(payload.device_id, payload.deviceId, payload.tv_device_id, payload.tvDeviceId, payload.sub);
  }

  function legacyChildId(payload) {
    return firstValue(payload.child_id, payload.childId, payload.current_child_id, payload.currentChildId);
  }

  function legacyParentId(payload) {
    return firstValue(payload.parent_id, payload.parentId);
  }

  function isLegacyParentPayload(payload) {
    return payload.kind === "user" && payload.role === "parent" && Boolean(legacyUserId(payload));
  }

  async function normalizeDevice(device, payload = {}) {
    if (!device && !legacyDeviceId(payload)) {
      return null;
    }

    const normalized = { ...(device || {}) };

    normalized.id = firstValue(normalized.id, legacyDeviceId(payload));
    normalized.parentId = firstValue(normalized.parentId, normalized.parent_id, legacyParentId(payload));
    normalized.childId = firstValue(normalized.childId, normalized.child_id, legacyChildId(payload));
    normalized.tokenHash = firstValue(normalized.tokenHash, normalized.token_hash);
    normalized.pairedAt = firstValue(normalized.pairedAt, normalized.paired_at);
    normalized.revokedAt = firstValue(normalized.revokedAt, normalized.revoked_at);

    if (!normalized.parentId && normalized.childId) {
      const child = await children.findById(normalized.childId);
      normalized.parentId = firstValue(child?.parentId, child?.parent_id);
    }

    if (normalized.parentId && !normalized.parent) {
      normalized.parent = await parents.findById(normalized.parentId);
    }

    return normalized;
  }

  function isDeviceRevoked(device) {
    return Boolean(device?.revokedAt || device?.revoked_at);
  }

  async function storedDeviceFromPayload(payload) {
    const deviceId = legacyDeviceId(payload);

    return deviceId ? await devices.findById(deviceId) : null;
  }

  async function getLocalContext() {
    if (localContext) {
      return localContext;
    }

    const now = new Date().toISOString();
    const parent = await parents.findByEmail(localParentEmail) || await parents.create({
      name: "Local Parent",
      email: localParentEmail,
      passwordHash: hashSecret("password123"),
      pinHash: hashSecret("1234"),
      tariff: "free"
    });
    const child = await children.findByParentIdAndName(parent.id, localChildName) || await children.create({
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
        allowedDays: [1, 2, 3, 4, 5, 6, 7],
        allowedDates: []
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

  async function attachLocalParent(request, response, next) {
    if (request.get("authorization")) {
      requireParent(request, response, next);
      return;
    }

    try {
      const context = await getLocalContext();

      request.parent = context.parent;
      request.actor = context.actor;
      next();
    } catch (error) {
      next(error);
    }
  }

  async function attachLocalDevice(request, response, next) {
    if (request.get("authorization")) {
      requireDevice(request, response, next);
      return;
    }

    try {
      const context = await getLocalContext();

      request.device = context.device;
      request.actor = { type: "device", device: context.device };
      next();
    } catch (error) {
      next(error);
    }
  }

  async function attachLocalActor(request, response, next) {
    if (request.get("authorization")) {
      requireActor(request, response, next);
      return;
    }

    try {
      const context = await getLocalContext();

      request.parent = context.parent;
      request.device = context.device;
      request.actor = context.actor;
      next();
    } catch (error) {
      next(error);
    }
  }

  if (!config.requireAuth) {
    return {
      requireActor: attachLocalActor,
      requireDevice: attachLocalDevice,
      requireParent: attachLocalParent
    };
  }

  function requireParent(request, response, next) {
    Promise.resolve().then(async () => {
      const { payload } = verifyRequestToken(request);

      if (isLegacySuperAdminPayload(payload)) {
        request.parent = legacySuperAdminParent(payload);
        next();
        return;
      }

      if (payload.type !== "parent") {
        if (!isLegacyParentPayload(payload)) {
          throw unauthorized("Parent token is required");
        }

        const parent = await parents.findById(legacyUserId(payload));

        if (!parent) {
          throw unauthorized("Parent account no longer exists");
        }

        request.parent = parent;
        next();
        return;
      }

      const parent = await parents.findById(payload.parentId);

      if (!parent) {
        throw unauthorized("Parent account no longer exists");
      }

      request.parent = parent;
      next();
    }).catch(next);
  }

  function requireDevice(request, response, next) {
    Promise.resolve().then(async () => {
      const { token, payload } = verifyRequestToken(request);

      if (payload.type === "device") {
        const device = await normalizeDevice(await storedDeviceFromPayload(payload), payload);

        if (!device || isDeviceRevoked(device) || device.tokenHash !== sha256(token)) {
          throw unauthorized("Device token is no longer valid");
        }

        request.device = device;
        next();
        return;
      }

      if (payload.kind === "child_device" || payload.kind === "tv_device") {
        const storedDevice = await storedDeviceFromPayload(payload);
        const device = await normalizeDevice(storedDevice, payload);
        const storedTokenHash = firstValue(storedDevice?.tokenHash, storedDevice?.token_hash);

        if (isDeviceRevoked(device) || (storedTokenHash && storedTokenHash !== sha256(token))) {
          throw unauthorized("Device token is no longer valid");
        }

        if (!device?.id || !device.parentId) {
          throw unauthorized("Device token owner was not found");
        }

        request.device = device;
        next();
        return;
      }

      throw unauthorized("Device token is required");
    }).catch(next);
  }

  function requireActor(request, response, next) {
    Promise.resolve().then(async () => {
      const { token, payload } = verifyRequestToken(request);

      if (payload.type === "parent") {
        const parent = await parents.findById(payload.parentId);

        if (!parent) {
          throw unauthorized("Parent account no longer exists");
        }

        request.parent = parent;
        request.actor = { type: "parent", parent };
        next();
        return;
      }

      if (isLegacyParentPayload(payload)) {
        const parent = await parents.findById(legacyUserId(payload));

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
        const device = await normalizeDevice(await storedDeviceFromPayload(payload), payload);

        if (!device || isDeviceRevoked(device) || device.tokenHash !== sha256(token)) {
          throw unauthorized("Device token is no longer valid");
        }

        request.device = device;
        request.actor = { type: "device", device };
        next();
        return;
      }

      if (payload.kind === "child_device" || payload.kind === "tv_device") {
        const storedDevice = await storedDeviceFromPayload(payload);
        const device = await normalizeDevice(storedDevice, payload);
        const storedTokenHash = firstValue(storedDevice?.tokenHash, storedDevice?.token_hash);

        if (isDeviceRevoked(device) || (storedTokenHash && storedTokenHash !== sha256(token))) {
          throw unauthorized("Device token is no longer valid");
        }

        if (!device?.id || !device.parentId) {
          throw unauthorized("Device token owner was not found");
        }

        request.device = device;
        request.actor = { type: "device", device };
        next();
        return;
      }

      throw unauthorized("Unsupported token type");
    }).catch(next);
  }

  return {
    requireActor,
    requireDevice,
    requireParent
  };
}

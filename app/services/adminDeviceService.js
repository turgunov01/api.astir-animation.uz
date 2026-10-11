import { forbidden, notFound } from "../lib/errors.js";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

// Every paired child device across all families, with who it belongs to and
// when it was last used — the admin "TV устройства" page.
export function createAdminDeviceService({ children, devices, parents, watchSessions }) {
  function assertAdmin(actor) {
    if (!ADMIN_ROLES.has(actor?.role)) {
      throw forbidden("Admin access required", "ADMIN_REQUIRED");
    }
  }

  function personName(person) {
    return [person?.name, person?.last_name || person?.lastName].filter(Boolean).join(" ").trim();
  }

  async function lookup(repository, ids) {
    const rows = await Promise.all([...ids].map(async (id) => [id, await repository.findById(id)]));
    return new Map(rows.filter(([, row]) => row));
  }

  // Latest watch activity and number of sessions per device.
  function activityByDevice() {
    const activity = new Map();

    for (const session of watchSessions.all()) {
      if (!session.deviceId) continue;
      const at = session.updatedAt || session.endedAt || session.startedAt;
      const entry = activity.get(session.deviceId) || { lastActiveAt: null, sessions: 0 };
      entry.sessions += 1;
      if (at && (!entry.lastActiveAt || at > entry.lastActiveAt)) entry.lastActiveAt = at;
      activity.set(session.deviceId, entry);
    }

    return activity;
  }

  return {
    async list(actor) {
      assertAdmin(actor);

      const rows = devices.all();
      const [childMap, parentMap] = await Promise.all([
        lookup(children, new Set(rows.map((device) => device.childId).filter(Boolean))),
        lookup(parents, new Set(rows.map((device) => device.parentId).filter(Boolean)))
      ]);
      const activity = activityByDevice();
      const now = Date.now();

      const items = rows.map((device) => {
        const child = childMap.get(device.childId);
        const parent = parentMap.get(device.parentId);
        const usage = activity.get(device.id) || { lastActiveAt: null, sessions: 0 };
        const revoked = Boolean(device.revokedAt);
        const lastActiveAt = usage.lastActiveAt || device.lastSeenAt || null;

        return {
          id: device.id,
          name: device.name || "Устройство",
          platform: device.platform || "unknown",
          paired_at: device.pairedAt || device.createdAt || null,
          revoked_at: device.revokedAt || null,
          last_active_at: lastActiveAt,
          sessions_count: usage.sessions,
          status: revoked
            ? "revoked"
            : lastActiveAt && now - new Date(lastActiveAt).getTime() < ONLINE_WINDOW_MS
              ? "online"
              : "active",
          child: { id: device.childId, name: child?.name || null, age: child?.age ?? null },
          parent: { id: device.parentId, name: personName(parent) || null, email: parent?.email || null }
        };
      });

      items.sort((left, right) => String(right.last_active_at || right.paired_at || "").localeCompare(String(left.last_active_at || left.paired_at || "")));

      return {
        items,
        total: items.length,
        summary: {
          total: items.length,
          active: items.filter((item) => item.status !== "revoked").length,
          online: items.filter((item) => item.status === "online").length,
          revoked: items.filter((item) => item.status === "revoked").length,
          platforms: items.reduce((counts, item) => ({ ...counts, [item.platform]: (counts[item.platform] || 0) + 1 }), {})
        }
      };
    },

    revoke(actor, deviceId) {
      assertAdmin(actor);

      if (!devices.findById(deviceId)) {
        throw notFound("Device not found", "DEVICE_NOT_FOUND");
      }

      devices.revoke(deviceId);
      return { revoked: true };
    }
  };
}

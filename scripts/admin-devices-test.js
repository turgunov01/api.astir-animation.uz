import assert from "node:assert/strict";
import { createAdminDeviceService } from "../app/services/adminDeviceService.js";

const now = Date.now();
const iso = (offsetMs) => new Date(now - offsetMs).toISOString();
const devices = [
  { id: "d1", name: "SM-A556E", platform: "android", childId: "c1", parentId: "p1", pairedAt: iso(86_400_000) },
  { id: "d2", name: "iPad", platform: "ios", childId: "c2", parentId: "p1", pairedAt: iso(3 * 86_400_000) },
  { id: "d3", name: "Old TV", platform: "android", childId: "c1", parentId: "p1", pairedAt: iso(9 * 86_400_000), revokedAt: iso(86_400_000) }
];
const revoked = [];
const service = createAdminDeviceService({
  devices: {
    all: () => devices,
    findById: (id) => devices.find((device) => device.id === id) || null,
    revoke: (id) => revoked.push(id)
  },
  children: { findById: async (id) => ({ c1: { name: "Amir", age: 6 }, c2: { name: "Laylo", age: 4 } })[id] || null },
  parents: { findById: async (id) => (id === "p1" ? { name: "Sardor", last_name: "T", email: "s@example.com" } : null) },
  watchSessions: {
    all: () => [
      { deviceId: "d1", updatedAt: iso(60_000) },
      { deviceId: "d1", updatedAt: iso(3_600_000) },
      { deviceId: "d2", updatedAt: iso(2 * 86_400_000) }
    ]
  }
});

await assert.rejects(service.list({ role: "parent" }), (error) => error.statusCode === 403);
assert.throws(() => service.revoke({ role: "parent" }, "d1"), (error) => error.statusCode === 403);

const result = await service.list({ role: "super_admin" });
assert.equal(result.total, 3);
assert.deepEqual(result.items.map((item) => item.id), ["d1", "d2", "d3"]);
assert.equal(result.items[0].status, "online");
assert.equal(result.items[0].sessions_count, 2);
assert.equal(result.items[0].child.name, "Amir");
assert.equal(result.items[0].parent.name, "Sardor T");
assert.equal(result.items[1].status, "active");
assert.equal(result.items[2].status, "revoked");
assert.deepEqual(result.summary, { total: 3, active: 2, online: 1, revoked: 1, platforms: { android: 2, ios: 1 } });

assert.throws(() => service.revoke({ role: "admin" }, "missing"), (error) => error.statusCode === 404);
assert.deepEqual(service.revoke({ role: "admin" }, "d2"), { revoked: true });
assert.deepEqual(revoked, ["d2"]);

console.log("Admin devices tests passed");

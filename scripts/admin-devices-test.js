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
const approvals = [];
const service = createAdminDeviceService({
  pairing: { approvePairingSession: async (parentId, sessionId, childId) => { approvals.push([parentId, sessionId, childId]); return { status: "approved" }; } },
  devices: {
    all: () => devices,
    findById: (id) => devices.find((device) => device.id === id) || null,
    revoke: (id) => revoked.push(id)
  },
  children: { findById: async (id) => ({ c1: { name: "Amir", age: 6, parent_id: "p1" }, c2: { name: "Laylo", age: 4, parentId: "p2" } })[id] || null },
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

// Pairing without a phone is approved for the child's own parent, not the admin.
await assert.rejects(service.approvePairing({ role: "parent" }, "s1", "c1"), (error) => error.statusCode === 403);
await assert.rejects(service.approvePairing({ role: "admin", id: "admin" }, "s1", "missing"), (error) => error.statusCode === 404);
assert.deepEqual(await service.approvePairing({ role: "admin", id: "admin" }, "s1", "c1"), { status: "approved" });
assert.deepEqual(await service.approvePairing({ role: "super_admin", id: "admin" }, "s2", "c2"), { status: "approved" });
assert.deepEqual(approvals, [["p1", "s1", "c1"], ["p2", "s2", "c2"]]);

console.log("Admin devices tests passed");

// ---- devices statistics ----
import { computeDeviceStats } from "../app/services/deviceStats.js";
{
  const now = Date.parse("2026-10-11T12:00:00Z");
  const ago = (daysAgo) => new Date(now - daysAgo * 86_400_000).toISOString();
  const devicesList = [
    { id: "tv", childId: "c1", platform: "tv", pairedAt: ago(5) },
    { id: "pad", childId: "c1", platform: "ios", pairedAt: ago(10) },
    { id: "old", childId: "c2", platform: "android", pairedAt: ago(80) },
    { id: "gone", childId: "c2", platform: "android", pairedAt: ago(50), revokedAt: ago(2) }
  ];
  const qr = [
    { status: "approved", createdAt: ago(5), updatedAt: new Date(Date.parse(ago(5)) + 40_000).toISOString() },
    { status: "approved", createdAt: ago(10), updatedAt: new Date(Date.parse(ago(10)) + 20_000).toISOString() },
    { status: "pending", createdAt: ago(3), expiresAt: ago(2.99) },
    { status: "pending", createdAt: ago(0.001), expiresAt: ago(-0.01) },
    { status: "expired", createdAt: ago(45) }
  ];
  const sessions = [
    { deviceId: "tv", startedAt: ago(1), updatedAt: ago(1), watchedSeconds: 900 },
    { deviceId: "pad", startedAt: ago(40), updatedAt: ago(40), watchedSeconds: 100 }
  ];
  const stats = computeDeviceStats({ devices: devicesList, pairingSessions: qr, watchSessions: sessions, childNames: new Map([["c1", "Amir"]]), days: 30, now });

  assert.equal(stats.kpis.paired.value, 2);
  assert.equal(stats.kpis.revoked.value, 1);
  assert.equal(stats.kpis.active.value, 1, "only the TV watched in the period");
  assert.equal(stats.current.connected, 3);
  assert.equal(stats.current.idle, 2, "pad last used 40 days ago, old never used since pairing 80 days ago");
  assert.equal(stats.current.qr_conversion, 50, "2 of 4 codes in the period ended in a pairing");
  assert.equal(stats.current.median_pair_seconds, 40);
  assert.deepEqual(stats.qr_outcomes, [{ key: "approved", count: 2 }, { key: "expired", count: 1 }, { key: "pending", count: 1 }]);
  assert.equal(stats.current.devices_per_child, 1.5);
  assert.deepEqual(stats.per_child.map((row) => row.count), [1, 1, 0]);
  assert.equal(stats.top_devices[0].id, "tv");
  assert.equal(stats.top_devices[0].child_name, "Amir");
  assert.equal(stats.daily.length, 30);
  console.log("device stats tests passed");
}

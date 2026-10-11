import assert from "node:assert/strict";
import { createPairingService } from "../app/services/pairingService.js";

// In-memory pairing sessions, enough for the service.
function memorySessions() {
  const rows = [];
  return {
    rows,
    create(attrs) { const row = { id: `s${rows.length + 1}`, ...attrs }; rows.push(row); return row; },
    findById(id) { return rows.find((row) => row.id === id) || null; },
    findPendingByCode(code) { return rows.find((row) => row.code === code && row.status === "pending") || null; },
    update(id, attrs) { const row = this.findById(id); Object.assign(row, attrs); return row; }
  };
}

const sessions = memorySessions();
const service = createPairingService({ childService: {}, config: { pairingTtlMinutes: 10 }, devices: {}, pairingSessions: sessions });

const created = service.createPairingSession({ deviceName: "Pixel", platform: "android" });
assert.ok(created.expiresInSeconds > 590 && created.expiresInSeconds <= 600, "TTL reported as seconds left");

const found = service.findPendingSessionByCode("parent-1", ` ${created.code.slice(0, 3)} ${created.code.slice(3)} `);
assert.equal(found.id, created.id, "spaces in a typed code are ignored");
assert.equal(found.deviceName, "Pixel");

assert.throws(() => service.findPendingSessionByCode("parent-1", "12"), { code: "PAIRING_CODE_INVALID" });
sessions.update(created.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
assert.throws(() => service.findPendingSessionByCode("parent-1", created.code), { code: "PAIRING_CODE_NOT_FOUND" });

// Guessing is cut off after a handful of attempts.
for (let attempt = 0; attempt < 7; attempt += 1) {
  assert.throws(() => service.findPendingSessionByCode("parent-2", "000000"), { code: "PAIRING_CODE_NOT_FOUND" });
}
for (let attempt = 0; attempt < 3; attempt += 1) {
  assert.throws(() => service.findPendingSessionByCode("parent-2", "000000"), { code: "PAIRING_CODE_NOT_FOUND" });
}
assert.throws(() => service.findPendingSessionByCode("parent-2", "000000"), { code: "PAIRING_CODE_TOO_MANY_ATTEMPTS", statusCode: 429 });

console.log("pairing code tests passed");

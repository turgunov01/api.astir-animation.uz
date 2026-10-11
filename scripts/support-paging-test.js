import assert from "node:assert/strict";
import { listSupportMessages } from "../app/legacy/supportChat.js";

// Records the SQL so we can check how cursors are turned into filters.
function fakeDb(messageAt = "2026-10-11T05:00:00.000Z") {
  const calls = [];
  return {
    calls,
    async one(sql, params) {
      calls.push({ sql, params });
      return sql.includes("SELECT created_at") ? { created_at: messageAt } : null;
    },
    async many(sql, params) {
      calls.push({ sql, params });
      return [];
    }
  };
}

const id = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

// A message id (what released apps send) resolves to that message's time.
let db = fakeDb();
await listSupportMessages(db, "chat-1", { after: id, limit: 10 });
const listCall = db.calls.at(-1);
assert.match(listCall.sql, /m\.created_at > \$2/);
assert.equal(listCall.params[1], "2026-10-11T05:00:00.000Z");

// An ISO timestamp is used directly.
db = fakeDb();
await listSupportMessages(db, "chat-1", { before: "2026-10-10T10:00:00Z" });
assert.equal(db.calls.length, 1);
assert.match(db.calls[0].sql, /m\.created_at < \$2/);

// Garbage is ignored instead of throwing.
db = fakeDb();
await listSupportMessages(db, "chat-1", { after: "not-a-cursor" });
assert.doesNotMatch(db.calls[0].sql, /created_at >/);

console.log("support paging tests passed");

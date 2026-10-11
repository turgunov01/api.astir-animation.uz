import assert from "node:assert/strict";
import { computeParentStats } from "../app/legacy/adminParentStats.js";

const now = Date.parse("2026-10-11T12:00:00Z");
const at = (daysAgo) => new Date(now - daysAgo * 86_400_000).toISOString();
const parents = [
  { id: "a", created_at: at(60), auth_provider: "google", email: "a@x" },
  { id: "b", created_at: at(20), auth_provider: null, email: "b@x" },
  { id: "c", created_at: at(3), auth_provider: "google", email: "c@x", last_login_at: at(0.1) },
  { id: "d", created_at: at(40), auth_provider: "apple", email: "d@x" }
];
const activity = [
  { user_id: "a", at: at(1) },
  { user_id: "a", at: at(0.2) },
  { user_id: "b", at: at(15) },
  { user_id: "d", at: at(35) }
];

const stats = computeParentStats({
  parents,
  activity,
  childCounts: new Map([["a", 2], ["b", 1], ["c", 0], ["d", 4]]),
  deviceParents: new Set(["a", "d", "c"]),
  payingParents: new Set(["a"]),
  days: 30,
  now
});

assert.equal(stats.current.total, 4);
assert.equal(stats.kpis.new_parents.value, 2, "b and c registered in the last 30 days");
assert.equal(stats.kpis.new_parents.previous, 1, "d registered 40 days ago");
assert.equal(stats.current.dau, 2, "a and c today");
assert.equal(stats.current.wau, 2);
assert.equal(stats.current.mau, 3, "a, b, c");
assert.equal(stats.current.stickiness, 66.7);
assert.equal(stats.current.returned_after_week, 33.3, "of a, b, d only a came back this week");
assert.deepEqual(stats.funnel.map((step) => step.count), [4, 3, 2, 1], "c has a device but no child");
assert.deepEqual(stats.children_distribution.map((row) => row.count), [1, 1, 1, 1]);
assert.equal(stats.current.children_per_family, 1.8);
assert.deepEqual(stats.sign_up_methods, [{ method: "google", count: 2 }, { method: "email", count: 1 }, { method: "apple", count: 1 }]);
assert.equal(stats.daily.length, 30);
assert.equal(stats.daily.at(-1).active, 2);

console.log("parent stats tests passed");

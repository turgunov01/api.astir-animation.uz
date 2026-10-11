import assert from "node:assert/strict";
import { childAge, computeChildStats } from "../app/legacy/adminChildStats.js";

const now = Date.parse("2026-10-11T12:00:00Z");
const at = (daysAgo) => new Date(now - daysAgo * 86_400_000).toISOString();

assert.equal(childAge(5, now), 5);
assert.equal(childAge(2018, now), 8, "birth year");
assert.equal(childAge(0, now), null);

const children = [
  { id: "k1", age: 5, active: true, has_pin: true, extended_until: at(-0.1) },
  { id: "k2", age: 2018, active: true, has_pin: true },
  { id: "k3", age: 0, active: false, has_pin: false }
];
const sessions = [
  { childId: "k1", contentId: "m1", startedAt: at(1), watchedSeconds: 600 },
  { childId: "k1", contentId: "m2", startedAt: at(2), watchedSeconds: 300 },
  { childId: "k2", contentId: "m1", startedAt: at(3), watchedSeconds: 1200 },
  { childId: "k2", contentId: "m1", startedAt: at(40), watchedSeconds: 60 },
  { childId: "stranger", contentId: "m1", startedAt: at(1), watchedSeconds: 999 }
];
const limits = new Map([
  ["k1", { dailyMinutes: 60, allowedFrom: "08:00", allowedTo: "20:00", allowedDays: [1, 2, 3, 4, 5, 6, 7] }],
  ["k2", { dailyMinutes: 1440, allowedFrom: "00:00", allowedTo: "23:59", allowedDays: [1, 2, 3, 4, 5, 6, 7] }]
]);
const devices = [{ childId: "k1", platform: "tv" }, { childId: "k2", platform: "android", revokedAt: at(5) }];

const stats = computeChildStats({ children, sessions, limits, devices, titles: new Map([["m1", { ru: "Один" }]]), days: 30, now });

assert.equal(stats.kpis.watchers.value, 2, "the stranger session is ignored");
assert.equal(stats.kpis.watch_minutes.value, 35);
assert.equal(stats.kpis.watch_minutes.previous, 1);
assert.equal(stats.kpis.sessions.value, 3);
assert.equal(stats.current.active_profiles, 2);
assert.equal(stats.current.with_pin, 66.7);
assert.equal(stats.current.with_device, 33.3, "k2's device was revoked");
assert.equal(stats.current.with_limits, 33.3, "k2's limit is the full day");
assert.equal(stats.current.avg_daily_limit_minutes, 60);
assert.equal(stats.current.extended_now, 1);
assert.equal(stats.current.avg_session_minutes, 11.7);
assert.equal(stats.top_content[0].content_id, "m1");
assert.equal(stats.top_content[0].viewers, 2, "k1 and k2 both watched m1");
assert.deepEqual(stats.ages.map((row) => row.count), [0, 1, 1, 0, 0, 1]);
assert.deepEqual(stats.platforms, [{ platform: "tv", count: 1 }]);
assert.equal(stats.daily.length, 30);
assert.equal(stats.by_hour.reduce((sum, value) => sum + value, 0), 35);

console.log("child stats tests passed");

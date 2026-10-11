import assert from "node:assert/strict";
import { buildContentStudioStats } from "../app/legacy/contentStudioStats.js";

const id = "movie-1";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const sessions = [
  { contentId: id, countedAsView: true, childId: "kid-a", deviceId: "tv", viewCountedAt: ago(3_600_000), watchedSeconds: 300, positionSeconds: 600 },
  { contentId: id, countedAsView: true, childId: "kid-a", deviceId: "tv", viewCountedAt: ago(2 * 86_400_000), watchedSeconds: 120, positionSeconds: 200 },
  { contentId: id, countedAsView: true, childId: "kid-b", deviceId: "phone", viewCountedAt: ago(40 * 86_400_000), watchedSeconds: 60, positionSeconds: 100 },
  { contentId: id, countedAsView: false, childId: "kid-c", viewCountedAt: ago(1000) },
  { contentId: "other", countedAsView: true, childId: "kid-a", viewCountedAt: ago(1000) }
];
const db = {
  async many(sql) {
    if (sql.includes("content_reactions")) return [{ reaction: "like", updated_at: ago(86_400_000) }];
    if (sql.includes("FROM comments")) return [{ created_at: ago(3 * 86_400_000) }];
    return [];
  }
};

const stats = await buildContentStudioStats(db, id, {
  days: 28,
  durations: { [id]: 1000 },
  watchSessions: { all: () => sessions },
  devices: { findById: (deviceId) => ({ tv: { platform: "tv" }, phone: { platform: "android" } })[deviceId] },
  children: { findById: async (childId) => ({ "kid-a": { age: 5 }, "kid-b": { age: 11 } })[childId] }
});

assert.equal(stats.daily.length, 28);
assert.equal(stats.totals.views, 2, "only counted views inside the period");
assert.equal(stats.totals.viewers, 1);
assert.equal(stats.totals.watch_seconds, 420);
assert.equal(stats.previous_totals.views, 1, "the 40-day-old view lands in the previous period");
assert.equal(stats.totals.likes, 1);
assert.equal(stats.totals.comments, 1);
assert.equal(stats.lifetime.views, 3);
assert.equal(stats.realtime.views_48h, 1);
assert.equal(stats.realtime.hourly.length, 48);
assert.deepEqual(stats.audience.by_platform, [{ platform: "tv", views: 2 }]);
assert.equal(stats.audience.by_age.find((row) => row.group === "4-6").viewers, 1);
assert.equal(stats.audience.by_age.find((row) => row.group === "10-12").viewers, 1);
assert.equal(stats.retention[0], 100);
assert.equal(stats.retention[5], 50, "kid-a reached 60 %, kid-b only 10 %");

// A series is all its episodes together.
const series = await buildContentStudioStats(db, ["ep-1", "ep-2"], {
  days: 28,
  durations: { "ep-1": 100, "ep-2": 200 },
  watchSessions: { all: () => [
    { contentId: "ep-1", countedAsView: true, childId: "kid-a", viewCountedAt: ago(1000), positionSeconds: 100 },
    { contentId: "ep-2", countedAsView: true, childId: "kid-a", viewCountedAt: ago(2000), positionSeconds: 50 }
  ] }
});
assert.equal(series.totals.views, 2);
assert.equal(series.totals.viewers, 1);
assert.equal(series.retention[5], 50, "ep-1 finished, ep-2 stopped at 25 %");

console.log("content studio stats tests passed");

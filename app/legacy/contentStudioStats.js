// One payload for the admin "Аналитика" tab of a cartoon: zero-filled daily
// series for every metric (views, viewers, watch time, likes, dislikes,
// comments) for the period and the one before it, the last 48 hours by hour,
// audience retention and who watches (age, device, time of day).
//
// Catalog cartoons are watched through v1 watch sessions (JSON store);
// legacy episodes through watch_history. Both are counted.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const AGE_GROUPS = [
  { key: "0-3", max: 3 },
  { key: "4-6", max: 6 },
  { key: "7-9", max: 9 },
  { key: "10-12", max: 12 },
  { key: "13+", max: Infinity }
];

function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function emptyDay() {
  return { views: 0, viewers: new Set(), watch_seconds: 0, likes: 0, dislikes: 0, comments: 0 };
}

function viewerOf(session) {
  return session.childId || session.parentId || session.deviceId || session.id;
}

export async function buildContentStudioStats(db, contentId, {
  days: requestedDays,
  durationSec = 0,
  watchSessions = null,
  devices = null,
  children = null
} = {}) {
  const days = Math.min(Math.max(Number(requestedDays) || 28, 1), 365);
  const now = Date.now();
  const todayStart = new Date(dayKey(now)).getTime();
  const from = todayStart - (days - 1) * DAY_MS;
  const previousFrom = from - days * DAY_MS;

  const buckets = new Map();
  for (let time = previousFrom; time <= todayStart; time += DAY_MS) buckets.set(dayKey(time), emptyDay());
  const bucket = (time) => (time >= previousFrom ? buckets.get(dayKey(time)) : null);

  const hourly = Array.from({ length: 48 }, () => 0);
  const byHourOfDay = Array.from({ length: 24 }, () => 0);
  const byPlatform = new Map();
  const viewerPositions = new Map();
  const childIds = new Set();
  const allViewers = new Set();
  let totalViews = 0;
  let totalWatchSeconds = 0;

  function countView(time, viewer, seconds = 0) {
    totalViews += 1;
    totalWatchSeconds += seconds;
    allViewers.add(viewer);
    const day = bucket(time);
    if (day) {
      day.views += 1;
      day.viewers.add(viewer);
      day.watch_seconds += seconds;
    }
    const hoursAgo = Math.floor((now - time) / HOUR_MS);
    if (hoursAgo >= 0 && hoursAgo < 48) hourly[47 - hoursAgo] += 1;
    if (time >= from) byHourOfDay[new Date(time).getHours()] += 1;
  }

  for (const session of watchSessions?.all?.() || []) {
    if (session.contentId !== contentId || !session.countedAsView) continue;
    const time = new Date(session.viewCountedAt || session.startedAt || session.createdAt).getTime();
    if (!Number.isFinite(time)) continue;
    const viewer = viewerOf(session);
    countView(time, viewer, Number(session.watchedSeconds) || 0);
    viewerPositions.set(viewer, Math.max(viewerPositions.get(viewer) || 0, Number(session.positionSeconds) || 0));
    if (session.childId) childIds.add(session.childId);
    if (time >= from) {
      const platform = devices?.findById?.(session.deviceId)?.platform || (session.actorType === "parent" ? "parent" : "unknown");
      byPlatform.set(platform, (byPlatform.get(platform) || 0) + 1);
    }
  }

  const [history, reactions, comments] = await Promise.all([
    db.many("SELECT viewer_id::text AS viewer, watched_at, position_sec FROM watch_history WHERE content_id::text = $1", [contentId]),
    db.many("SELECT reaction, updated_at FROM content_reactions WHERE target_id::text = $1", [contentId]),
    db.many("SELECT created_at FROM comments WHERE (target_id = $1 OR content_id::text = $1) AND parent_id IS NULL", [contentId])
  ]);

  for (const row of history) {
    const time = new Date(row.watched_at).getTime();
    countView(time, row.viewer);
    viewerPositions.set(row.viewer, Math.max(viewerPositions.get(row.viewer) || 0, Number(row.position_sec) || 0));
  }

  for (const row of reactions) {
    const day = bucket(new Date(row.updated_at).getTime());
    if (day && (row.reaction === "like" || row.reaction === "dislike")) day[`${row.reaction}s`] += 1;
  }

  for (const row of comments) {
    const day = bucket(new Date(row.created_at).getTime());
    if (day) day.comments += 1;
  }

  // Audience by age, from the children who watched in the period.
  const byAge = new Map(AGE_GROUPS.map((group) => [group.key, 0]));
  if (children?.findById) {
    const kids = await Promise.all([...childIds].map((id) => children.findById(id).catch(() => null)));
    for (const kid of kids) {
      const age = Number(kid?.age);
      if (!Number.isFinite(age) || age <= 0) continue;
      const group = AGE_GROUPS.find((item) => age <= item.max);
      byAge.set(group.key, byAge.get(group.key) + 1);
    }
  }

  // Retention: share of viewers who reached each 10 % of the cartoon.
  const retention = Array.from({ length: 11 }, (_, index) => {
    if (!durationSec || !viewerPositions.size) return null;
    const mark = (index / 10) * durationSec;
    const reached = [...viewerPositions.values()].filter((position) => position >= mark || index === 0).length;
    return Math.round((reached / viewerPositions.size) * 100);
  });

  const entries = [...buckets.entries()];
  const slice = (start, end) => entries.slice(start, end);
  const series = (rows) => rows.map(([day, value]) => ({
    day,
    views: value.views,
    viewers: value.viewers.size,
    watch_seconds: value.watch_seconds,
    likes: value.likes,
    dislikes: value.dislikes,
    comments: value.comments
  }));
  const totals = (rows) => {
    const sum = (key) => rows.reduce((total, [, value]) => total + value[key], 0);
    return {
      views: sum("views"),
      viewers: new Set(rows.flatMap(([, value]) => [...value.viewers])).size,
      watch_seconds: sum("watch_seconds"),
      likes: sum("likes"),
      dislikes: sum("dislikes"),
      comments: sum("comments")
    };
  };
  const current = slice(days, days * 2);
  const previous = slice(0, days);

  return {
    range_days: days,
    lifetime: { views: totalViews, viewers: allViewers.size, watch_seconds: totalWatchSeconds },
    totals: totals(current),
    previous_totals: totals(previous),
    daily: series(current),
    realtime: { views_48h: hourly.reduce((total, value) => total + value, 0), hourly },
    retention: retention[0] === null ? [] : retention,
    audience: {
      by_age: [...byAge.entries()].map(([group, viewers]) => ({ group, viewers })),
      by_platform: [...byPlatform.entries()].map(([platform, views]) => ({ platform, views })),
      by_hour: byHourOfDay
    }
  };
}

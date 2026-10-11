import { localDayKey, localDayStart, localHour } from "../lib/localDay.js";

// Children report for the admin "Дети" page: how many kids watch and how
// much, when (by day, hour and weekday), what they watch, their ages, how
// many profiles are protected (PIN, screen-time limits, paired devices).

const DAY_MS = 86_400_000;
const FULL_DAY = 1440;
const AGE_GROUPS = [
  { key: "0-3", label: "0–3 года", max: 3 },
  { key: "4-6", label: "4–6 лет", max: 6 },
  { key: "7-9", label: "7–9 лет", max: 9 },
  { key: "10-12", label: "10–12 лет", max: 12 },
  { key: "13+", label: "13+", max: Infinity }
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function ratio(part, whole) {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

function kpi(current, previous) {
  return { value: current, previous, delta_percent: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
}

// The age field holds either an age or (in older profiles) a birth year.
export function childAge(value, now = Date.now()) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (number > 1900) return new Date(now).getUTCFullYear() - number;
  return number;
}

// A limit restricts something: fewer than 24 h, a time window or some days off.
function isRestrictive(limit) {
  if (!limit) return false;
  const minutes = Number(limit.dailyMinutes ?? FULL_DAY);
  const days = Array.isArray(limit.allowedDays) ? limit.allowedDays.length : 7;
  const window = `${limit.allowedFrom || "00:00"}-${limit.allowedTo || "23:59"}`;
  return minutes < FULL_DAY || days < 7 || window !== "00:00-23:59";
}

export function computeChildStats({ children, sessions, limits, devices, titles = new Map(), days = 30, now = Date.now() }) {
  const todayStart = localDayStart(now);
  const from = todayStart - (days - 1) * DAY_MS;
  const previousFrom = from - days * DAY_MS;
  const end = todayStart + DAY_MS;
  const childIds = new Set(children.map((child) => String(child.id)));

  const at = (session) => new Date(session.startedAt || session.createdAt).getTime();
  const seconds = (session) => Number(session.watchedSeconds ?? session.durationSeconds) || 0;
  const own = sessions.filter((session) => session.childId && childIds.has(String(session.childId)));
  const between = (start, stop) => own.filter((session) => at(session) >= start && at(session) < stop);
  const current = between(from, end);
  const previous = between(previousFrom, from);
  const watchers = (rows) => new Set(rows.map((session) => String(session.childId))).size;
  const watchSeconds = (rows) => rows.reduce((sum, session) => sum + seconds(session), 0);

  const daily = [];
  for (let time = from; time < end; time += DAY_MS) {
    const rows = current.filter((session) => localDayKey(at(session)) === localDayKey(time));
    daily.push({ day: localDayKey(time), watch_minutes: Math.round(watchSeconds(rows) / 60), watchers: watchers(rows), sessions: rows.length });
  }

  const byHour = Array.from({ length: 24 }, () => 0);
  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const session of current) {
    const minutes = seconds(session) / 60;
    byHour[localHour(at(session))] += minutes;
    byWeekday[(new Date(at(session) + 5 * 3_600_000).getUTCDay() + 6) % 7] += minutes;
  }

  const top = new Map();
  for (const session of current) {
    const key = String(session.contentId || "");
    if (!key) continue;
    const entry = top.get(key) || { content_id: key, title: titles.get(key) || null, watch_seconds: 0, viewers: new Set() };
    entry.watch_seconds += seconds(session);
    entry.viewers.add(String(session.childId));
    top.set(key, entry);
  }

  const ages = new Map(AGE_GROUPS.map((group) => [group.key, 0]));
  let unknownAge = 0;
  for (const child of children) {
    const age = childAge(child.age, now);
    if (age === null) unknownAge += 1;
    else ages.set(AGE_GROUPS.find((group) => age <= group.max).key, ages.get(AGE_GROUPS.find((group) => age <= group.max).key) + 1);
  }

  const restrictive = children.map((child) => limits.get(String(child.id))).filter(isRestrictive);
  const dailyLimits = restrictive.map((limit) => Number(limit.dailyMinutes ?? FULL_DAY)).filter((minutes) => minutes < FULL_DAY);
  const pairedChildren = new Set(devices.filter((device) => !device.revokedAt).map((device) => String(device.childId)));
  const platforms = new Map();
  for (const device of devices) {
    if (device.revokedAt || !childIds.has(String(device.childId))) continue;
    platforms.set(device.platform || "unknown", (platforms.get(device.platform || "unknown") || 0) + 1);
  }

  const watchersNow = watchers(current);
  return {
    range_days: days,
    kpis: {
      watchers: kpi(watchersNow, watchers(previous)),
      watch_minutes: kpi(Math.round(watchSeconds(current) / 60), Math.round(watchSeconds(previous) / 60)),
      sessions: kpi(current.length, previous.length)
    },
    current: {
      total: children.length,
      active_profiles: children.filter((child) => child.active !== false).length,
      with_pin: ratio(children.filter((child) => child.has_pin).length, children.length),
      with_device: ratio(children.filter((child) => pairedChildren.has(String(child.id))).length, children.length),
      with_limits: ratio(restrictive.length, children.length),
      avg_daily_limit_minutes: dailyLimits.length ? Math.round(dailyLimits.reduce((sum, value) => sum + value, 0) / dailyLimits.length) : null,
      extended_now: children.filter((child) => child.extended_until && new Date(child.extended_until).getTime() > now).length,
      minutes_per_watcher_day: watchersNow ? Math.round((watchSeconds(current) / 60 / watchersNow / days) * 10) / 10 : 0,
      avg_session_minutes: current.length ? Math.round((watchSeconds(current) / 60 / current.length) * 10) / 10 : 0,
      watching_share: ratio(watchersNow, children.length)
    },
    daily,
    by_hour: byHour.map((minutes) => Math.round(minutes)),
    by_weekday: WEEKDAYS.map((label, index) => ({ label, minutes: Math.round(byWeekday[index]) })),
    ages: [...AGE_GROUPS.map((group) => ({ label: group.label, count: ages.get(group.key) })), { label: "Не указан", count: unknownAge }],
    platforms: [...platforms.entries()].map(([platform, count]) => ({ platform, count })).sort((left, right) => right.count - left.count),
    top_content: [...top.values()]
      .map(({ viewers, ...row }) => ({ ...row, viewers: viewers.size }))
      .sort((left, right) => right.watch_seconds - left.watch_seconds)
      .slice(0, 5)
  };
}

export async function buildChildStats(db, { days: requestedDays, watchSessions = null, watchLimits = null, devices = null, contentMovies = null } = {}) {
  const days = [7, 30, 90, 365].includes(Number(requestedDays)) ? Number(requestedDays) : 30;
  const [children, legacyTitles] = await Promise.all([
    db.many("SELECT id::text AS id, age, active, extended_until, pin_hash IS NOT NULL AS has_pin FROM children"),
    db.many("SELECT id::text AS id, title FROM content")
  ]);

  const titles = new Map(legacyTitles.map((row) => [row.id, row.title]));
  for (const movie of contentMovies?.list?.() || []) titles.set(String(movie.id), movie.title);

  return computeChildStats({
    children,
    sessions: watchSessions?.all?.() || [],
    limits: new Map(children.map((child) => [child.id, watchLimits?.findByChildId?.(child.id)])),
    devices: devices?.all?.() || [],
    titles,
    days
  });
}

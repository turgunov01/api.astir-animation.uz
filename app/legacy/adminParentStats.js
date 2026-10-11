import { localDayKey, localDayStart } from "../lib/localDay.js";
// Parents report for the admin "Родители" page: registrations and active
// parents by day, DAU/WAU/MAU, a funnel (registered → added a child →
// paired a device → paid), sign-up methods, children per family and how many
// come back after the first week.
//
// "Active" = signed in or refreshed a session that day (every app start
// refreshes the token), which is the activity signal we have for parents.

const DAY_MS = 86_400_000;
const PAID = ["succeeded", "success", "paid", "completed"];

const dayKey = localDayKey;

function ratio(part, whole) {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

function kpi(current, previous) {
  return { value: current, previous, delta_percent: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
}

export function computeParentStats({ parents, activity, childCounts, deviceParents, payingParents, days = 30, now = Date.now() }) {
  const todayStart = localDayStart(now);
  const from = todayStart - (days - 1) * DAY_MS;
  const previousFrom = from - days * DAY_MS;
  const end = todayStart + DAY_MS;
  const created = (parent) => new Date(parent.created_at).getTime();

  // Activity events per parent (logins + session refreshes).
  const events = new Map();
  const touch = (id, time) => {
    if (!id || !Number.isFinite(time)) return;
    if (!events.has(id)) events.set(id, []);
    events.get(id).push(time);
  };
  for (const row of activity) touch(String(row.user_id), new Date(row.at).getTime());
  for (const parent of parents) if (parent.last_login_at) touch(String(parent.id), new Date(parent.last_login_at).getTime());

  const activeBetween = (start, stop) => parents.filter((parent) => (events.get(String(parent.id)) || []).some((time) => time >= start && time < stop)).length;
  const registeredBetween = (start, stop) => parents.filter((parent) => created(parent) >= start && created(parent) < stop).length;

  const daily = [];
  for (let time = from; time < end; time += DAY_MS) {
    daily.push({ day: dayKey(time), registrations: registeredBetween(time, time + DAY_MS), active: activeBetween(time, time + DAY_MS) });
  }

  const dau = activeBetween(todayStart, end);
  const wau = activeBetween(now - 7 * DAY_MS, now + 1);
  const mau = activeBetween(now - 30 * DAY_MS, now + 1);

  // Came back: registered more than a week ago and active during the last week.
  const veterans = parents.filter((parent) => created(parent) < now - 7 * DAY_MS);
  const returned = veterans.filter((parent) => (events.get(String(parent.id)) || []).some((time) => time >= now - 7 * DAY_MS)).length;

  const ids = parents.map((parent) => String(parent.id));
  const withChild = ids.filter((id) => (childCounts.get(id) || 0) > 0);
  const withDevice = withChild.filter((id) => deviceParents.has(id));
  const paid = ids.filter((id) => payingParents.has(id));

  const methods = new Map();
  for (const parent of parents) {
    const method = parent.auth_provider || (parent.phone && !parent.email ? "phone" : "email");
    methods.set(method, (methods.get(method) || 0) + 1);
  }

  const childBuckets = [
    { label: "Без детей", count: 0 },
    { label: "1 ребёнок", count: 0 },
    { label: "2 ребёнка", count: 0 },
    { label: "3 и больше", count: 0 }
  ];
  for (const id of ids) childBuckets[Math.min(childCounts.get(id) || 0, 3)].count += 1;
  const totalChildren = ids.reduce((sum, id) => sum + (childCounts.get(id) || 0), 0);

  return {
    range_days: days,
    kpis: {
      new_parents: kpi(registeredBetween(from, end), registeredBetween(previousFrom, from)),
      active_parents: kpi(activeBetween(from, end), activeBetween(previousFrom, from))
    },
    current: {
      total: parents.length,
      dau,
      wau,
      mau,
      stickiness: ratio(dau, mau),
      returned_after_week: ratio(returned, veterans.length),
      children_total: totalChildren,
      children_per_family: parents.length ? Math.round((totalChildren / parents.length) * 10) / 10 : 0
    },
    funnel: [
      { key: "registered", label: "Зарегистрировались", count: ids.length },
      { key: "child", label: "Добавили ребёнка", count: withChild.length },
      { key: "device", label: "Подключили устройство", count: withDevice.length },
      { key: "paid", label: "Оплатили подписку", count: paid.length }
    ].map((step) => ({ ...step, percent: ratio(step.count, ids.length) })),
    sign_up_methods: [...methods.entries()].map(([method, count]) => ({ method, count })).sort((left, right) => right.count - left.count),
    children_distribution: childBuckets,
    daily
  };
}

export async function buildParentStats(db, { days: requestedDays, devices = null } = {}) {
  const days = [7, 30, 90, 365].includes(Number(requestedDays)) ? Number(requestedDays) : 30;
  const [parents, activity, children, payers] = await Promise.all([
    db.many("SELECT id, created_at, last_login_at, auth_provider, email, phone FROM users WHERE role = 'parent'"),
    db.many("SELECT user_id, created_at AS at FROM refresh_tokens WHERE created_at >= now() - interval '800 days'"),
    db.many("SELECT parent_id::text AS parent_id, count(*)::int AS count FROM children GROUP BY parent_id"),
    db.many(`
      SELECT DISTINCT parent_id::text AS parent_id FROM v1_transactions WHERE status = ANY($1::text[])
      UNION SELECT DISTINCT user_id::text FROM subscriptions WHERE status IN ('active', 'canceled', 'expired')
    `, [PAID])
  ]);

  const deviceParents = new Set(
    (devices?.all?.() || devices?.list?.() || [])
      .filter((device) => !device.revokedAt)
      .map((device) => String(device.parentId || device.parent_id))
  );

  return computeParentStats({
    parents,
    activity,
    childCounts: new Map(children.map((row) => [row.parent_id, row.count])),
    deviceParents,
    payingParents: new Set(payers.map((row) => row.parent_id)),
    days
  });
}

import { localDayKey, localDayStart } from "../lib/localDay.js";

// Devices report for the admin "Устройства" page: pairings and disconnects
// by day, active and idle devices, how often a QR code ends in a pairing and
// how long it takes, platforms, devices per child and the busiest devices.

const DAY_MS = 86_400_000;
const IDLE_AFTER_DAYS = 30;

function ratio(part, whole) {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

function kpi(current, previous) {
  return { value: current, previous, delta_percent: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
}

const time = (value) => (value ? new Date(value).getTime() : NaN);

const ATTEMPT_GAP_MS = 15 * 60 * 1000;

export function computeDeviceStats({ devices, pairingSessions, watchSessions, childNames = new Map(), days = 30, now = Date.now() }) {
  const todayStart = localDayStart(now);
  const from = todayStart - (days - 1) * DAY_MS;
  const previousFrom = from - days * DAY_MS;
  const end = todayStart + DAY_MS;
  const inRange = (value, start, stop) => value >= start && value < stop;

  const pairedAt = (device) => time(device.pairedAt || device.createdAt);
  const pairedBetween = (start, stop) => devices.filter((device) => inRange(pairedAt(device), start, stop)).length;
  const revokedBetween = (start, stop) => devices.filter((device) => inRange(time(device.revokedAt), start, stop)).length;

  // Activity per device from watch sessions.
  const activity = new Map();
  for (const session of watchSessions) {
    if (!session.deviceId) continue;
    const at = time(session.updatedAt || session.endedAt || session.startedAt);
    const entry = activity.get(session.deviceId) || { last: 0, seconds: 0, sessions: [] };
    entry.last = Math.max(entry.last, Number.isFinite(at) ? at : 0);
    entry.seconds += Number(session.watchedSeconds ?? session.durationSeconds) || 0;
    entry.sessions.push(at);
    activity.set(session.deviceId, entry);
  }
  const activeBetween = (start, stop) => devices.filter((device) => (activity.get(device.id)?.sessions || []).some((at) => inRange(at, start, stop))).length;

  const connected = devices.filter((device) => !device.revokedAt);
  const idle = connected.filter((device) => {
    const last = activity.get(device.id)?.last || pairedAt(device);
    return now - last > IDLE_AFTER_DAYS * DAY_MS;
  });

  // QR pairing: a pending code past its expiry is an abandoned attempt.
  const outcome = (session) => (session.status === "approved" ? "approved" : session.status === "pending" && time(session.expiresAt) > now ? "pending" : "expired");
  const qr = (start, stop) => pairingSessions.filter((session) => inRange(time(session.createdAt), start, stop));
  const qrNow = qr(from, end);
  const qrBefore = qr(previousFrom, from);
  const approvedNow = qrNow.filter((session) => outcome(session) === "approved");
  // One attempt = the codes a device shows in a row (it regenerates them while
  // waiting), so conversion reflects people, not refreshed QR codes.
  const attempts = (list) => {
    const groups = [];
    const open = new Map();
    for (const session of [...list].sort((left, right) => time(left.createdAt) - time(right.createdAt))) {
      const key = session.deviceName ? `${session.deviceName}|${session.platform || ""}` : `#${session.id || groups.length}`;
      const current = open.get(key);
      const lastEnd = current ? time(current.at(-1).expiresAt) || time(current.at(-1).createdAt) : 0;
      if (current && time(session.createdAt) - lastEnd <= ATTEMPT_GAP_MS) {
        current.push(session);
      } else {
        const group = [session];
        groups.push(group);
        open.set(key, group);
      }
    }
    return groups.map((group) => (group.some((session) => outcome(session) === "approved") ? "approved" : outcome(group.at(-1))));
  };
  const attemptsNow = attempts(qrNow);
  const attemptsBefore = attempts(qrBefore);
  const pairSeconds = approvedNow
    .map((session) => (time(session.approvedAt || session.updatedAt) - time(session.createdAt)) / 1000)
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0);
  const sorted = [...pairSeconds].sort((left, right) => left - right);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

  const daily = [];
  for (let day = from; day < end; day += DAY_MS) {
    daily.push({
      day: localDayKey(day),
      paired: pairedBetween(day, day + DAY_MS),
      revoked: revokedBetween(day, day + DAY_MS),
      active: activeBetween(day, day + DAY_MS),
      qr_codes: qr(day, day + DAY_MS).length
    });
  }

  const platforms = new Map();
  for (const device of connected) platforms.set(device.platform || "unknown", (platforms.get(device.platform || "unknown") || 0) + 1);

  const perChild = new Map();
  for (const device of connected) if (device.childId) perChild.set(device.childId, (perChild.get(device.childId) || 0) + 1);
  const perChildBuckets = [
    { label: "1 устройство", count: 0 },
    { label: "2 устройства", count: 0 },
    { label: "3 и больше", count: 0 }
  ];
  for (const value of perChild.values()) perChildBuckets[Math.min(value, 3) - 1].count += 1;

  return {
    range_days: days,
    kpis: {
      paired: kpi(pairedBetween(from, end), pairedBetween(previousFrom, from)),
      active: kpi(activeBetween(from, end), activeBetween(previousFrom, from)),
      revoked: kpi(revokedBetween(from, end), revokedBetween(previousFrom, from)),
      qr_codes: kpi(qrNow.length, qrBefore.length)
    },
    current: {
      total: devices.length,
      connected: connected.length,
      idle: idle.length,
      idle_share: ratio(idle.length, connected.length),
      children_with_devices: perChild.size,
      devices_per_child: perChild.size ? Math.round((connected.length / perChild.size) * 10) / 10 : 0,
      qr_conversion: ratio(attemptsNow.filter((result) => result === "approved").length, attemptsNow.length),
      qr_conversion_previous: ratio(attemptsBefore.filter((result) => result === "approved").length, attemptsBefore.length),
      qr_attempts: attemptsNow.length,
      median_pair_seconds: median === null ? null : Math.round(median),
      churn_share: ratio(devices.filter((device) => device.revokedAt).length, devices.length)
    },
    qr_outcomes: ["approved", "expired", "pending"].map((key) => ({ key, count: qrNow.filter((session) => outcome(session) === key).length })),
    daily,
    platforms: [...platforms.entries()].map(([platform, count]) => ({ platform, count })).sort((left, right) => right.count - left.count),
    per_child: perChildBuckets,
    top_devices: connected
      .map((device) => ({
        id: device.id,
        name: device.name || "Устройство",
        platform: device.platform || "unknown",
        child_name: childNames.get(device.childId) || null,
        watch_seconds: activity.get(device.id)?.seconds || 0,
        last_active_at: activity.get(device.id)?.last ? new Date(activity.get(device.id).last).toISOString() : null
      }))
      .filter((device) => device.watch_seconds > 0)
      .sort((left, right) => right.watch_seconds - left.watch_seconds)
      .slice(0, 5)
  };
}

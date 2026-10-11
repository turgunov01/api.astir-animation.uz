// Day boundaries for admin reports in Tashkent time (UTC+5, no DST), so a
// login at 02:00 local time counts for "today", not for yesterday in UTC.
const OFFSET_MS = 5 * 60 * 60 * 1000;

export function localDayKey(time) {
  return new Date(time + OFFSET_MS).toISOString().slice(0, 10);
}

// The instant local midnight of `time`'s day happens.
export function localDayStart(time) {
  return Date.parse(localDayKey(time)) - OFFSET_MS;
}

export function localHour(time) {
  return new Date(time + OFFSET_MS).getUTCHours();
}

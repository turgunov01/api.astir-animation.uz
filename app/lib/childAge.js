// A child's birth date (YYYY-MM-DD) and the age derived from it. The age
// column is kept in sync for older clients that still read it.

const MAX_AGE_YEARS = 25;

function pad(value) {
  return String(value).padStart(2, "0");
}

// `pg` returns DATE columns as a local-midnight Date; strings pass through.
export function formatBirthDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function ageFromBirthDate(birthDate, now = new Date()) {
  const formatted = formatBirthDate(birthDate);
  if (!formatted) return null;
  const [year, month, day] = formatted.split("-").map(Number);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return Math.max(age, 0);
}

// Validates an incoming birth date. Returns undefined when the field is
// absent, null to clear it, or the normalized date; throws on bad input.
export function parseBirthDate(value, { now = new Date(), onInvalid }) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const formatted = formatBirthDate(value);
  const [year, month, day] = (formatted || "").split("-").map(Number);
  const date = formatted ? new Date(year, month - 1, day) : null;
  const valid = date && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  const oldest = new Date(now.getFullYear() - MAX_AGE_YEARS, now.getMonth(), now.getDate());
  if (!valid || date > now || date < oldest) {
    throw onInvalid();
  }
  return formatted;
}

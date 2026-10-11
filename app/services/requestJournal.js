import crypto from "node:crypto";

// Full journal of recent API requests (app, admin panel, TVs) for the admin
// "Отладка API → Все запросы" tab: who called what, with which headers,
// query and body, and exactly what the server answered. Kept in memory
// (latest N), secrets masked, big bodies truncated.

const MAX_ENTRIES = 2000;
const MAX_BODY_CHARS = 20_000;
const SECRET_KEY = /pass(word)?|token|secret|^pin$|pin_?code|otp|authorization|cookie|signature|card_?number|cvv|cvc|private_?key|refresh|setup_?token|x-setup-token|api_?key/i;
const SKIP = [/^\/health$/, /\/media(-thumb)?\//, /\/admin\/api-(requests|stats)/, /\/admin\/logs/, /^\/favicon/];

export function maskSecrets(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => maskSecrets(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) && item !== null && item !== "" ? "••••" : maskSecrets(item, depth + 1)
  ]));
}

function truncate(value) {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return undefined;
  if (text.length <= MAX_BODY_CHARS) return typeof value === "string" ? value : value;
  return `${text.slice(0, MAX_BODY_CHARS)}… [обрезано, всего ${text.length} символов]`;
}

function parseBody(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// Which client made the call.
export function detectClient(headers = {}) {
  const userAgent = String(headers["user-agent"] || "");
  const origin = String(headers.origin || headers.referer || "");
  if (/dash\./i.test(origin) || /localhost:3\d{3}/.test(origin)) return "admin";
  if (/dart|okhttp|cfnetwork|astir/i.test(userAgent)) return "app";
  if (/mozilla|chrome|safari/i.test(userAgent)) return "browser";
  return "other";
}

export function shouldCapture(url) {
  const path = String(url || "").split("?")[0];
  return !SKIP.some((pattern) => pattern.test(path));
}

function maskQuery(url) {
  const [path, query = ""] = String(url).split("?");
  if (!query) return { path, query: {} };
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path, query: maskSecrets(params) };
}

// One journal entry from a finished request: summary columns plus the
// masked details (headers, bodies, files).
export function buildJournalEntry({ request, response, responseBody, durationMs }) {
  const url = request.originalUrl || request.url;
  const { path, query } = maskQuery(url);
  const user = request.legacyUser || request.parent || null;
  const device = request.actor?.device || request.legacyActor?.device || null;
  const files = request.file ? [request.file] : Array.isArray(request.files) ? request.files : request.files ? Object.values(request.files).flat() : [];
  const summary = user
    ? { id: user.id, name: [user.name, user.last_name].filter(Boolean).join(" ").trim() || null, email: user.email || null, role: user.role || null }
    : device ? { id: device.id, name: device.name || "Устройство", role: "device" } : null;

  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    method: request.method,
    path,
    query,
    status: response.statusCode,
    duration_ms: durationMs,
    request_id: request.id || null,
    client: detectClient(request.headers),
    user_id: summary?.id ? String(summary.id) : null,
    user_summary: summary,
    error: request.errorMessage || null,
    detail: {
      ip: request.ip || null,
      request: {
        headers: maskSecrets({ ...request.headers }),
        body: truncate(maskSecrets(request.body && Object.keys(request.body).length ? request.body : undefined)),
        files: files.map((file) => ({ field: file.fieldname, name: file.originalname, type: file.mimetype, size: file.size }))
      },
      response: {
        headers: maskSecrets(typeof response.getHeaders === "function" ? { ...response.getHeaders() } : {}),
        body: truncate(maskSecrets(parseBody(responseBody)))
      }
    }
  };
}

// In-memory journal, used when there is no database (tests, local runs).
export function createRequestJournal() {
  const entries = [];

  const shape = (entry) => ({
    ...entry,
    user: entry.user_summary,
    ip: entry.detail?.ip || null,
    request: entry.detail?.request,
    response: entry.detail?.response
  });

  return {
    shouldCapture,

    add(entry) {
      entries.push(entry);
      while (entries.length > MAX_ENTRIES) entries.shift();
    },

    // Newest first; `before` (an entry id) pages back.
    list({ client = "", status = "", q = "", method = "", before = "", limit = 100 } = {}) {
      const size = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const needle = String(q).trim().toLowerCase();
      let rows = [...entries].reverse();
      if (before) {
        const index = rows.findIndex((entry) => entry.id === before);
        if (index !== -1) rows = rows.slice(index + 1);
      }
      rows = rows.filter((entry) => {
        if (client && entry.client !== client) return false;
        if (method && entry.method !== method) return false;
        if (status === "errors" && entry.status < 400) return false;
        if (status === "5xx" && entry.status < 500) return false;
        if (status === "4xx" && (entry.status < 400 || entry.status >= 500)) return false;
        if (!needle) return true;
        return [entry.path, entry.user_summary?.name, entry.user_summary?.email, entry.error, entry.request_id, String(entry.status)]
          .some((value) => String(value || "").toLowerCase().includes(needle));
      });
      const counts = { all: entries.length, app: 0, admin: 0, browser: 0, other: 0 };
      for (const entry of entries) counts[entry.client] = (counts[entry.client] || 0) + 1;
      return {
        counts,
        has_more: rows.length > size,
        data: rows.slice(0, size).map(({ detail, user_summary: user, ...summary }) => ({ ...summary, user, ip: detail?.ip || null }))
      };
    },

    get(id) {
      const entry = entries.find((item) => item.id === id);
      return entry ? shape(entry) : null;
    }
  };
}

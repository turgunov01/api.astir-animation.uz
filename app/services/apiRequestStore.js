import { normalizeRoute } from "./apiMonitor.js";

// Postgres-backed store of API requests behind the admin "Отладка API": the
// journal (with masked details) and the monitoring numbers survive restarts.
// Writes are batched every few seconds so requests are not slowed down.

const FLUSH_MS = 3000;
const BATCH = 400;
const KEEP_DAYS = 30;
const KEEP_DETAIL_DAYS = 7;
export const RANGES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080, "30d": 43200 };
const COLUMNS = ["id", "at", "method", "route", "path", "status", "duration_ms", "client", "user_id", "user_summary", "request_id", "error", "query", "detail"];

function bucketMinutes(minutes) {
  if (minutes <= 60) return 1;
  if (minutes <= 360) return 5;
  if (minutes <= 1440) return 30;
  if (minutes <= 10080) return 180;
  return 720;
}

const round = (value) => Math.round((Number(value) || 0) * 10) / 10;

export function createApiRequestStore({ db }) {
  const buffer = [];
  let flushing = false;

  async function flush() {
    if (flushing || !buffer.length) return;
    flushing = true;
    try {
      while (buffer.length) {
        const rows = buffer.splice(0, BATCH);
        const params = [];
        const values = rows.map((row) => {
          const placeholders = COLUMNS.map((column) => {
            const value = row[column];
            params.push(value !== null && typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value ?? null);
            return `$${params.length}`;
          });
          return `(${placeholders.join(", ")})`;
        });
        await db.query(`INSERT INTO api_requests (${COLUMNS.join(", ")}) VALUES ${values.join(", ")} ON CONFLICT (id) DO NOTHING`, params);
      }
    } catch {
      // Losing a few debug rows is better than failing requests.
    } finally {
      flushing = false;
    }
  }

  async function cleanup() {
    try {
      await db.query(`DELETE FROM api_requests WHERE at < now() - interval '${KEEP_DAYS} days'`);
      await db.query(`UPDATE api_requests SET detail = NULL WHERE detail IS NOT NULL AND at < now() - interval '${KEEP_DETAIL_DAYS} days'`);
    } catch {
      // Table may not exist yet.
    }
  }

  setInterval(flush, FLUSH_MS).unref();
  setInterval(cleanup, 60 * 60 * 1000).unref();
  cleanup();

  return {
    add(entry) {
      buffer.push({ ...entry, route: entry.route || normalizeRoute(entry.path) });
      if (buffer.length >= BATCH) flush();
    },

    flush,

    async stats({ range = "1h" } = {}) {
      await flush();
      const minutes = RANGES[range] || 60;
      const bucket = bucketMinutes(minutes);
      const since = `${minutes} minutes`;
      // The API monitor never counted health checks and static media.
      const scope = "at >= now() - $1::interval AND route NOT IN ('/health', '/media/*')";
      const [totals, series, status, endpoints, errors, first] = await Promise.all([
        db.one(`
          SELECT count(*)::int AS requests,
            count(*) FILTER (WHERE status >= 500)::int AS errors,
            count(*) FILTER (WHERE status >= 400 AND status < 500)::int AS client_errors,
            COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms), 0) AS p50,
            COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95,
            COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0) AS p99
          FROM api_requests WHERE ${scope}`, [since]),
        db.many(`
          SELECT b.bucket AS at,
            count(r.id)::int AS requests,
            count(r.id) FILTER (WHERE r.status >= 500)::int AS errors,
            count(r.id) FILTER (WHERE r.status >= 400 AND r.status < 500)::int AS client_errors,
            COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY r.duration_ms), 0) AS p95_ms
          FROM generate_series(date_bin($2::interval, now() - $1::interval, 'epoch'), now(), $2::interval) AS b(bucket)
          LEFT JOIN api_requests r ON date_bin($2::interval, r.at, 'epoch') = b.bucket
            AND r.at >= now() - $1::interval AND r.route NOT IN ('/health', '/media/*')
          GROUP BY b.bucket ORDER BY b.bucket`, [since, `${bucket} minutes`]),
        db.many(`SELECT (status / 100)::int AS class, count(*)::int AS count FROM api_requests WHERE ${scope} GROUP BY 1`, [since]),
        db.many(`
          SELECT method, route, count(*)::int AS requests,
            count(*) FILTER (WHERE status >= 500)::int AS errors,
            count(*) FILTER (WHERE status >= 400 AND status < 500)::int AS client_errors,
            avg(duration_ms) AS avg_ms,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
            max(at) AS last_at
          FROM api_requests WHERE ${scope} GROUP BY method, route`, [since]),
        db.many(`SELECT id, at, method, path, status, duration_ms, client, error, request_id FROM api_requests WHERE ${scope} AND status >= 400 ORDER BY at DESC LIMIT 40`, [since]),
        db.one("SELECT min(at) AS first_at FROM api_requests")
      ]);

      const rows = endpoints.map((row) => ({
        method: row.method,
        route: row.route,
        requests: row.requests,
        errors: row.errors,
        client_errors: row.client_errors,
        error_rate: round(((row.errors + row.client_errors) / row.requests) * 100),
        avg_ms: round(row.avg_ms),
        p95_ms: round(row.p95_ms),
        last_at: row.last_at
      }));
      const requests = totals?.requests || 0;
      const statusMap = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
      for (const row of status) statusMap[`${row.class}xx`] = row.count;

      return {
        range,
        bucket_minutes: bucket,
        since: first?.first_at || null,
        stored_since: first?.first_at || null,
        totals: {
          requests,
          rpm: round(requests / minutes),
          errors: totals?.errors || 0,
          client_errors: totals?.client_errors || 0,
          error_rate: requests ? round(((totals?.errors || 0) / requests) * 100) : 0,
          client_error_rate: requests ? round(((totals?.client_errors || 0) / requests) * 100) : 0,
          p50_ms: round(totals?.p50),
          p95_ms: round(totals?.p95),
          p99_ms: round(totals?.p99)
        },
        status: statusMap,
        series: series.map((row) => ({ at: row.at, requests: row.requests, errors: row.errors, client_errors: row.client_errors, p95_ms: round(row.p95_ms) })),
        top_endpoints: [...rows].sort((left, right) => right.requests - left.requests).slice(0, 10),
        slowest_endpoints: rows.filter((row) => row.requests >= 2).sort((left, right) => right.p95_ms - left.p95_ms).slice(0, 10),
        failing_endpoints: rows.filter((row) => row.errors + row.client_errors > 0).sort((left, right) => (right.errors * 1000 + right.client_errors) - (left.errors * 1000 + left.client_errors)).slice(0, 10),
        recent_errors: errors.map((row) => ({ id: row.id, client: row.client, at: row.at, method: row.method, url: row.path, status: row.status, ms: round(row.duration_ms), message: row.error, request_id: row.request_id }))
      };
    },

    async list({ client = "", status = "", q = "", method = "", before = "", limit = 100 } = {}) {
      await flush();
      const size = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const where = ["at >= now() - interval '7 days'"];
      const params = [];
      const add = (sql, value) => {
        params.push(value);
        where.push(sql.replace("?", `$${params.length}`));
      };
      if (client) add("client = ?", client);
      if (method) add("method = ?", method);
      if (status === "errors") where.push("status >= 400");
      if (status === "4xx") where.push("status >= 400 AND status < 500");
      if (status === "5xx") where.push("status >= 500");
      if (String(q).trim()) {
        params.push(`%${String(q).trim()}%`);
        const term = `$${params.length}`;
        where.push(`(path ILIKE ${term} OR error ILIKE ${term} OR request_id ILIKE ${term} OR user_summary->>'name' ILIKE ${term} OR user_summary->>'email' ILIKE ${term} OR status::text = trim(both '%' from ${term}))`);
      }
      if (before) add("at < (SELECT at FROM api_requests WHERE id = ?)", before);
      params.push(size + 1);
      const [rows, counts] = await Promise.all([
        db.many(`SELECT id, at, method, route, path, status, duration_ms, client, user_summary, request_id, error, query
                 FROM api_requests WHERE ${where.join(" AND ")} ORDER BY at DESC LIMIT $${params.length}`, params),
        db.many("SELECT client, count(*)::int AS count FROM api_requests WHERE at >= now() - interval '7 days' GROUP BY client")
      ]);
      const totals = { all: 0, app: 0, admin: 0, browser: 0, other: 0 };
      for (const row of counts) {
        totals[row.client] = row.count;
        totals.all += row.count;
      }
      return {
        counts: totals,
        has_more: rows.length > size,
        data: rows.slice(0, size).map((row) => ({
          id: row.id, at: row.at, method: row.method, path: row.path, query: row.query || {}, status: row.status,
          duration_ms: row.duration_ms, request_id: row.request_id, client: row.client, ip: null,
          user: row.user_summary, error: row.error
        }))
      };
    },

    async get(id) {
      await flush();
      const row = await db.one("SELECT * FROM api_requests WHERE id = $1", [id]);
      if (!row) return null;
      return {
        id: row.id, at: row.at, method: row.method, path: row.path, query: row.query || {}, status: row.status,
        duration_ms: row.duration_ms, request_id: row.request_id, client: row.client, user: row.user_summary, error: row.error,
        ip: row.detail?.ip || null,
        request: row.detail?.request || { headers: {}, files: [], expired: true },
        response: row.detail?.response || { headers: {}, expired: true }
      };
    }
  };
}

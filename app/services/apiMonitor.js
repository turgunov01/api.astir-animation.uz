import { execSync } from "node:child_process";

// In-memory record of recent API requests (last 24 h, capped) for the admin
// "Отладка API" page: traffic over time, error rate, latency percentiles,
// busiest / slowest / failing endpoints and the latest errors. It resets on
// restart — the page says "с момента запуска".

const MAX_ENTRIES = 60_000;
const KEEP_MS = 24 * 60 * 60 * 1000;
const RANGES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440 };
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[0-9a-f]{24,}|[A-Za-z0-9_-]{32,})$/i;

// "/v1/content/movies/3f2…?limit=5" -> "/v1/content/movies/:id"
export function normalizeRoute(url) {
  const path = String(url || "").split("?")[0] || "/";
  return path
    .split("/")
    .map((segment) => (ID_SEGMENT.test(decodeURIComponent(segment)) ? ":id" : segment))
    .join("/")
    .replace(/\/(?:media|media-thumb)\/.*/, "/media/*") || "/";
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function gitCommit() {
  try {
    return execSync("git log -1 --format=%h·%s", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim().slice(0, 120);
  } catch {
    return null;
  }
}

export function createApiMonitor() {
  const entries = [];
  const startedAt = Date.now();
  const commit = gitCommit();

  function prune(now) {
    while (entries.length && (entries.length > MAX_ENTRIES || now - entries[0].at > KEEP_MS)) entries.shift();
  }

  return {
    record(entry) {
      entry.route ||= normalizeRoute(entry.url);
      // Health checks and static media would drown out real API traffic.
      if (entry.route === "/health" || entry.route === "/media/*") return;
      entries.push(entry);
      prune(entry.at);
    },

    stats({ range = "1h", now = Date.now() } = {}) {
      const minutes = RANGES[range] || 60;
      const from = now - minutes * 60_000;
      const rows = entries.filter((entry) => entry.at >= from);
      const durations = rows.map((entry) => entry.ms).sort((left, right) => left - right);
      const errors = rows.filter((entry) => entry.status >= 500);
      const clientErrors = rows.filter((entry) => entry.status >= 400 && entry.status < 500);

      // Time buckets: per minute up to 1 h, then wider.
      const bucketMinutes = minutes <= 60 ? 1 : minutes <= 360 ? 5 : 30;
      const bucketMs = bucketMinutes * 60_000;
      const start = Math.floor(from / bucketMs) * bucketMs;
      const series = [];
      for (let time = start; time <= now; time += bucketMs) {
        series.push({ at: new Date(time).toISOString(), requests: 0, errors: 0, client_errors: 0, p95_ms: 0, durations: [] });
      }
      for (const entry of rows) {
        const bucket = series[Math.floor((entry.at - start) / bucketMs)];
        if (!bucket) continue;
        bucket.requests += 1;
        if (entry.status >= 500) bucket.errors += 1;
        else if (entry.status >= 400) bucket.client_errors += 1;
        bucket.durations.push(entry.ms);
      }
      for (const bucket of series) {
        bucket.p95_ms = round(percentile(bucket.durations.sort((left, right) => left - right), 95));
        delete bucket.durations;
      }

      const byRoute = new Map();
      for (const entry of rows) {
        const key = `${entry.method} ${entry.route}`;
        const item = byRoute.get(key) || { method: entry.method, route: entry.route, requests: 0, errors: 0, client_errors: 0, durations: [], last_at: 0 };
        item.requests += 1;
        if (entry.status >= 500) item.errors += 1;
        else if (entry.status >= 400) item.client_errors += 1;
        item.durations.push(entry.ms);
        item.last_at = Math.max(item.last_at, entry.at);
        byRoute.set(key, item);
      }
      const endpoints = [...byRoute.values()].map((item) => {
        const sorted = item.durations.sort((left, right) => left - right);
        return {
          method: item.method,
          route: item.route,
          requests: item.requests,
          errors: item.errors,
          client_errors: item.client_errors,
          error_rate: round(((item.errors + item.client_errors) / item.requests) * 100),
          avg_ms: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
          p95_ms: round(percentile(sorted, 95)),
          last_at: new Date(item.last_at).toISOString()
        };
      });

      const status = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
      for (const entry of rows) status[`${String(entry.status)[0]}xx`] = (status[`${String(entry.status)[0]}xx`] || 0) + 1;

      return {
        range,
        bucket_minutes: bucketMinutes,
        since: new Date(Math.max(startedAt, from)).toISOString(),
        started_at: new Date(startedAt).toISOString(),
        totals: {
          requests: rows.length,
          rpm: round(rows.length / Math.max(1, Math.min(minutes, (now - startedAt) / 60_000))),
          errors: errors.length,
          client_errors: clientErrors.length,
          error_rate: rows.length ? round((errors.length / rows.length) * 100) : 0,
          client_error_rate: rows.length ? round((clientErrors.length / rows.length) * 100) : 0,
          p50_ms: round(percentile(durations, 50)),
          p95_ms: round(percentile(durations, 95)),
          p99_ms: round(percentile(durations, 99))
        },
        status,
        series,
        top_endpoints: [...endpoints].sort((left, right) => right.requests - left.requests).slice(0, 10),
        slowest_endpoints: [...endpoints].filter((item) => item.requests >= 2).sort((left, right) => right.p95_ms - left.p95_ms).slice(0, 10),
        failing_endpoints: [...endpoints].filter((item) => item.errors + item.client_errors > 0).sort((left, right) => (right.errors * 1000 + right.client_errors) - (left.errors * 1000 + left.client_errors)).slice(0, 10),
        recent_errors: rows.filter((entry) => entry.status >= 400).sort((left, right) => right.at - left.at).slice(0, 40).map((entry) => ({
          at: new Date(entry.at).toISOString(),
          method: entry.method,
          url: entry.url,
          status: entry.status,
          ms: round(entry.ms),
          message: entry.message || null,
          request_id: entry.requestId || null
        }))
      };
    },

    process() {
      const memory = process.memoryUsage();
      return {
        started_at: new Date(startedAt).toISOString(),
        uptime_seconds: Math.round(process.uptime()),
        node: process.version,
        pid: process.pid,
        memory_mb: { rss: Math.round(memory.rss / 1048576), heap_used: Math.round(memory.heapUsed / 1048576), heap_total: Math.round(memory.heapTotal / 1048576) },
        commit,
        environment: process.env.NODE_ENV || "development"
      };
    }
  };
}

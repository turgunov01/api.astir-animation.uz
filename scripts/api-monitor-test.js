import assert from "node:assert/strict";
import { createApiMonitor, normalizeRoute } from "../app/services/apiMonitor.js";

assert.equal(normalizeRoute("/v1/content/movies/edc017bc-0bb2-46aa-9feb-47e9541c12c6?x=1"), "/v1/content/movies/:id");
assert.equal(normalizeRoute("/api/v1/users/12/children"), "/api/v1/users/:id/children");
assert.equal(normalizeRoute("/media/uploads/a.jpg"), "/media/*");
assert.equal(normalizeRoute("/%c0"), "/%c0", "a malformed escape must not throw");

const monitor = createApiMonitor();
const now = Date.now();
const add = (minutesAgo, method, url, status, ms, message) => monitor.record({ at: now - minutesAgo * 60_000, method, url, status, ms, message });
add(1, "GET", "/v1/content/movies/1", 200, 10);
add(2, "GET", "/v1/content/movies/2", 200, 30);
add(3, "GET", "/v1/content/movies/3", 500, 200, "boom");
add(4, "POST", "/v1/auth/login", 401, 5, "bad password");
add(90, "GET", "/v1/tariffs", 200, 8);
add(1, "GET", "/health", 200, 1);

const hour = monitor.stats({ range: "1h", now });
assert.equal(hour.totals.requests, 4, "health checks and old requests are left out");
assert.equal(hour.totals.errors, 1);
assert.equal(hour.totals.client_errors, 1);
assert.equal(hour.totals.error_rate, 25);
assert.equal(hour.status["2xx"], 2);
assert.equal(hour.top_endpoints[0].route, "/v1/content/movies/:id");
assert.equal(hour.top_endpoints[0].requests, 3);
assert.equal(hour.failing_endpoints[0].errors, 1, "5xx first");
assert.equal(hour.recent_errors[0].message, "boom");
assert.equal(hour.series.length >= 60, true);
assert.equal(monitor.stats({ range: "6h", now }).totals.requests, 5);
assert.ok(monitor.process().uptime_seconds >= 0);

console.log("api monitor tests passed");

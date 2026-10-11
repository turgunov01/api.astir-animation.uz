import assert from "node:assert/strict";
import { createRequestJournal, detectClient, maskSecrets } from "../app/services/requestJournal.js";

assert.deepEqual(maskSecrets({ email: "a@b", password: "x", nested: { refresh_token: "y", pin: "1234", name: "ok" } }), {
  email: "a@b", password: "••••", nested: { refresh_token: "••••", pin: "••••", name: "ok" }
});
assert.equal(detectClient({ "user-agent": "Dart/3.9 (dart:io)" }), "app");
assert.equal(detectClient({ origin: "https://dash.astir-animation.uz", "user-agent": "Mozilla/5.0" }), "admin");
assert.equal(detectClient({ "user-agent": "curl/8" }), "other");

const journal = createRequestJournal();
assert.equal(journal.shouldCapture("/health"), false);
assert.equal(journal.shouldCapture("/media/uploads/a.jpg"), false);
assert.equal(journal.shouldCapture("/api/v1/admin/api-requests"), false);
assert.equal(journal.shouldCapture("/v1/auth/login"), true);

const response = (status, headers = {}) => ({ statusCode: status, getHeaders: () => headers });
journal.add({
  request: { method: "POST", originalUrl: "/v1/auth/login?token=abc&lang=ru", headers: { "user-agent": "Dart/3.9", authorization: "Bearer zzz" }, body: { email: "p@x", password: "secret" }, legacyUser: { id: "u1", name: "Sardor", email: "p@x", role: "parent" } },
  response: response(200, { "content-type": "application/json" }),
  responseBody: JSON.stringify({ accessToken: "aaa", user: { id: "u1" } }),
  durationMs: 12.3
});
journal.add({
  request: { method: "GET", originalUrl: "/api/v1/admin/overview", headers: { origin: "https://dash.astir-animation.uz", "user-agent": "Mozilla" }, body: {}, errorMessage: "boom" },
  response: response(500),
  responseBody: "{\"error\":\"boom\"}",
  durationMs: 40
});

const list = journal.list({});
assert.equal(list.data.length, 2);
assert.equal(list.data[0].path, "/api/v1/admin/overview", "newest first");
assert.equal(list.data[0].request, undefined, "list has summaries only");
assert.deepEqual(list.counts, { all: 2, app: 1, admin: 1, browser: 0, other: 0 });
assert.equal(journal.list({ client: "app" }).data.length, 1);
assert.equal(journal.list({ status: "errors" }).data[0].error, "boom");
assert.equal(journal.list({ q: "sardor" }).data.length, 1);

const login = journal.get(list.data[1].id);
assert.equal(login.request.headers.authorization, "••••");
assert.equal(login.request.body.password, "••••");
assert.equal(login.query.token, "••••");
assert.equal(login.query.lang, "ru");
assert.equal(login.response.body.accessToken, "••••", "tokens in answers are masked too");
assert.equal(login.user.name, "Sardor");
assert.equal(login.client, "app");

console.log("request journal tests passed");

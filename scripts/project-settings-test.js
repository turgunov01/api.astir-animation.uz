import assert from "node:assert/strict";
import { createProjectSettings } from "../app/services/projectSettings.js";

const rows = new Map();
const db = {
  async many() { return [...rows.values()]; },
  async query(sql, [key, value, actor]) { rows.set(key, { key, value: JSON.parse(value), updated_at: new Date().toISOString(), updated_by: actor }); }
};
const settings = createProjectSettings({ db, config: { publicBaseUrl: "https://api.example.uz" } });

let { settings: all } = await settings.all();
assert.equal(all.api.base_url, "https://api.example.uz", "falls back to the serving host");
assert.equal(all.features.comments, true);
assert.equal(await settings.feature("support_chat"), true);

await settings.update("features", { comments: false, unknown_flag: true });
assert.equal(await settings.feature("comments"), false);
assert.equal((await settings.all()).settings.features.unknown_flag, undefined, "unknown keys dropped");
assert.equal(await settings.feature("likes"), true, "untouched flags keep defaults");

await settings.update("api", { base_url: "https://api.astir-animation.uz///", fallback_urls: ["https://test-api.astir-animation.uz/"] });
const config = await settings.publicConfig("https://fallback");
assert.equal(config.api.base_url, "https://api.astir-animation.uz");
assert.deepEqual(config.api.fallback_urls, ["https://test-api.astir-animation.uz"]);
assert.ok(config.updated_at);

await assert.rejects(settings.update("api", { base_url: "http://insecure.uz" }), (error) => error.statusCode === 400);
await assert.rejects(settings.update("app", { min_version: { ios: "one" } }), (error) => error.statusCode === 400);
await assert.rejects(settings.update("contacts", { support_email: "nope" }), (error) => error.statusCode === 400);
await assert.rejects(settings.update("nonsense", {}), (error) => error.statusCode === 400);

await settings.update("app", { min_version: { ios: "1.0.90", android: "1.0.97" }, maintenance: { enabled: true, message: { ru: "Обновляемся" } } });
const app = (await settings.publicConfig()).app;
assert.equal(app.min_version.android, "1.0.97");
assert.equal(app.maintenance.enabled, true);
assert.equal(app.maintenance.message.uz, "", "missing locales filled");

console.log("project settings tests passed");

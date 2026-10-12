import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../app/store/jsonStore.js";
import { createContentMovieRepository } from "../app/repositories/contentMovieRepository.js";
import { createTranscoderService } from "../app/services/transcoderService.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astir-published-"));
const store = new JsonStore(path.join(dir, "store.json"));
const movies = createContentMovieRepository(store);

// ---- the store's "WHERE published = true" ----
const live = movies.create({ id: "live", published: true });
movies.create({ id: "draft", published: false });
movies.create({ id: "legacy" }); // no flag: not published
const series = movies.create({ id: "series", published: true, series: ["ep1"] });
movies.create({ id: "ep1", published: false }); // follows its series
movies.create({ id: "hiddenSeries", published: false, series: ["ep2"] });
movies.create({ id: "ep2", published: true }); // its series is hidden
assert.ok(live && series);
assert.deepEqual(movies.listPublished().map((movie) => movie.id).sort(), ["ep1", "live", "series"]);

// ---- transcoder leaves no junk ----
const mediaRoot = path.join(dir, "media");
const hls = (id) => path.join(mediaRoot, "hls", id);
for (const id of ["live", "draft", "gone"]) fs.mkdirSync(hls(id), { recursive: true });
movies.update("live", { transcode: { status: "ready" } });
movies.update("draft", { transcode: { status: "failed" } });
const transcoder = createTranscoderService({ config: { mediaRoot, ffmpegPath: "none", transcoderEnabled: true }, contentMovies: movies });
assert.equal(transcoder.cleanupOrphanOutputs(), 2, "a deleted title's and a failed one's folders");
assert.equal(fs.existsSync(hls("live")), true);
assert.equal(fs.existsSync(hls("draft")), false);
assert.equal(fs.existsSync(hls("gone")), false);

fs.rmSync(dir, { recursive: true, force: true });
console.log("published content tests passed");

// ---- titles/descriptions: an empty language takes the Russian text ----
{
  const { requiredLocalizedTextWithFallback, optionalLocalizedTextWithFallback } = await import("../app/lib/validation.js");
  assert.deepEqual(requiredLocalizedTextWithFallback({ description: { ru: "Описание", uz: "", en: " " } }, "description"), { en: "Описание", ru: "Описание", uz: "Описание" });
  assert.deepEqual(requiredLocalizedTextWithFallback({ title: { ru: "Муса", uz: "Muso", en: "" } }, "title"), { en: "Муса", ru: "Муса", uz: "Muso" });
  assert.deepEqual(requiredLocalizedTextWithFallback({ title: { uz: "Faqat uz" } }, "title"), { en: "Faqat uz", ru: "Faqat uz", uz: "Faqat uz" }, "no ru: the first filled one");
  assert.throws(() => requiredLocalizedTextWithFallback({ title: { ru: "", uz: "", en: "" } }, "title"), (error) => error.statusCode === 400);
  assert.deepEqual(optionalLocalizedTextWithFallback({ description: { ru: "", uz: "", en: "" } }, "description"), { en: "", ru: "", uz: "" });
  console.log("localized fallback tests passed");
}

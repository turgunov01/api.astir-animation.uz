import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContentPurge } from "../app/services/contentPurge.js";

const id = "edc017bc-0bb2-46aa-9feb-47e9541c12c6";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "astir-purge-"));
const touch = (relative) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
  return file;
};

const poster = touch("uploads/poster.jpg");
const source = touch("uploads/video.mp4");
const asset = touch("uploads/asset.png");
touch(`legacy/streaming/${id}/hls/master.m3u8`);
const outside = path.join(os.tmpdir(), `astir-outside-${process.pid}.txt`);
fs.writeFileSync(outside, "keep");

const queries = [];
const db = {
  async transaction(work) {
    return await work({
      async query(sql, params) {
        queries.push(sql.replace(/\s+/g, " ").trim());
        if (sql.startsWith("SELECT poster_path")) return { rows: [{ poster_path: poster, source_path: source }] };
        if (sql.startsWith("DELETE FROM media_assets")) return { rows: [{ path: asset }, { path: outside }] };
        return { rows: [] };
      }
    });
  }
};
const purgedStreaming = [];
const removedReactions = [];
const removedSessions = [];

await createContentPurge({
  db,
  mediaRoot: root,
  streaming: { purgeStreamingAssets: async (_db, contentId) => purgedStreaming.push(contentId) },
  contentReactions: { deleteByTarget: (contentId) => removedReactions.push(contentId) },
  watchSessions: { deleteByContentId: (contentId) => removedSessions.push(contentId) }
}).purge(id);

assert.deepEqual(purgedStreaming, [id]);
assert.ok(queries.some((sql) => sql.startsWith("DELETE FROM comments")), "comments removed");
assert.ok(queries.some((sql) => sql.startsWith("DELETE FROM content WHERE id")), "legacy mirror removed (cascades likes, reactions, history)");
for (const file of [poster, source, asset, path.join(root, "legacy/streaming", id)]) {
  assert.equal(fs.existsSync(file), false, `${file} removed`);
}
assert.equal(fs.existsSync(outside), true, "files outside the media folder are never touched");
assert.deepEqual(removedReactions, [id]);
assert.deepEqual(removedSessions, [id]);

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(outside, { force: true });
console.log("content purge tests passed");

import fs from "node:fs";
import path from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Everything that belongs to a deleted cartoon goes with it: streaming files
// and rows, its mirror in the legacy `content` table (likes, reactions,
// ratings, watch history/progress, tags and parental rules cascade from it),
// comments with their replies, media files, and JSON-store reactions and
// watch sessions. Nothing here is recoverable.
export function createContentPurge({ db = null, mediaRoot, streaming = null, contentReactions = null, watchSessions = null }) {
  const root = path.resolve(mediaRoot);

  function removeFile(filePath) {
    if (!filePath) return;
    const resolved = path.resolve(filePath.startsWith("/") ? filePath : path.join(root, filePath));
    // Never touch anything outside the media folder.
    if (!resolved.startsWith(`${root}${path.sep}`)) return;
    fs.rmSync(resolved, { recursive: true, force: true });
  }

  async function purgeDatabase(contentId) {
    if (!db) return [];

    if (streaming?.purgeStreamingAssets && UUID.test(contentId)) {
      await streaming.purgeStreamingAssets(db, contentId);
    }

    return await db.transaction(async (client) => {
      // Replies cascade from their parent comment.
      await client.query(
        "DELETE FROM comments WHERE target_id = $1 OR content_id::text = $1",
        [contentId]
      );

      if (!UUID.test(contentId)) return [];

      const content = (await client.query("SELECT poster_path, source_path FROM content WHERE id = $1", [contentId])).rows[0];
      const assets = (await client.query("DELETE FROM media_assets WHERE owner_id = $1 RETURNING path", [contentId])).rows;
      await client.query("DELETE FROM content WHERE id = $1", [contentId]);

      return [content?.poster_path, content?.source_path, ...assets.map((row) => row.path)];
    });
  }

  return {
    async purge(contentId) {
      const id = String(contentId);
      const files = await purgeDatabase(id);

      for (const file of files) removeFile(file);
      removeFile(path.join("legacy", "streaming", id));

      contentReactions?.deleteByTarget?.(id);
      watchSessions?.deleteByContentId?.(id);
    }
  };
}

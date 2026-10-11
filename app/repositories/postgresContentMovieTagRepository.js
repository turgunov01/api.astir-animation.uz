export function createPostgresContentMovieTagRepository(db) {
  return {
    async countByTag() {
      const rows = await db.many("SELECT tag_id, count(*)::int AS count FROM v1_content_movie_tags GROUP BY tag_id");
      return new Map(rows.map((row) => [row.tag_id, row.count]));
    },

    async listMovieIdsByTag(tagId) {
      const rows = await db.many(
        "SELECT movie_id FROM v1_content_movie_tags WHERE tag_id = $1 ORDER BY created_at DESC",
        [tagId]
      );

      return rows.map((row) => row.movie_id);
    },

    async listByMovieId(movieId) {
      const rows = await db.many(
        "SELECT tag_id FROM v1_content_movie_tags WHERE movie_id = $1 ORDER BY created_at",
        [movieId]
      );

      return rows.map((row) => row.tag_id);
    },

    async removeMovie(movieId) {
      await db.query("DELETE FROM v1_content_movie_tags WHERE movie_id = $1", [movieId]);
    },

    async removeTag(tagId) {
      await db.query("DELETE FROM v1_content_movie_tags WHERE tag_id = $1", [tagId]);
    },

    async replaceForMovie(movieId, tagIds) {
      const uniqueTagIds = [...new Set(tagIds)];

      await db.transaction(async (client) => {
        await client.query("DELETE FROM v1_content_movie_tags WHERE movie_id = $1", [movieId]);

        for (const tagId of uniqueTagIds) {
          await client.query(
            `
              INSERT INTO v1_content_movie_tags (movie_id, tag_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
            [movieId, tagId]
          );
        }
      });

      return uniqueTagIds;
    }
  };
}

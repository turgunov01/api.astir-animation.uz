export function createContentMovieTagRepository(store) {
  return {
    countByTag() {
      const counts = new Map();
      for (const movie of store.all("contentMovies")) {
        for (const tagId of new Set(movie.tag_ids || [])) counts.set(tagId, (counts.get(tagId) || 0) + 1);
      }
      return counts;
    },

    listMovieIdsByTag(tagId) {
      return store.all("contentMovies")
        .filter((movie) => (movie.tag_ids || []).includes(tagId))
        .map((movie) => movie.id);
    },

    listByMovieId(movieId) {
      return store.findById("contentMovies", movieId)?.tag_ids || [];
    },

    removeMovie(movieId) {
      const movie = store.findById("contentMovies", movieId);

      if (movie) {
        store.update("contentMovies", movieId, { tag_ids: [] });
      }
    },

    removeTag(tagId) {
      for (const movie of store.all("contentMovies")) {
        if ((movie.tag_ids || []).includes(tagId)) {
          store.update("contentMovies", movie.id, {
            tag_ids: movie.tag_ids.filter((movieTagId) => movieTagId !== tagId)
          });
        }
      }
    },

    replaceForMovie(movieId, tagIds) {
      const uniqueTagIds = [...new Set(tagIds)];

      store.update("contentMovies", movieId, { tag_ids: uniqueTagIds });

      return uniqueTagIds;
    }
  };
}

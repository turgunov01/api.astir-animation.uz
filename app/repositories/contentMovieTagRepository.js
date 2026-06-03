export function createContentMovieTagRepository(store) {
  return {
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

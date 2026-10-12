export function createContentMovieRepository(store) {
  return {
    list() {
      return store.all("contentMovies");
    },

    // What the app may see — the store's "WHERE published = true": a title
    // is published itself, an episode when its series is.
    listPublished() {
      const all = store.all("contentMovies");
      const byId = new Map(all.map((movie) => [movie.id, movie]));
      const parentOf = new Map();
      for (const movie of all) {
        for (const childId of movie.series || []) parentOf.set(childId, movie);
      }
      return all.filter((movie) => {
        const parent = parentOf.get(movie.id) || (movie.series_id ? byId.get(movie.series_id) : null);
        return (parent || movie).published === true;
      });
    },

    findById(id) {
      return store.findById("contentMovies", id);
    },

    create(attributes) {
      return store.insert("contentMovies", attributes);
    },

    update(id, attributes) {
      return store.update("contentMovies", id, attributes);
    },

    delete(id) {
      return store.delete("contentMovies", id);
    }
  };
}

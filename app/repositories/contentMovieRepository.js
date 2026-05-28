export function createContentMovieRepository(store) {
  return {
    list() {
      return store.all("contentMovies");
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

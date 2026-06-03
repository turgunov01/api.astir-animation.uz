export function createContentTagRepository(store) {
  function normalized(value) {
    return String(value || "").trim().toLowerCase();
  }

  return {
    list() {
      return store.all("contentTags");
    },

    findById(id) {
      return store.findById("contentTags", id);
    },

    findByName(name) {
      const normalizedName = normalized(name);

      return store.findOne(
        "contentTags",
        (tag) => normalized(tag.name) === normalizedName
      );
    },

    findBySlug(slug) {
      const normalizedSlug = normalized(slug);

      return store.findOne(
        "contentTags",
        (tag) => normalized(tag.slug) === normalizedSlug
      );
    },

    create(attributes) {
      return store.insert("contentTags", attributes);
    },

    update(id, attributes) {
      return store.update("contentTags", id, attributes);
    },

    delete(id) {
      return store.delete("contentTags", id);
    }
  };
}

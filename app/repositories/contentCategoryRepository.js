export function createContentCategoryRepository(store) {
  function englishTitle(category) {
    const title = category.title || category.name;

    if (title && typeof title === "object") {
      return title.en;
    }

    return title;
  }

  return {
    list() {
      return store.all("contentCategories");
    },

    findById(id) {
      return store.findById("contentCategories", id);
    },

    findByTitle(title) {
      const normalizedTitle = title.en.toLowerCase();

      return store.findOne(
        "contentCategories",
        (category) => String(englishTitle(category)).toLowerCase() === normalizedTitle
      );
    },

    findBySlug(slug) {
      const normalizedSlug = String(slug).toLowerCase();

      return store.findOne(
        "contentCategories",
        (category) => String(category.slug || "").toLowerCase() === normalizedSlug
      );
    },

    create(attributes) {
      return store.insert("contentCategories", attributes);
    },

    update(id, attributes) {
      return store.update("contentCategories", id, attributes);
    },

    delete(id) {
      return store.delete("contentCategories", id);
    }
  };
}

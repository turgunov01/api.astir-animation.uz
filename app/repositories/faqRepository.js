export function createFaqRepository(store) {
  return {
    list() {
      return store.all("faqs");
    },

    listActive() {
      return store
        .filter("faqs", (faq) => faq.active !== false)
        .sort((left, right) => (left.sortOrder ?? left.sort_order ?? 0) - (right.sortOrder ?? right.sort_order ?? 0));
    },

    findById(id) {
      return store.findById("faqs", id);
    },

    create(attributes) {
      return store.insert("faqs", attributes);
    },

    update(id, attributes) {
      return store.update("faqs", id, attributes);
    },

    delete(id) {
      return store.delete("faqs", id);
    }
  };
}

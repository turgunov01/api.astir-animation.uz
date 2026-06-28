export function createChildRepository(store) {
  return {
    findById(id) {
      return store.findById("children", id);
    },

    listByParentId(parentId) {
      return store.filter("children", (child) => child.parentId === parentId);
    },

    findByParentIdAndName(parentId, name) {
      return store.findOne(
        "children",
        (child) => child.parentId === parentId && child.name === name
      );
    },

    create(attributes) {
      return store.insert("children", attributes);
    },

    clearWatchExtensionById(id) {
      return store.update("children", id, {
        extendedUntil: null,
        extended_until: null,
        extendeduntil: null
      });
    }
  };
}

export function createChildContentBlacklistRepository(store) {
  function findByChildAndContent(childId, contentId) {
    return store.findOne(
      "childContentBlacklist",
      (item) => item.childId === childId && item.contentId === contentId
    );
  }

  return {
    deleteByChildAndContent(childId, contentId) {
      const item = findByChildAndContent(childId, contentId);

      return item ? store.delete("childContentBlacklist", item.id) : null;
    },

    deleteByContentId(contentId) {
      const items = store.filter("childContentBlacklist", (item) => item.contentId === contentId);

      for (const item of items) {
        store.delete("childContentBlacklist", item.id);
      }
    },

    findByChildAndContent,

    findOrCreate(parentId, childId, contentId) {
      return findByChildAndContent(childId, contentId)
        || store.insert("childContentBlacklist", { parentId, childId, contentId });
    },

    listByChildId(childId) {
      return store
        .filter("childContentBlacklist", (item) => item.childId === childId)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    }
  };
}

export function createWatchLimitRepository(store) {
  return {
    findByChildId(childId) {
      return store.findOne("watchLimits", (limit) => limit.childId === childId);
    },

    create(attributes) {
      return store.insert("watchLimits", attributes);
    },

    deleteByChildId(childId) {
      const limit = this.findByChildId(childId);

      return limit ? store.delete("watchLimits", limit.id) : null;
    },

    upsertByChildId(childId, attributes) {
      return store.upsertOne("watchLimits", (limit) => limit.childId === childId, attributes);
    }
  };
}

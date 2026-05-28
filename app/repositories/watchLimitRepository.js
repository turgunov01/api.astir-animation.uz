export function createWatchLimitRepository(store) {
  return {
    findByChildId(childId) {
      return store.findOne("watchLimits", (limit) => limit.childId === childId);
    },

    create(attributes) {
      return store.insert("watchLimits", attributes);
    },

    upsertByChildId(childId, attributes) {
      return store.upsertOne("watchLimits", (limit) => limit.childId === childId, attributes);
    }
  };
}

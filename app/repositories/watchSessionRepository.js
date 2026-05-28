export function createWatchSessionRepository(store) {
  return {
    findById(id) {
      return store.findById("watchSessions", id);
    },

    findActiveByDeviceId(deviceId) {
      return store.findOne(
        "watchSessions",
        (session) => session.deviceId === deviceId && !session.endedAt
      );
    },

    listByChildId(childId) {
      return store.filter("watchSessions", (session) => session.childId === childId);
    },

    create(attributes) {
      return store.insert("watchSessions", attributes);
    },

    update(id, attributes) {
      return store.update("watchSessions", id, attributes);
    }
  };
}

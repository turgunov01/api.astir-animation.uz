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

    findActiveByParentId(parentId) {
      return store.findOne(
        "watchSessions",
        (session) => session.actorType === "parent" && session.parentId === parentId && !session.endedAt
      );
    },

    listByChildId(childId) {
      return store.filter("watchSessions", (session) => session.childId === childId);
    },

    listByParentId(parentId) {
      return store.filter("watchSessions", (session) => session.parentId === parentId);
    },

    listByParentActorId(parentId) {
      return store.filter(
        "watchSessions",
        (session) => session.actorType === "parent" && session.parentId === parentId
      );
    },

    create(attributes) {
      return store.insert("watchSessions", attributes);
    },

    update(id, attributes) {
      return store.update("watchSessions", id, attributes);
    }
  };
}

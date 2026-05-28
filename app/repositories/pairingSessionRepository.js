export function createPairingSessionRepository(store) {
  return {
    findById(id) {
      return store.findById("pairingSessions", id);
    },

    findPendingByCode(code) {
      return store.findOne(
        "pairingSessions",
        (session) => session.code === code && session.status === "pending"
      );
    },

    create(attributes) {
      return store.insert("pairingSessions", attributes);
    },

    update(id, attributes) {
      return store.update("pairingSessions", id, attributes);
    }
  };
}

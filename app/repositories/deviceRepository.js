export function createDeviceRepository(store) {
  return {
    findById(id) {
      return store.findById("devices", id);
    },

    findByChildIdAndName(childId, name) {
      return store.findOne(
        "devices",
        (device) => device.childId === childId && device.name === name
      );
    },

    listByChildId(childId) {
      return store
        .filter("devices", (device) => device.childId === childId)
        .sort((left, right) => new Date(right.pairedAt || right.createdAt || 0) - new Date(left.pairedAt || left.createdAt || 0));
    },

    create(attributes) {
      return store.insert("devices", attributes);
    },

    update(id, attributes) {
      return store.update("devices", id, attributes);
    }
  };
}

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

    create(attributes) {
      return store.insert("devices", attributes);
    },

    update(id, attributes) {
      return store.update("devices", id, attributes);
    }
  };
}

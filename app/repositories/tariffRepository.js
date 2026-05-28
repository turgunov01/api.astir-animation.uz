export function createTariffRepository(store) {
  return {
    list() {
      return store.all("tariffs");
    },

    findById(id) {
      return store.findById("tariffs", id);
    },

    findDefault() {
      return store.findOne("tariffs", (tariff) => tariff.is_default === true);
    },

    create(attributes) {
      return store.insert("tariffs", attributes);
    },

    update(id, attributes) {
      return store.update("tariffs", id, attributes);
    },

    delete(id) {
      return store.delete("tariffs", id);
    }
  };
}

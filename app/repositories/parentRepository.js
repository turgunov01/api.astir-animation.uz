export function createParentRepository(store) {
  return {
    list() {
      return store.all("parents");
    },

    findById(id) {
      return store.findById("parents", id);
    },

    findByEmail(email) {
      return store.findOne("parents", (parent) => parent.email === email);
    },

    create(attributes) {
      return store.insert("parents", attributes);
    },

    update(id, attributes) {
      return store.update("parents", id, attributes);
    }
  };
}

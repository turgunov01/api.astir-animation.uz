export function createTransactionRepository(store) {
  return {
    list() {
      return store.all("transactions");
    },

    findById(id) {
      return store.findById("transactions", id);
    },

    findByProviderRef(provider, providerRef) {
      return store.findOne(
        "transactions",
        (transaction) => transaction.provider === provider && transaction.provider_ref === providerRef
      );
    },

    listByParentId(parentId) {
      return store.filter("transactions", (transaction) => transaction.parentId === parentId);
    },

    create(attributes) {
      return store.insert("transactions", attributes);
    },

    update(id, attributes) {
      return store.update("transactions", id, attributes);
    }
  };
}

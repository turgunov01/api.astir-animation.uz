export function createSubscriptionRepository(store) {
  return {
    list() {
      return store.all("subscriptions");
    },

    findById(id) {
      return store.findById("subscriptions", id);
    },

    findByProviderSubscriptionId(provider, providerSubscriptionId) {
      return store.findOne("subscriptions", (subscription) => (
        subscription.provider === provider
        && subscription.providerSubscriptionId === providerSubscriptionId
      ));
    },

    listByParentId(parentId) {
      return store.filter("subscriptions", (subscription) => subscription.parentId === parentId);
    },

    listByTariffId(tariffId) {
      return store.filter("subscriptions", (subscription) => subscription.tariffId === tariffId);
    },

    create(attributes) {
      return store.insert("subscriptions", attributes);
    },

    update(id, attributes) {
      return store.update("subscriptions", id, attributes);
    },
  };
}

export function createNotificationRepository(store) {
  return {
    findToken(parentId, token) {
      return store.findOne(
        "notificationTokens",
        (item) => item.parentId === parentId && item.token === token
      );
    },

    listTokensByParentId(parentId) {
      return store.filter(
        "notificationTokens",
        (item) => item.parentId === parentId && item.enabled !== false
      );
    },

    createToken(attributes) {
      return store.insert("notificationTokens", attributes);
    },

    updateToken(id, attributes) {
      return store.update("notificationTokens", id, attributes);
    },

    listNotificationsByParentId(parentId) {
      return store
        .filter("notifications", (item) => item.parentId === parentId)
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    },

    createNotification(attributes) {
      return store.insert("notifications", attributes);
    },

    updateNotification(id, attributes) {
      return store.update("notifications", id, attributes);
    }
  };
}

export function createContentLikeRepository(store) {
  function findByOwnerAndTarget(ownerId, targetId, targetType = "content") {
    return store.findOne(
      "contentLikes",
      (like) => like.ownerId === ownerId
        && like.targetId === targetId
        && like.targetType === targetType
    );
  }

  return {
    countByTarget(targetId, targetType = "content") {
      return store.filter(
        "contentLikes",
        (like) => like.targetId === targetId && like.targetType === targetType
      ).length;
    },

    deleteByOwnerAndTarget(ownerId, targetId, targetType = "content") {
      const like = findByOwnerAndTarget(ownerId, targetId, targetType);

      return like ? store.delete("contentLikes", like.id) : null;
    },

    deleteByTarget(targetId, targetType = "content") {
      const likes = store.filter(
        "contentLikes",
        (like) => like.targetId === targetId && like.targetType === targetType
      );

      for (const like of likes) {
        store.delete("contentLikes", like.id);
      }
    },

    findByOwnerAndTarget,

    findOrCreate(ownerId, targetId, targetType = "content") {
      return findByOwnerAndTarget(ownerId, targetId, targetType)
        || store.insert("contentLikes", { ownerId, targetType, targetId });
    },

    listByOwnerId(ownerId) {
      return store
        .filter("contentLikes", (like) => like.ownerId === ownerId)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    }
  };
}

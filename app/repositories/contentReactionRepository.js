export function createContentReactionRepository(store) {
  function normalizedTargetType(targetType = "content") {
    return targetType === "series" ? "series" : "content";
  }

  function normalizedReaction(reaction) {
    return reaction === "dislike" ? "dislike" : "like";
  }

  function findByOwnerAndTarget(ownerId, targetId, targetType = "content") {
    const type = normalizedTargetType(targetType);

    return store.findOne(
      "contentReactions",
      (reaction) => reaction.ownerId === ownerId
        && reaction.targetId === targetId
        && normalizedTargetType(reaction.targetType) === type
    );
  }

  return {
    countByTarget(targetId, targetType = "content", reaction = null) {
      const type = normalizedTargetType(targetType);
      const expectedReaction = reaction ? normalizedReaction(reaction) : null;

      return store.filter(
        "contentReactions",
        (row) => row.targetId === targetId
          && normalizedTargetType(row.targetType) === type
          && (!expectedReaction || normalizedReaction(row.reaction) === expectedReaction)
      ).length;
    },

    findByOwnerAndTarget,

    setReaction(ownerId, targetId, targetType = "content", reaction = "like") {
      const type = normalizedTargetType(targetType);
      const value = normalizedReaction(reaction);
      const existing = findByOwnerAndTarget(ownerId, targetId, type);

      if (existing) {
        return store.update("contentReactions", existing.id, {
          reaction: value
        });
      }

      return store.insert("contentReactions", {
        ownerId,
        targetType: type,
        targetId,
        reaction: value
      });
    },

    deleteByOwnerAndTarget(ownerId, targetId, targetType = "content") {
      const reaction = findByOwnerAndTarget(ownerId, targetId, targetType);

      return reaction ? store.delete("contentReactions", reaction.id) : null;
    },

    deleteByTarget(targetId, targetType = "content") {
      const type = normalizedTargetType(targetType);
      const reactions = store.filter(
        "contentReactions",
        (reaction) => reaction.targetId === targetId
          && normalizedTargetType(reaction.targetType) === type
      );

      for (const reaction of reactions) {
        store.delete("contentReactions", reaction.id);
      }
    }
  };
}

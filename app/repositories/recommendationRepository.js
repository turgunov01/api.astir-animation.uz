function sortRecommendations(left, right) {
  return (left.sortOrder ?? left.sort_order ?? 0) - (right.sortOrder ?? right.sort_order ?? 0)
    || String(left.createdAt || left.created_at || "").localeCompare(String(right.createdAt || right.created_at || ""));
}

export function createRecommendationRepository(store) {
  return {
    list() {
      return [...store.all("recommendations")].sort(sortRecommendations);
    },

    listActive() {
      return store
        .filter("recommendations", (recommendation) => recommendation.active !== false)
        .sort(sortRecommendations);
    },

    findById(id) {
      return store.findById("recommendations", id);
    },

    create(attributes) {
      return store.insert("recommendations", attributes);
    },

    update(id, attributes) {
      return store.update("recommendations", id, attributes);
    },

    delete(id) {
      return store.delete("recommendations", id);
    }
  };
}

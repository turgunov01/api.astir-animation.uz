import { forbidden, notFound } from "../lib/errors.js";

const defaultLimit = {
  dailyMinutes: 60,
  allowedFrom: "08:00",
  allowedTo: "20:00",
  allowedDays: [1, 2, 3, 4, 5, 6, 7]
};

export function serializeChild(child) {
  return {
    id: child.id,
    parentId: child.parentId,
    name: child.name,
    birthYear: child.birthYear,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt
  };
}

function serializeBlacklistItem(item) {
  return {
    id: item.id,
    parentId: item.parentId,
    childId: item.childId,
    contentId: item.contentId,
    content_id: item.contentId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function createChildService({ childContentBlacklist, children, contentMovies, watchLimits }) {
  function listChildren(parentId) {
    return children.listByParentId(parentId).map(serializeChild);
  }

  function getChildForParent(parentId, childId) {
    const child = children.findById(childId);

    if (!child) {
      throw notFound("Child not found", "CHILD_NOT_FOUND");
    }

    if (child.parentId !== parentId) {
      throw forbidden("Child does not belong to this parent", "CHILD_FORBIDDEN");
    }

    return child;
  }

  function createChild(parentId, { name, birthYear }) {
    const child = children.create({
      parentId,
      name,
      birthYear
    });

    watchLimits.create({
      parentId,
      childId: child.id,
      ...defaultLimit
    });

    return serializeChild(child);
  }

  function getLimits(parentId, childId) {
    getChildForParent(parentId, childId);

    const limit = watchLimits.findByChildId(childId);

    if (!limit) {
      return watchLimits.create({
        parentId,
        childId,
        ...defaultLimit
      });
    }

    return limit;
  }

  function updateLimits(parentId, childId, attributes) {
    getChildForParent(parentId, childId);

    return watchLimits.upsertByChildId(childId, {
      parentId,
      childId,
      ...attributes
    });
  }

  function assertBlacklistMovieExists(contentId) {
    if (!contentMovies?.findById(contentId)) {
      throw notFound("Content movie not found", "CONTENT_MOVIE_NOT_FOUND");
    }
  }

  function listBlacklist(parentId, childId) {
    getChildForParent(parentId, childId);

    return childContentBlacklist.listByChildId(childId).map(serializeBlacklistItem);
  }

  function addToBlacklist(parentId, childId, contentId) {
    getChildForParent(parentId, childId);
    assertBlacklistMovieExists(contentId);

    return serializeBlacklistItem(childContentBlacklist.findOrCreate(parentId, childId, contentId));
  }

  function removeFromBlacklist(parentId, childId, contentId) {
    getChildForParent(parentId, childId);

    const deleted = childContentBlacklist.deleteByChildAndContent(childId, contentId);

    return {
      deleted: Boolean(deleted),
      contentId,
      content_id: contentId
    };
  }

  function removeContentFromAllBlacklists(contentId) {
    childContentBlacklist.deleteByContentId(contentId);
  }

  function isContentBlacklisted(parentId, childId, contentId) {
    const item = childContentBlacklist.findByChildAndContent(childId, contentId);

    return Boolean(item && item.parentId === parentId);
  }

  function isAnyContentBlacklisted(parentId, childId, contentIds) {
    return contentIds.some((contentId) => isContentBlacklisted(parentId, childId, contentId));
  }

  return {
    addToBlacklist,
    createChild,
    getChildForParent,
    getLimits,
    isAnyContentBlacklisted,
    isContentBlacklisted,
    listBlacklist,
    listChildren,
    removeContentFromAllBlacklists,
    removeFromBlacklist,
    serializeChild,
    updateLimits
  };
}

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

export function createChildService({ children, watchLimits }) {
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

  return {
    createChild,
    getChildForParent,
    getLimits,
    listChildren,
    serializeChild,
    updateLimits
  };
}

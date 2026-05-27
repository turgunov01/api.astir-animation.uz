import { forbidden, notFound } from "../lib/errors.js";
import { store } from "../store/jsonStore.js";

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

export function listChildren(parentId) {
  return store.filter("children", (child) => child.parentId === parentId).map(serializeChild);
}

export function getChildForParent(parentId, childId) {
  const child = store.findById("children", childId);

  if (!child) {
    throw notFound("Child not found", "CHILD_NOT_FOUND");
  }

  if (child.parentId !== parentId) {
    throw forbidden("Child does not belong to this parent", "CHILD_FORBIDDEN");
  }

  return child;
}

export function createChild(parentId, { name, birthYear }) {
  const child = store.insert("children", {
    parentId,
    name,
    birthYear
  });

  store.insert("watchLimits", {
    parentId,
    childId: child.id,
    ...defaultLimit
  });

  return serializeChild(child);
}

export function getLimits(parentId, childId) {
  getChildForParent(parentId, childId);

  const limit = store.findOne("watchLimits", (record) => record.childId === childId);

  if (!limit) {
    return store.insert("watchLimits", {
      parentId,
      childId,
      ...defaultLimit
    });
  }

  return limit;
}

export function updateLimits(parentId, childId, attributes) {
  getChildForParent(parentId, childId);

  return store.upsertOne(
    "watchLimits",
    (record) => record.childId === childId,
    {
      parentId,
      childId,
      ...attributes
    }
  );
}

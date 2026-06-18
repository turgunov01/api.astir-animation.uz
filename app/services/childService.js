import path from "node:path";
import { forbidden, notFound } from "../lib/errors.js";

const defaultLimit = {
  dailyMinutes: 60,
  allowedFrom: "08:00",
  allowedTo: "20:00",
  allowedDays: [1, 2, 3, 4, 5, 6, 7],
  allowedDates: []
};
const supportedLocales = ["uz", "ru", "en"];
const defaultLocale = "en";
const adminRoles = new Set(["admin", "super_admin"]);

function localeOrDefault(locale) {
  return supportedLocales.includes(locale) ? locale : defaultLocale;
}

function localizedText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      en: value.en || "",
      ru: value.ru || "",
      uz: value.uz || ""
    };
  }

  return {
    en: value || "",
    ru: value || "",
    uz: value || ""
  };
}

function sourceUrl(source) {
  if (!source) {
    return null;
  }

  if (typeof source === "string") {
    return source;
  }

  if (source.url) {
    return source.url;
  }

  const fileName = source.fileName || source.file_name || (source.path ? path.basename(source.path) : null);

  return fileName ? `/media/uploads/${encodeURIComponent(fileName)}` : null;
}

function posterMetadata(poster, posterUrl) {
  if (!posterUrl) {
    return null;
  }

  if (!poster || typeof poster === "string") {
    return { url: posterUrl };
  }

  return {
    url: posterUrl,
    storage_path: poster.path || poster.storage_path || null,
    original_name: poster.originalName || poster.original_name || null,
    mime_type: poster.mimeType || poster.mime_type || null,
    size: poster.size || null
  };
}

function blacklistContentMetadata(movie, { contentLikes, locale }) {
  if (!movie) {
    return {};
  }

  const normalizedLocale = localeOrDefault(locale);
  const title = localizedText(movie.title);
  const posterUrl = sourceUrl(movie.poster) || movie.poster_url || null;
  const views = Number(movie.views_count || movie.views || 0);
  const likes = contentLikes?.countByTarget?.(movie.id, "content") || 0;

  return {
    title,
    title_en: title.en || "",
    title_ru: title.ru || "",
    title_uz: title.uz || "",
    [`title_${normalizedLocale}`]: title[normalizedLocale] || title.en || title.ru || title.uz || "",
    poster: posterMetadata(movie.poster, posterUrl),
    poster_url: posterUrl,
    views,
    views_count: views,
    likes,
    likes_count: likes
  };
}

export function serializeChild(child) {
  return {
    id: child.id,
    parentId: child.parentId || child.parent_id,
    name: child.name,
    birthYear: child.birthYear ?? child.birth_year ?? child.age,
    createdAt: child.createdAt || child.created_at,
    updatedAt: child.updatedAt || child.updated_at
  };
}

function serializeBlacklistItem(item, options = {}) {
  const parentId = item.parentId || item.parent_id;
  const childId = item.childId || item.child_id;
  const contentId = item.contentId || item.content_id;
  const movie = options.contentMovies?.findById?.(contentId);

  return {
    id: item.id,
    parentId,
    parent_id: parentId,
    childId,
    child_id: childId,
    contentId,
    content_id: contentId,
    createdAt: item.createdAt,
    created_at: item.createdAt,
    updatedAt: item.updatedAt,
    updated_at: item.updatedAt,
    ...blacklistContentMetadata(movie, options)
  };
}

function liveBlacklistItems(childContentBlacklist, contentMovies, childId) {
  if (!contentMovies?.findById) {
    return childContentBlacklist.listByChildId(childId);
  }

  return childContentBlacklist
    .listByChildId(childId)
    .filter((item) => {
      const contentId = item.contentId || item.content_id;

      if (contentMovies?.findById?.(contentId)) {
        return true;
      }

      childContentBlacklist.deleteByChildAndContent(childId, contentId);
      return false;
    });
}

function serializeDevice(device) {
  return {
    id: device.id,
    parentId: device.parentId || device.parent_id,
    childId: device.childId || device.child_id,
    name: device.name || device.device_name,
    platform: device.platform,
    pairedAt: device.pairedAt || device.paired_at,
    revokedAt: device.revokedAt || device.revoked_at || null,
    revoked_at: device.revokedAt || device.revoked_at || null,
    createdAt: device.createdAt || device.created_at,
    updatedAt: device.updatedAt || device.updated_at
  };
}

function isRevokedDevice(device) {
  return Boolean(device?.revokedAt || device?.revoked_at);
}

function childParentId(child) {
  return child?.parentId || child?.parent_id || child?.parentid;
}

function parentAccess(parent) {
  if (parent && typeof parent === "object") {
    return {
      id: parent.id || parent.parentId || parent.parent_id,
      isAdmin: adminRoles.has(parent.role)
    };
  }

  return {
    id: parent,
    isAdmin: false
  };
}

function assertChildBelongsToParent(child, parent) {
  const access = parentAccess(parent);

  if (!access.isAdmin && childParentId(child) !== access.id) {
    throw forbidden("Child does not belong to this parent", "CHILD_FORBIDDEN");
  }
}

export function createChildService({ childContentBlacklist, children, contentLikes, contentMovies, devices, watchLimits }) {
  function listChildren(parentId) {
    const list = children.listByParentId(parentId);
    // Handle both sync arrays and async promises
    if (list && typeof list.then === 'function') {
      // This is async, shouldn't happen in sync context
      throw new Error("listChildren must be called with await when using async repositories");
    }
    return list.map(serializeChild);
  }

  async function listChildrenAsync(parentId) {
    const list = await children.listByParentId(parentId);

    return list.map(serializeChild);
  }

  async function getChildForParentAsync(parentId, childId) {
    let child = children.findById(childId);
    if (child && typeof child.then === 'function') {
      child = await child;
    }

    if (!child) {
      throw notFound("Child not found", "CHILD_NOT_FOUND");
    }

    assertChildBelongsToParent(child, parentId);

    return child;
  }

  function getChildForParent(parentId, childId) {
    const child = children.findById(childId);

    if (!child) {
      throw notFound("Child not found", "CHILD_NOT_FOUND");
    }

    assertChildBelongsToParent(child, parentId);

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

  async function createChildAsync(parentId, { name, birthYear }) {
    const child = await children.create({
      parentId,
      name,
      birthYear
    });

    await watchLimits.create({
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

  async function getLimitsAsync(parentId, childId) {
    await getChildForParentAsync(parentId, childId);

    const limit = await watchLimits.findByChildId(childId);

    if (!limit) {
      return watchLimits.create({
        parentId,
        childId,
        ...defaultLimit
      });
    }

    return limit;
  }

  async function listDevicesAsync(parentId, childId) {
    const access = parentAccess(parentId);

    await getChildForParentAsync(parentId, childId);

    return (devices?.listByChildId(childId) || [])
      .filter((device) => access.isAdmin || (device.parentId || device.parent_id) === access.id)
      .filter((device) => !isRevokedDevice(device))
      .map(serializeDevice);
  }

  function updateLimits(parentId, childId, attributes) {
    getChildForParent(parentId, childId);

    return watchLimits.upsertByChildId(childId, {
      parentId,
      childId,
      ...attributes
    });
  }

  async function updateLimitsAsync(parentId, childId, attributes) {
    await getChildForParentAsync(parentId, childId);

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

  function listBlacklist(parentId, childId, { locale = defaultLocale } = {}) {
    getChildForParent(parentId, childId);

    return liveBlacklistItems(childContentBlacklist, contentMovies, childId)
      .map((item) => serializeBlacklistItem(item, { contentLikes, contentMovies, locale }));
  }

  async function listBlacklistAsync(parentId, childId, { locale = defaultLocale } = {}) {
    await getChildForParentAsync(parentId, childId);

    return liveBlacklistItems(childContentBlacklist, contentMovies, childId)
      .map((item) => serializeBlacklistItem(item, { contentLikes, contentMovies, locale }));
  }

  function findBlacklistItem(parentId, childId, contentId) {
    const access = parentAccess(parentId);
    const item = childContentBlacklist.findByChildAndContent(childId, contentId);

    if (!item || (!access.isAdmin && item.parentId !== access.id)) {
      return null;
    }

    return serializeBlacklistItem(item);
  }

  function addToBlacklist(parentId, childId, contentId) {
    const access = parentAccess(parentId);

    getChildForParent(parentId, childId);
    assertBlacklistMovieExists(contentId);

    return serializeBlacklistItem(childContentBlacklist.findOrCreate(access.id, childId, contentId));
  }

  async function addToBlacklistAsync(parentId, childId, contentId) {
    const access = parentAccess(parentId);

    await getChildForParentAsync(parentId, childId);
    assertBlacklistMovieExists(contentId);

    return serializeBlacklistItem(childContentBlacklist.findOrCreate(access.id, childId, contentId));
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

  async function removeFromBlacklistAsync(parentId, childId, contentId) {
    await getChildForParentAsync(parentId, childId);

    const deleted = childContentBlacklist.deleteByChildAndContent(childId, contentId);

    return {
      deleted: Boolean(deleted),
      contentId,
      content_id: contentId
    };
  }

  async function revokeDeviceAsync(parentId, childId, deviceId) {
    const access = parentAccess(parentId);

    await getChildForParentAsync(parentId, childId);

    const device = devices?.findById?.(deviceId);

    if (
      !device
      || (!access.isAdmin && (device.parentId || device.parent_id) !== access.id)
      || (device.childId || device.child_id) !== childId
    ) {
      throw notFound("Device not found", "DEVICE_NOT_FOUND");
    }

    const revokedDevice = devices.revoke
      ? devices.revoke(device.id)
      : devices.update(device.id, {
          revokedAt: new Date().toISOString(),
          tokenHash: null
        });

    return {
      revoked: true,
      deleted: true,
      device: serializeDevice(revokedDevice)
    };
  }

  function removeContentFromAllBlacklists(contentId) {
    childContentBlacklist.deleteByContentId(contentId);
  }

  function isContentBlacklisted(parentId, childId, contentId) {
    const access = parentAccess(parentId);
    const item = childContentBlacklist.findByChildAndContent(childId, contentId);

    return Boolean(item && (access.isAdmin || item.parentId === access.id));
  }

  function isAnyContentBlacklisted(parentId, childId, contentIds) {
    return contentIds.some((contentId) => isContentBlacklisted(parentId, childId, contentId));
  }

  return {
    addToBlacklist,
    addToBlacklistAsync,
    createChild,
    createChildAsync,
    findBlacklistItem,
    getChildForParent,
    getChildForParentAsync,
    getLimits,
    getLimitsAsync,
    isAnyContentBlacklisted,
    isContentBlacklisted,
    listBlacklist,
    listBlacklistAsync,
    listChildren,
    listChildrenAsync,
    listDevicesAsync,
    removeContentFromAllBlacklists,
    removeFromBlacklist,
    removeFromBlacklistAsync,
    revokeDeviceAsync,
    serializeChild,
    updateLimits,
    updateLimitsAsync
  };
}

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

function serializeDevice(device) {
  return {
    id: device.id,
    parentId: device.parentId || device.parent_id,
    childId: device.childId || device.child_id,
    name: device.name || device.device_name,
    platform: device.platform,
    pairedAt: device.pairedAt || device.paired_at,
    createdAt: device.createdAt || device.created_at,
    updatedAt: device.updatedAt || device.updated_at
  };
}

function childParentId(child) {
  return child?.parentId || child?.parent_id || child?.parentid;
}

function assertChildBelongsToParent(child, parentId) {
  if (childParentId(child) !== parentId) {
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
    await getChildForParentAsync(parentId, childId);

    return (devices?.listByChildId(childId) || [])
      .filter((device) => (device.parentId || device.parent_id) === parentId)
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

    return childContentBlacklist
      .listByChildId(childId)
      .map((item) => serializeBlacklistItem(item, { contentLikes, contentMovies, locale }));
  }

  async function listBlacklistAsync(parentId, childId, { locale = defaultLocale } = {}) {
    await getChildForParentAsync(parentId, childId);

    return childContentBlacklist
      .listByChildId(childId)
      .map((item) => serializeBlacklistItem(item, { contentLikes, contentMovies, locale }));
  }

  function findBlacklistItem(parentId, childId, contentId) {
    const item = childContentBlacklist.findByChildAndContent(childId, contentId);

    if (!item || item.parentId !== parentId) {
      return null;
    }

    return serializeBlacklistItem(item);
  }

  function addToBlacklist(parentId, childId, contentId) {
    getChildForParent(parentId, childId);
    assertBlacklistMovieExists(contentId);

    return serializeBlacklistItem(childContentBlacklist.findOrCreate(parentId, childId, contentId));
  }

  async function addToBlacklistAsync(parentId, childId, contentId) {
    await getChildForParentAsync(parentId, childId);
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

  async function removeFromBlacklistAsync(parentId, childId, contentId) {
    await getChildForParentAsync(parentId, childId);

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
    serializeChild,
    updateLimits,
    updateLimitsAsync
  };
}

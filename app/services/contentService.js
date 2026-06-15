import fs from "node:fs";
import path from "node:path";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";

const catalog = [
  {
    id: "bluey-001",
    title: {
      en: "Bluey - Keepy Uppy",
      ru: "Bluey - Keepy Uppy",
      uz: "Bluey - To'pni ushla"
    },
    type: "cartoon",
    ageRating: "G",
    durationMinutes: 7
  },
  {
    id: "octonauts-001",
    title: {
      en: "Octonauts - The Whale Shark",
      ru: "Octonauts - The Whale Shark",
      uz: "Oktonavtlar - Kit akulasi"
    },
    type: "cartoon",
    ageRating: "G",
    durationMinutes: 12
  },
  {
    id: "storybots-001",
    title: {
      en: "StoryBots - Why Is the Sky Blue?",
      ru: "StoryBots - Why Is the Sky Blue?",
      uz: "StoryBots - Nega osmon ko'k?"
    },
    type: "educational",
    ageRating: "G",
    durationMinutes: 24
  }
];
const adminRoles = new Set(["admin", "super_admin"]);

function toLocalizedText(value) {
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

function serializeCatalogItem(item, likeContext = null) {
  return {
    ...item,
    item_type: "content",
    target_type: "content",
    target_id: item.id,
    likes_count: likeContext?.contentLikes?.countByTarget(item.id) || 0,
    is_liked: likeContext?.ownerId
      ? Boolean(likeContext.contentLikes.findByOwnerAndTarget(likeContext.ownerId, item.id))
      : false
  };
}

function serializeCategory(category) {
  const iconUrl = sourceUrl(category.icon);

  return {
    id: category.id,
    title: toLocalizedText(category.title || category.name),
    description: toLocalizedText(category.description),
    type: category.type || category.kind || "other",
    slug: category.slug || slugify(category.title || category.name, "category"),
    active: category.active !== false,
    icon_url: iconUrl,
    icon: category.icon
      ? {
          url: iconUrl,
          storage_path: category.icon.path || null,
          original_name: category.icon.originalName || null,
          mime_type: category.icon.mimeType || null,
          size: category.icon.size || null
        }
      : null
  };
}

function serializeTag(tag) {
  return {
    id: tag.id,
    name: tag.name || "",
    slug: tag.slug || slugify(tag.name, "tag"),
    active: tag.active !== false,
    createdAt: tag.createdAt || null,
    updatedAt: tag.updatedAt || null
  };
}

function sourceUrl(source) {
  if (source?.url) {
    return source.url;
  }

  const fileName = source?.fileName || (source?.path ? path.basename(source.path) : null);

  if (!fileName) {
    return null;
  }

  return `/media/uploads/${encodeURIComponent(fileName)}`;
}

function serializeRenditions(renditions = []) {
  return renditions.map((rendition) => ({
    quality: rendition.quality || String(rendition.height || ""),
    label: rendition.label || (rendition.height ? `${rendition.height}p` : ""),
    width: rendition.width || null,
    height: rendition.height || null,
    bitrate: rendition.bitrate || null,
    playlist_url: rendition.playlist_url || rendition.playlistUrl || null
  }));
}

async function serializeMovieTags(tagIds, contentTags) {
  const tags = await Promise.all(
    [...new Set(tagIds || [])].map((tagId) => contentTags.findById(tagId))
  );

  return tags.filter(Boolean).map(serializeTag);
}

async function serializeMovie(movie, series = [], contentTags, contentMovieTags, likeContext = null) {
  const durationSeconds = movie.duration_sec ?? 0;
  const durationMinutes = durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0;
  const videoUrl = sourceUrl(movie.source);
  const posterUrl = sourceUrl(movie.poster);
  const transcodeStatus = movie.transcode?.status || "missing_source";
  const transcodeError = movie.transcode?.error || null;
  const hlsUrl = movie.transcode?.hlsUrl || null;
  const renditions = serializeRenditions(movie.transcode?.renditions);
  const qualities = hlsUrl || renditions.length > 0
    ? ["auto", ...renditions.map((rendition) => rendition.quality)]
    : [];
  const tagIds = [...new Set(await contentMovieTags.listByMovieId(movie.id))];
  const canWatch = !movie.is_premium || Boolean(likeContext?.canWatchPremium);
  const subscriptionRequired = Boolean(movie.is_premium && !canWatch);
  const previewDurationSec = subscriptionRequired ? 15 : 0;

  return {
    id: movie.id,
    item_type: "movie",
    target_type: "content",
    target_id: movie.id,
    title: toLocalizedText(movie.title),
    description: toLocalizedText(movie.description),
    content_type: movie.content_type || "movie",
    category_id: movie.category_id || null,
    series_id: movie.series_id || null,
    series: series.length > 0
      ? await Promise.all(series.map((item) => serializeMovie(item, [], contentTags, contentMovieTags, likeContext)))
      : movie.series || [],
    tag_ids: tagIds,
    tags: await serializeMovieTags(tagIds, contentTags),
    is_premium: Boolean(movie.is_premium),
    subscription_required: subscriptionRequired,
    preview_duration_sec: previewDurationSec,
    can_watch: canWatch,
    access: {
      can_watch: canWatch,
      subscription_required: subscriptionRequired,
      preview_duration_sec: previewDurationSec
    },
    likes_count: likeContext?.contentLikes?.countByTarget(movie.id) || 0,
    is_liked: likeContext?.ownerId
      ? Boolean(likeContext.contentLikes.findByOwnerAndTarget(likeContext.ownerId, movie.id))
      : false,
    views_count: movie.views_count || 0,
    play_count: movie.views_count || 0,
    watch_time_sec: movie.watch_time_sec || 0,
    last_viewed_at: movie.last_viewed_at || null,
    series_views_count: movie.series_views_count || 0,
    series_watch_time_sec: movie.series_watch_time_sec || 0,
    series_last_viewed_at: movie.series_last_viewed_at || null,
    poster_url: posterUrl,
    poster: movie.poster
      ? {
          url: posterUrl,
          storage_path: movie.poster.path || null,
          original_name: movie.poster.originalName || null,
          mime_type: movie.poster.mimeType || null,
          size: movie.poster.size || null
        }
      : null,
    source: videoUrl,
    video_url: videoUrl,
    storage_path: movie.source?.path || null,
    transcode_status: transcodeStatus,
    transcode_error: transcodeError,
    status_error: transcodeError,
    error_message: transcodeError,
    age_rating: movie.age_rating ?? 0,
    duration_sec: durationSeconds,
    duration_seconds: durationSeconds,
    durationSec: durationSeconds,
    duration: movie.duration ?? durationSeconds,
    duration_minutes: durationMinutes,
    durationMinutes,
    year: movie.year ?? null,
    published: Boolean(movie.published),
    published_at: movie.published_at || null,
    createdAt: movie.createdAt || null,
    updatedAt: movie.updatedAt || null,
    media: {
      has_source: Boolean(movie.source?.path),
      original_name: movie.source?.originalName || null,
      mime_type: movie.source?.mimeType || null,
      size: movie.source?.size || null,
      storage_path: movie.source?.path || null
    },
    playback: {
      type: "hls",
      status: transcodeStatus,
      hls_url: hlsUrl,
      auto_url: hlsUrl,
      qualities,
      renditions,
      error: transcodeError,
      preview_only: subscriptionRequired,
      preview_until_sec: subscriptionRequired ? 15 : durationSeconds
    }
  };
}

function createSourceFromFile(file) {
  if (!file) {
    return null;
  }

  return {
    path: file.path,
    fileName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url: `/media/uploads/${encodeURIComponent(file.filename)}`
  };
}

function removeStoredFile(source) {
  if (!source?.path) {
    return;
  }

  fs.rmSync(source.path, { force: true });
}

function slugify(value, fallback = "category") {
  const source = typeof value === "string"
    ? value
    : value?.en || value?.ru || value?.uz || fallback;
  const slug = String(source)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function assertCategorySlugAvailable(contentCategories, slug, currentCategoryId = null) {
  const existingCategory = contentCategories.findBySlug(slug);

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw conflict("A content category already exists with this slug", "CONTENT_CATEGORY_SLUG_EXISTS");
  }
}

async function assertTagNameAvailable(contentTags, name, currentTagId = null) {
  const existingTag = await contentTags.findByName(name);

  if (existingTag && existingTag.id !== currentTagId) {
    throw conflict("A content tag already exists with this name", "CONTENT_TAG_NAME_EXISTS");
  }
}

async function assertTagSlugAvailable(contentTags, slug, currentTagId = null) {
  const existingTag = await contentTags.findBySlug(slug);

  if (existingTag && existingTag.id !== currentTagId) {
    throw conflict("A content tag already exists with this slug", "CONTENT_TAG_SLUG_EXISTS");
  }
}

function uniqueCategorySlug(contentCategories, value, currentCategoryId = null) {
  const baseSlug = slugify(value, "category");
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existingCategory = contentCategories.findBySlug(slug);

    if (!existingCategory || existingCategory.id === currentCategoryId) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function uniqueTagSlug(contentTags, value, currentTagId = null) {
  const baseSlug = slugify(value, "tag");
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existingTag = await contentTags.findBySlug(slug);

    if (!existingTag || existingTag.id === currentTagId) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function categoryAttributes(attributes) {
  return {
    title: attributes.title,
    description: attributes.description,
    type: attributes.type || "other",
    slug: attributes.slug,
    active: attributes.active !== false,
    icon: createSourceFromFile(attributes.file)
  };
}

function tagAttributes(attributes) {
  return {
    name: attributes.name,
    slug: attributes.slug,
    active: attributes.active !== false
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== "").map((value) => value.trim()))];
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || ""));
}

function localizedValues(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value);
  }

  return [value];
}

function localizedIncludes(value, query) {
  const needle = normalized(query);

  if (!needle) {
    return true;
  }

  return localizedValues(value).some((entry) => normalized(entry).includes(needle));
}

function normalizeSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\u0400-\u04ff]+/gi, " ")
    .trim();
}

function searchTokens(value) {
  return normalizeSearchValue(value)
    .split(/\s+/)
    .filter(Boolean);
}

function boundedEditDistance(left, right, maxDistance) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMin = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost
      );

      current[rightIndex] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[right.length];
}

function fuzzyDistanceLimit(token) {
  if (token.length <= 3) {
    return 0;
  }

  if (token.length <= 6) {
    return 1;
  }

  if (token.length <= 11) {
    return 2;
  }

  return 3;
}

function tokenMatchesSearchValue(searchToken, valueToken) {
  if (valueToken.includes(searchToken) || searchToken.includes(valueToken)) {
    return true;
  }

  const maxDistance = fuzzyDistanceLimit(searchToken);

  return maxDistance > 0 && boundedEditDistance(searchToken, valueToken, maxDistance) <= maxDistance;
}

function searchValueMatches(value, query) {
  const queryTokens = searchTokens(query);

  if (queryTokens.length === 0) {
    return true;
  }

  const normalizedValue = normalizeSearchValue(value);

  if (normalizedValue.includes(normalizeSearchValue(query))) {
    return true;
  }

  const valueTokens = searchTokens(value);

  return queryTokens.every((queryToken) => (
    valueTokens.some((valueToken) => tokenMatchesSearchValue(queryToken, valueToken))
  ));
}

async function findOrCreateTagByName(contentTags, name) {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    throw badRequest("tags must contain only non-empty strings", "VALIDATION_ERROR");
  }

  const existingTag = await contentTags.findByName(normalizedName);

  if (existingTag) {
    return existingTag;
  }

  return contentTags.create(tagAttributes({
    name: normalizedName,
    slug: await uniqueTagSlug(contentTags, normalizedName),
    active: true
  }));
}

async function resolveMovieTagIds(contentTags, attributes = {}) {
  const tagIds = [];

  for (const tagId of uniqueStrings(attributes.tag_ids)) {
    const tag = await contentTags.findById(tagId);

    if (!tag) {
      throw badRequest("tag_ids contains an unknown tag id", "VALIDATION_ERROR");
    }

    tagIds.push(tag.id);
  }

  for (const tagName of uniqueStrings(attributes.tags)) {
    tagIds.push((await findOrCreateTagByName(contentTags, tagName)).id);
  }

  return [...new Set(tagIds)];
}

function assertMovieCategoryExists(contentCategories, categoryId) {
  if (!categoryId) {
    return;
  }

  if (!contentCategories.findById(categoryId)) {
    throw badRequest("category_id contains an unknown category id", "VALIDATION_ERROR");
  }
}

function categoryFilterValues(contentCategories, category) {
  const value = String(category || "").trim();

  if (!value) {
    return [];
  }

  const normalizedValue = normalized(value);
  const matches = contentCategories.list().filter((item) => (
    normalized(item.id) === normalizedValue ||
    normalized(item.slug) === normalizedValue ||
    localizedValues(item.title || item.name).some((entry) => normalized(entry) === normalizedValue)
  ));

  return [...new Set([value, ...matches.map((item) => item.id)])];
}

async function tagFilterIds(contentTags, tags = []) {
  const tagIds = [];

  for (const value of uniqueStrings(tags)) {
    const tag = (isUuid(value) ? await contentTags.findById(value) : null)
      || await contentTags.findBySlug(value)
      || await contentTags.findByName(value);

    tagIds.push(tag?.id || value);
  }

  return [...new Set(tagIds)];
}

function movieMatchesSearch(movie, query) {
  if (!query) {
    return true;
  }

  return [
    ...localizedValues(movie.title),
    ...localizedValues(movie.description),
    movie.content_type
  ].some((value) => searchValueMatches(value, query));
}

function metricValue(value) {
  return Number.isFinite(value) ? value : 0;
}

function initialTranscode(file) {
  if (!file) {
    return {
      status: "missing_source",
      error: null,
      hlsPath: null,
      hlsUrl: null,
      renditions: [],
      updatedAt: new Date().toISOString()
    };
  }

  return {
    status: "queued",
    error: null,
    hlsPath: null,
    hlsUrl: null,
    renditions: [],
    updatedAt: new Date().toISOString()
  };
}

function movieAttributes(attributes) {
  const published = Boolean(attributes.published);

  return {
    title: attributes.title,
    description: attributes.description,
    series: attributes.series || [],
    category_id: attributes.category_id || null,
    series_id: attributes.series_id || null,
    content_type: attributes.content_type || "movie",
    is_premium: attributes.is_premium,
    age_rating: attributes.age_rating ?? 0,
    duration_sec: attributes.duration_sec ?? 0,
    year: attributes.year ?? null,
    published,
    published_at: published ? new Date().toISOString() : null,
    views_count: 0,
    watch_time_sec: 0,
    last_viewed_at: null,
    series_views_count: 0,
    series_watch_time_sec: 0,
    series_last_viewed_at: null,
    poster: createSourceFromFile(attributes.posterFile),
    source: createSourceFromFile(attributes.file),
    transcode: initialTranscode(attributes.file)
  };
}

function normalizeMovieUpdateAttributes(movie, attributes) {
  const movieUpdates = { ...attributes };

  if (Object.hasOwn(movieUpdates, "published")) {
    movieUpdates.published_at = movieUpdates.published
      ? movie.published_at || new Date().toISOString()
      : null;
  }

  return movieUpdates;
}

function assertCategoryTitleAvailable(contentCategories, title, currentCategoryId = null) {
  const existingCategory = contentCategories.findByTitle(title);

  if (existingCategory && existingCategory.id !== currentCategoryId) {
    throw conflict("A content category already exists with this title", "CONTENT_CATEGORY_TITLE_EXISTS");
  }
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || null;
}

function deviceParentId(device) {
  return firstValue(device?.parentId, device?.parent_id, device?.parent?.id, device?.parent?.user_id);
}

function deviceChildId(device) {
  return firstValue(device?.childId, device?.child_id, device?.currentChildId, device?.current_child_id);
}

function actorOwnerId(actor) {
  if (actor?.type === "parent") {
    return firstValue(actor.parent?.id, actor.parent?.user_id, actor.parentId, actor.parent_id);
  }

  if (actor?.type === "device") {
    return deviceParentId(actor.device);
  }

  return null;
}

function actorRole(actor) {
  return firstValue(actor?.parent?.role, actor?.user?.role, actor?.role);
}

function isAdminActor(actor) {
  return adminRoles.has(actorRole(actor));
}

function actorBlacklistTarget(actor) {
  const explicitTarget = actor?.blacklistTarget;

  if (explicitTarget?.parentId && explicitTarget?.childId) {
    return explicitTarget;
  }

  if (actor?.type === "device") {
    return {
      parentId: deviceParentId(actor.device),
      childId: deviceChildId(actor.device)
    };
  }

  return null;
}

export function createContentService({
  childService,
  contentCategories,
  contentLikes,
  contentMovieTags,
  contentMovies,
  contentTags,
  tariffService,
  transcoder
}) {
  function ownerIdForActor(actor) {
    const ownerId = actorOwnerId(actor);

    if (ownerId) {
      return ownerId;
    }

    throw forbidden("Like owner was not found", "LIKE_OWNER_NOT_FOUND");
  }

  function likeContextForActor(actor) {
    return {
      contentLikes,
      canWatchPremium: tariffService.canWatchMovie(actor, { is_premium: true }),
      ownerId: ownerIdForActor(actor)
    };
  }

  async function actorWithChildBlacklist(actor, childId = "") {
    const normalizedChildId = String(childId || "").trim();

    if (!normalizedChildId || actor?.type === "device" || isAdminActor(actor)) {
      return actor;
    }

    const parentId = ownerIdForActor(actor);

    await childService.getChildForParentAsync(parentId, normalizedChildId);

    return {
      ...actor,
      blacklistTarget: {
        parentId,
        childId: normalizedChildId
      }
    };
  }

  function getCategory(categoryId) {
    const category = contentCategories.findById(categoryId);

    if (!category) {
      throw notFound("Content category not found", "CONTENT_CATEGORY_NOT_FOUND");
    }

    return category;
  }

  function getMovieRecord(movieId) {
    const movie = contentMovies.findById(movieId);

    if (!movie) {
      throw notFound("Content movie not found", "CONTENT_MOVIE_NOT_FOUND");
    }

    return movie;
  }

  async function getTagRecord(tagId) {
    const tag = await contentTags.findById(tagId);

    if (!tag) {
      throw notFound("Content tag not found", "CONTENT_TAG_NOT_FOUND");
    }

    return tag;
  }

  function listSeriesRecords(movie) {
    return (movie.series || [])
      .map((movieId) => contentMovies.findById(movieId))
      .filter(Boolean);
  }

  function findParentSeriesMovie(movieId) {
    return contentMovies.list().find((movie) => (movie.series || []).includes(movieId)) || null;
  }

  function isSeriesMovie(movie) {
    return Boolean(movie.series_id || findParentSeriesMovie(movie.id));
  }

  function isSeriesContainer(movie) {
    return normalized(movie.content_type) === "series" || listSeriesRecords(movie).length > 0;
  }

  function filterResultType(movie) {
    return isSeriesContainer(movie) || isSeriesMovie(movie) ? "series" : "movies";
  }

  function blacklistIdsForMovie(movie) {
    const ids = [movie.id];
    const parentSeries = findParentSeriesMovie(movie.id);

    if (parentSeries) {
      ids.push(parentSeries.id);
    }

    return ids;
  }

  function isMovieBlacklistedForActor(actor, movie) {
    if (!childService?.isAnyContentBlacklisted) {
      return false;
    }

    const target = actorBlacklistTarget(actor);
    const parentId = target?.parentId;
    const childId = target?.childId;

    if (!parentId || !childId) {
      return false;
    }

    return childService.isAnyContentBlacklisted(
      parentId,
      childId,
      blacklistIdsForMovie(movie)
    );
  }

  function assertMovieNotBlacklisted(actor, movie) {
    if (isMovieBlacklistedForActor(actor, movie)) {
      throw forbidden("Content is blocked for this child", "CONTENT_BLACKLISTED");
    }
  }

  async function attributesWithVideoDuration(attributes) {
    if (!attributes.file?.path || !transcoder?.probeVideoDuration) {
      return attributes;
    }

    const durationSeconds = await transcoder.probeVideoDuration(attributes.file.path);

    return durationSeconds === null
      ? attributes
      : {
          ...attributes,
          duration_sec: durationSeconds
        };
  }

  function collectMovieTree(movie, seenMovieIds = new Set()) {
    if (!movie || seenMovieIds.has(movie.id)) {
      return [];
    }

    seenMovieIds.add(movie.id);

    return [
      movie,
      ...listSeriesRecords(movie).flatMap((seriesMovie) => collectMovieTree(seriesMovie, seenMovieIds))
    ];
  }

  function resolveLikeTarget(actor, contentId) {
    const movie = contentMovies.findById(contentId);

    if (movie) {
      tariffService.assertCanWatchMovie(actor, movie);

      return {
        id: movie.id,
        targetType: "content",
        itemType: "movie",
        movie
      };
    }

    const content = catalog.find((item) => item.id === contentId);

    if (content) {
      return {
        id: content.id,
        targetType: "content",
        itemType: "content",
        content
      };
    }

    throw notFound("Content item not found", "CONTENT_NOT_FOUND");
  }

  function resolveBlacklistTarget(contentId) {
    const movie = contentMovies.findById(contentId);

    if (!movie) {
      throw notFound("Content movie not found", "CONTENT_MOVIE_NOT_FOUND");
    }

    return {
      id: movie.id,
      targetType: "content",
      itemType: "movie",
      movie
    };
  }

  function likeResponse(ownerId, target, liked) {
    return {
      liked,
      content_id: target.id,
      target_type: target.targetType,
      target_id: target.id,
      item_type: target.itemType,
      likes_count: contentLikes.countByTarget(target.id, target.targetType),
      is_liked: Boolean(contentLikes.findByOwnerAndTarget(ownerId, target.id, target.targetType))
    };
  }

  function childBlacklistItem(parentId, childId, contentId) {
    if (childService?.findBlacklistItem) {
      return childService.findBlacklistItem(parentId, childId, contentId);
    }

    if (!childService?.listBlacklist) {
      return null;
    }

    return childService
      .listBlacklist(parentId, childId)
      .find((item) => item.contentId === contentId || item.content_id === contentId) || null;
  }

  function blacklistResponse(parentId, childId, contentId, blacklisted, item = undefined) {
    const blacklistItem = item === undefined ? childBlacklistItem(parentId, childId, contentId) : item;

    return {
      blacklisted,
      is_blacklisted: blacklisted,
      content_id: contentId,
      target_type: "content",
      target_id: contentId,
      item_type: "movie",
      childId,
      child_id: childId,
      blacklist_item: blacklistItem
    };
  }

  return {
    createCategory({ title, description, type, slug, active, file }) {
      assertCategoryTitleAvailable(contentCategories, title);
      const categorySlug = slug ? slugify(slug, "category") : uniqueCategorySlug(contentCategories, title);

      if (slug) {
        assertCategorySlugAvailable(contentCategories, categorySlug);
      }

      return serializeCategory(contentCategories.create(categoryAttributes({
        title,
        description,
        type,
        slug: categorySlug,
        active,
        file
      })));
    },

    deleteCategory(categoryId) {
      const category = getCategory(categoryId);
      const deletedCategory = contentCategories.delete(category.id);

      removeStoredFile(deletedCategory.icon);

      return {
        deleted: true,
        category: serializeCategory(deletedCategory)
      };
    },

    findContent(contentId) {
      return catalog.find((item) => item.id === contentId) || null;
    },

    async findWatchContent(actor, contentId) {
      const movie = contentMovies.findById(contentId);

      if (movie) {
        tariffService.assertCanWatchMovie(actor, movie);
        assertMovieNotBlacklisted(actor, movie);
        const movieWithTranscode = transcoder.ensureMovieTranscoded(movie);
        const likeContext = likeContextForActor(actor);
        const parentSeries = findParentSeriesMovie(movie.id);

        return {
          content: await serializeMovie(movieWithTranscode, listSeriesRecords(movieWithTranscode), contentTags, contentMovieTags, likeContext),
          target: {
            type: "movie",
            contentId: movie.id,
            parentSeriesId: parentSeries?.id || null
          }
        };
      }

      const content = catalog.find((item) => item.id === contentId);

      if (content) {
        return {
          content: serializeCatalogItem(content, likeContextForActor(actor)),
          target: {
            type: "catalog",
            contentId: content.id,
            parentSeriesId: null
          }
        };
      }

      throw notFound("Content item not found", "CONTENT_NOT_FOUND");
    },

    recordWatchProgress({ contentId, countedAsView = false, watchTimeDeltaSec = 0 }) {
      const movie = contentMovies.findById(contentId);

      if (!movie) {
        return null;
      }

      const now = new Date().toISOString();
      const delta = Math.max(0, watchTimeDeltaSec);
      const updatedMovie = contentMovies.update(movie.id, {
        views_count: metricValue(movie.views_count) + (countedAsView ? 1 : 0),
        watch_time_sec: metricValue(movie.watch_time_sec) + delta,
        last_viewed_at: countedAsView ? now : movie.last_viewed_at || null
      });
      const parentSeries = findParentSeriesMovie(movie.id);
      let updatedSeries = null;

      if (parentSeries) {
        updatedSeries = contentMovies.update(parentSeries.id, {
          series_views_count: metricValue(parentSeries.series_views_count) + (countedAsView ? 1 : 0),
          series_watch_time_sec: metricValue(parentSeries.series_watch_time_sec) + delta,
          series_last_viewed_at: countedAsView ? now : parentSeries.series_last_viewed_at || null
        });
      }

      return {
        movie: updatedMovie,
        series: updatedSeries
      };
    },

    getLikeStatus(actor, contentId) {
      const ownerId = ownerIdForActor(actor);
      const target = resolveLikeTarget(actor, contentId);
      const liked = Boolean(contentLikes.findByOwnerAndTarget(ownerId, target.id, target.targetType));

      return likeResponse(ownerId, target, liked);
    },

    getBlacklistStatus(parentId, childId, contentId) {
      const target = resolveBlacklistTarget(contentId);

      childService.getChildForParent(parentId, childId);

      const item = childBlacklistItem(parentId, childId, target.id);

      return blacklistResponse(parentId, childId, target.id, Boolean(item), item);
    },

    async getBlacklistStatusAsync(parentId, childId, contentId) {
      const target = resolveBlacklistTarget(contentId);

      await childService.getChildForParentAsync(parentId, childId);

      const item = childService.findBlacklistItem
        ? childService.findBlacklistItem(parentId, childId, target.id)
        : childBlacklistItem(parentId, childId, target.id);

      return blacklistResponse(parentId, childId, target.id, Boolean(item), item);
    },

    likeContent(actor, contentId) {
      const ownerId = ownerIdForActor(actor);
      const target = resolveLikeTarget(actor, contentId);

      contentLikes.findOrCreate(ownerId, target.id, target.targetType);

      return likeResponse(ownerId, target, true);
    },

    blacklistContent(parentId, childId, contentId) {
      const target = resolveBlacklistTarget(contentId);
      const item = childService.addToBlacklist(parentId, childId, target.id);

      return blacklistResponse(parentId, childId, target.id, true, item);
    },

    async blacklistContentAsync(parentId, childId, contentId) {
      const target = resolveBlacklistTarget(contentId);
      const item = await childService.addToBlacklistAsync(parentId, childId, target.id);

      return blacklistResponse(parentId, childId, target.id, true, item);
    },

    async listLikedContent(actor) {
      const likeContext = likeContextForActor(actor);
      const items = [];

      for (const like of contentLikes.listByOwnerId(likeContext.ownerId)) {
        const movie = contentMovies.findById(like.targetId);

        if (movie) {
          if (!tariffService.canWatchMovie(actor, movie)) {
            continue;
          }

          if (isMovieBlacklistedForActor(actor, movie)) {
            continue;
          }

          items.push({
            ...await serializeMovie(movie, listSeriesRecords(movie), contentTags, contentMovieTags, likeContext),
            liked_at: like.createdAt
          });
          continue;
        }

        const content = catalog.find((item) => item.id === like.targetId);

        if (content) {
          items.push({
            ...serializeCatalogItem(content, likeContext),
            liked_at: like.createdAt
          });
        }
      }

      return {
        data: items,
        likes: items
      };
    },

    unlikeContent(actor, contentId) {
      const ownerId = ownerIdForActor(actor);
      const target = resolveLikeTarget(actor, contentId);

      contentLikes.deleteByOwnerAndTarget(ownerId, target.id, target.targetType);

      return likeResponse(ownerId, target, false);
    },

    unblacklistContent(parentId, childId, contentId) {
      const target = resolveBlacklistTarget(contentId);
      const result = childService.removeFromBlacklist(parentId, childId, target.id);

      return {
        ...blacklistResponse(parentId, childId, target.id, false, null),
        deleted: result.deleted
      };
    },

    async unblacklistContentAsync(parentId, childId, contentId) {
      const target = resolveBlacklistTarget(contentId);
      const result = await childService.removeFromBlacklistAsync(parentId, childId, target.id);

      return {
        ...blacklistResponse(parentId, childId, target.id, false, null),
        deleted: result.deleted
      };
    },

    async addSeriesMovie(parentMovieId, attributes) {
      const parentMovie = getMovieRecord(parentMovieId);
      let seriesMovie = null;

      try {
        assertMovieCategoryExists(contentCategories, attributes.category_id);
        const tagIds = await resolveMovieTagIds(contentTags, attributes);
        const movieCreateAttributes = await attributesWithVideoDuration({ ...attributes, series: [] });
        seriesMovie = contentMovies.create(movieAttributes(movieCreateAttributes));
        await contentMovieTags.replaceForMovie(seriesMovie.id, tagIds);
        const transcodeJob = transcoder.queueMovieTranscode(seriesMovie);
        const series = [...(parentMovie.series || []), seriesMovie.id];
        const updatedParentMovie = contentMovies.update(parentMovie.id, { series });

        return {
          movie: await serializeMovie(updatedParentMovie, listSeriesRecords(updatedParentMovie), contentTags, contentMovieTags),
          series_item: await serializeMovie(seriesMovie, [], contentTags, contentMovieTags),
          transcode_job_id: transcodeJob?.id || null
        };
      } catch (error) {
        if (seriesMovie?.id) {
          await contentMovieTags.removeMovie(seriesMovie.id);
          contentMovies.delete(seriesMovie.id);
          transcoder.removeMovieFiles(seriesMovie);
        }

        throw error;
      }
    },

    async createMovie(attributes) {
      let movie = null;

      try {
        assertMovieCategoryExists(contentCategories, attributes.category_id);
        const tagIds = await resolveMovieTagIds(contentTags, attributes);
        const movieCreateAttributes = await attributesWithVideoDuration(attributes);
        movie = contentMovies.create(movieAttributes(movieCreateAttributes));
        await contentMovieTags.replaceForMovie(movie.id, tagIds);
        const transcodeJob = transcoder.queueMovieTranscode(movie);

        return {
          ...await serializeMovie(movie, [], contentTags, contentMovieTags),
          transcode_job_id: transcodeJob?.id || null
        };
      } catch (error) {
        if (movie?.id) {
          await contentMovieTags.removeMovie(movie.id);
          contentMovies.delete(movie.id);
          transcoder.removeMovieFiles(movie);
        } else if (attributes.file?.path) {
          transcoder.removeMovieFiles({
            id: null,
            source: { path: attributes.file.path }
          });
        }

        throw error;
      }
    },

    getCategory(categoryId) {
      return serializeCategory(getCategory(categoryId));
    },

    async getMovie(actor, movieId, { childId = "" } = {}) {
      actor = await actorWithChildBlacklist(actor, childId);

      const movie = getMovieRecord(movieId);
      const adminActor = isAdminActor(actor);

      if (!adminActor) {
        tariffService.assertCanWatchMovie(actor, movie);
        assertMovieNotBlacklisted(actor, movie);
      }

      const movieWithTranscode = transcoder.ensureMovieTranscoded(movie);
      const likeContext = likeContextForActor(actor);

      return {
        movie: await serializeMovie(
          movieWithTranscode,
          listSeriesRecords(movieWithTranscode)
            .filter((item) => adminActor || tariffService.canWatchMovie(actor, item))
            .filter((item) => adminActor || !isMovieBlacklistedForActor(actor, item)),
          contentTags,
          contentMovieTags,
          likeContext
        )
      };
    },

    async getMovieSeries(actor, movieId, { childId = "" } = {}) {
      actor = await actorWithChildBlacklist(actor, childId);

      const movie = getMovieRecord(movieId);
      const adminActor = isAdminActor(actor);

      if (!adminActor) {
        tariffService.assertCanWatchMovie(actor, movie);
        assertMovieNotBlacklisted(actor, movie);
      }
      const likeContext = likeContextForActor(actor);

      return {
        movie_id: movie.id,
        series: await Promise.all(
          listSeriesRecords(movie)
            .filter((item) => adminActor || tariffService.canWatchMovie(actor, item))
            .filter((item) => adminActor || !isMovieBlacklistedForActor(actor, item))
            .map((item) => serializeMovie(item, [], contentTags, contentMovieTags, likeContext))
        )
      };
    },

    listCategories() {
      return {
        categories: contentCategories.list().map(serializeCategory)
      };
    },

    async listFilters() {
      return {
        categories: contentCategories.list().map(serializeCategory),
        tags: (await contentTags.list()).map(serializeTag)
      };
    },

    listContent(actor, { liked = false, q = "" } = {}) {
      const likeContext = likeContextForActor(actor);
      const items = catalog
        .filter((item) => [
          ...localizedValues(item.title),
          item.type
        ].some((value) => searchValueMatches(value, q)))
        .map((item) => serializeCatalogItem(item, likeContext));

      return liked ? items.filter((item) => item.is_liked) : items;
    },

    async filterContent(actor, { categoryIds = [], tagIds = [] } = {}) {
      const normalizedCategoryIds = uniqueStrings(categoryIds);
      const normalizedTagIds = uniqueStrings(tagIds);
      const likeContext = likeContextForActor(actor);
      const adminActor = isAdminActor(actor);
      const movieRows = await Promise.all(
        contentMovies.list()
          .filter((movie) => adminActor || tariffService.canWatchMovie(actor, movie))
          .filter((movie) => adminActor || !isMovieBlacklistedForActor(actor, movie))
          .filter((movie) => (
            normalizedCategoryIds.length === 0
            || normalizedCategoryIds.includes(movie.category_id)
          ))
          .map(async (movie) => ({
            movie,
            tagIds: await contentMovieTags.listByMovieId(movie.id)
          }))
      );
      const filteredMovies = movieRows
        .filter(({ tagIds: movieTagIds }) => (
          normalizedTagIds.length === 0
          || movieTagIds.some((tagId) => normalizedTagIds.includes(tagId))
        ))
        .map(({ movie }) => movie);
      const data = await Promise.all(
        filteredMovies.map(async (movie) => ({
          ...await serializeMovie(movie, [], contentTags, contentMovieTags, likeContext),
          type: filterResultType(movie)
        }))
      );

      return { data };
    },

    async listMovies(
      actor,
      {
        category = "",
        childId = "",
        liked = false,
        kind = "",
        q = "",
        tags = [],
        page = 1,
        limit = 20
      } = {}
    ) {
      actor = await actorWithChildBlacklist(actor, childId);

      const likeContext = likeContextForActor(actor);
      const adminActor = isAdminActor(actor);
      const categoryValues = categoryFilterValues(contentCategories, category);
      const filterTagIds = await tagFilterIds(contentTags, tags);
      const currentPage = Math.max(Number(page) || 1, 1);
      const perPage = Math.max(Number(limit) || 20, 1);
      const seriesOnly = normalized(kind) === "series";

      const movieRows = await Promise.all(
        contentMovies.list()
          .filter((movie) => !isSeriesMovie(movie))
          .filter((movie) => !seriesOnly || listSeriesRecords(movie).length > 0 || normalized(movie.content_type) === "series")
          .filter((movie) => adminActor || tariffService.canWatchMovie(actor, movie))
          .filter((movie) => adminActor || !isMovieBlacklistedForActor(actor, movie))
          .filter((movie) => categoryValues.length === 0 || categoryValues.includes(movie.category_id))
          .filter((movie) => movieMatchesSearch(movie, q) || listSeriesRecords(movie).some((item) => movieMatchesSearch(item, q)))
          .filter((movie) => !liked || Boolean(contentLikes.findByOwnerAndTarget(likeContext.ownerId, movie.id)))
          .map(async (movie) => ({
            movie,
            tagIds: await contentMovieTags.listByMovieId(movie.id)
          }))
      );
      const filteredMovies = movieRows
        .filter(({ tagIds }) => filterTagIds.every((tagId) => tagIds.includes(tagId)))
        .map(({ movie }) => movie);
      const total = filteredMovies.length;
      const totalPages = Math.ceil(total / perPage);
      const start = (currentPage - 1) * perPage;
      const paginatedMovies = filteredMovies.slice(start, start + perPage);

      return {
        movies: await Promise.all(
          paginatedMovies.map((movie) => serializeMovie(movie, [], contentTags, contentMovieTags, likeContext))
        ),
        series: seriesOnly
          ? await Promise.all(paginatedMovies.map((movie) => serializeMovie(movie, [], contentTags, contentMovieTags, likeContext)))
          : undefined,
        pagination: {
          page: currentPage,
          limit: perPage,
          total,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        }
      };
    },

    async listPopularMovies(actor, { childId = "", limit = 20 } = {}) {
      actor = await actorWithChildBlacklist(actor, childId);

      const likeContext = likeContextForActor(actor);
      const adminActor = isAdminActor(actor);
      const maxItems = Math.max(Number(limit) || 20, 1);
      const movies = contentMovies.list()
        .filter((movie) => !isSeriesMovie(movie))
        .filter((movie) => adminActor || tariffService.canWatchMovie(actor, movie))
        .filter((movie) => adminActor || !isMovieBlacklistedForActor(actor, movie))
        .sort((left, right) => (
          (metricValue(right.views_count) + metricValue(right.series_views_count))
          - (metricValue(left.views_count) + metricValue(left.series_views_count))
        ) || (
          (metricValue(right.watch_time_sec) + metricValue(right.series_watch_time_sec))
          - (metricValue(left.watch_time_sec) + metricValue(left.series_watch_time_sec))
        ) || String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
        .slice(0, maxItems);
      const popular = await Promise.all(
        movies.map((movie) => serializeMovie(movie, [], contentTags, contentMovieTags, likeContext))
      );

      return {
        popular,
        movies: popular
      };
    },

    async getOfflineMovie(actor, movieId, { childId = "" } = {}) {
      actor = await actorWithChildBlacklist(actor, childId);

      const movie = getMovieRecord(movieId);

      tariffService.assertCanWatchMovie(actor, movie);
      assertMovieNotBlacklisted(actor, movie);

      const movieWithTranscode = transcoder.ensureMovieTranscoded(movie);
      const likeContext = likeContextForActor(actor);
      const serializedMovie = await serializeMovie(movieWithTranscode, [], contentTags, contentMovieTags, likeContext);
      const offline = {
        contentId: serializedMovie.id,
        content_id: serializedMovie.id,
        title: serializedMovie.title,
        description: serializedMovie.description,
        poster_url: serializedMovie.poster_url,
        poster: serializedMovie.poster,
        views_count: serializedMovie.views_count,
        play_count: serializedMovie.play_count,
        watch_time_sec: serializedMovie.watch_time_sec,
        duration_sec: serializedMovie.duration_sec,
        duration_seconds: serializedMovie.duration_seconds,
        playback: serializedMovie.playback,
        cache_key: `${serializedMovie.id}:${serializedMovie.updatedAt || serializedMovie.createdAt || ""}`,
        downloaded: true,
        more_actions_enabled: false,
        available_actions: [],
        updatedAt: serializedMovie.updatedAt
      };

      return {
        movie: serializedMovie,
        offline,
        cache: offline
      };
    },

    async deleteMovie(movieId) {
      const movie = getMovieRecord(movieId);
      const moviesToDelete = collectMovieTree(movie);
      let deletedMovie = null;

      for (const movieToDelete of moviesToDelete) {
        const deleted = contentMovies.delete(movieToDelete.id);

        if (deleted) {
          await contentMovieTags.removeMovie(movieToDelete.id);
          contentLikes.deleteByTarget(movieToDelete.id);
          childService?.removeContentFromAllBlacklists?.(movieToDelete.id);
          transcoder.removeMovieFiles(movieToDelete);
          removeStoredFile(movieToDelete.poster);
        }

        if (movieToDelete.id === movie.id) {
          deletedMovie = deleted;
        }
      }

      const deletedMovieIds = new Set(moviesToDelete.map((movieToDelete) => movieToDelete.id));

      for (const parentMovie of contentMovies.list()) {
        if ((parentMovie.series || []).some((seriesMovieId) => deletedMovieIds.has(seriesMovieId))) {
          contentMovies.update(parentMovie.id, {
            series: parentMovie.series.filter((seriesMovieId) => !deletedMovieIds.has(seriesMovieId))
          });
        }
      }

      return {
        deleted: true,
        movie: await serializeMovie(deletedMovie, [], contentTags, contentMovieTags)
      };
    },

    async createTag({ name, slug, active }) {
      const tagSlug = slug ? slugify(slug, "tag") : await uniqueTagSlug(contentTags, name);

      await assertTagNameAvailable(contentTags, name);
      await assertTagSlugAvailable(contentTags, tagSlug);

      return serializeTag(await contentTags.create(tagAttributes({
        name,
        slug: tagSlug,
        active
      })));
    },

    async deleteTag(tagId) {
      const tag = await getTagRecord(tagId);
      const deletedTag = await contentTags.delete(tag.id);

      await contentMovieTags.removeTag(tag.id);

      return {
        deleted: true,
        tag: serializeTag(deletedTag)
      };
    },

    async getTag(tagId) {
      return serializeTag(await getTagRecord(tagId));
    },

    async listTags() {
      return {
        tags: (await contentTags.list()).map(serializeTag)
      };
    },

    async replaceMovieTags(movieId, attributes) {
      const movie = getMovieRecord(movieId);
      const tagIds = await resolveMovieTagIds(contentTags, attributes);
      await contentMovieTags.replaceForMovie(movie.id, tagIds);

      return {
        movie: await serializeMovie(movie, listSeriesRecords(movie), contentTags, contentMovieTags)
      };
    },

    updateCategory(categoryId, attributes) {
      const category = getCategory(categoryId);
      const categoryUpdates = { ...attributes };

      if (categoryUpdates.title) {
        assertCategoryTitleAvailable(contentCategories, categoryUpdates.title, category.id);
      }

      if (Object.hasOwn(categoryUpdates, "slug")) {
        categoryUpdates.slug = slugify(categoryUpdates.slug, "category");
        assertCategorySlugAvailable(contentCategories, categoryUpdates.slug, category.id);
      }

      if (Object.hasOwn(categoryUpdates, "file")) {
        categoryUpdates.icon = createSourceFromFile(categoryUpdates.file);
        delete categoryUpdates.file;
      }

      const updatedCategory = contentCategories.update(category.id, categoryUpdates);

      if (categoryUpdates.icon) {
        removeStoredFile(category.icon);
      }

      return serializeCategory(updatedCategory);
    },

    async updateMovie(movieId, attributes) {
      const movie = getMovieRecord(movieId);
      const movieUpdates = normalizeMovieUpdateAttributes(movie, attributes);

      assertMovieCategoryExists(contentCategories, movieUpdates.category_id);

      if (Object.hasOwn(movieUpdates, "tag_ids") || Object.hasOwn(movieUpdates, "tags")) {
        const tagIds = await resolveMovieTagIds(contentTags, movieUpdates);
        await contentMovieTags.replaceForMovie(movie.id, tagIds);
        delete movieUpdates.tag_ids;
        delete movieUpdates.tags;
      }

      if (Object.hasOwn(movieUpdates, "posterFile")) {
        movieUpdates.poster = createSourceFromFile(movieUpdates.posterFile);
        delete movieUpdates.posterFile;
      }

      const updatedMovie = Object.keys(movieUpdates).length > 0
        ? contentMovies.update(movie.id, movieUpdates)
        : movie;

      if (movieUpdates.poster) {
        removeStoredFile(movie.poster);
      }

      return {
        movie: await serializeMovie(updatedMovie, listSeriesRecords(updatedMovie), contentTags, contentMovieTags)
      };
    },

    async updateTag(tagId, attributes) {
      const tag = await getTagRecord(tagId);
      const tagUpdates = { ...attributes };

      if (tagUpdates.name) {
        await assertTagNameAvailable(contentTags, tagUpdates.name, tag.id);
      }

      if (Object.hasOwn(tagUpdates, "slug")) {
        tagUpdates.slug = slugify(tagUpdates.slug, "tag");
        await assertTagSlugAvailable(contentTags, tagUpdates.slug, tag.id);
      }

      return serializeTag(await contentTags.update(tag.id, tagUpdates));
    }
  };
}

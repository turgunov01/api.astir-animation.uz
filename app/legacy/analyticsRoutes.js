import { Router } from "express";
import { requireActor } from "./auth.js";
import {
  asyncHandler,
  isUuid,
  legacyError,
  legacyErrorMiddleware
} from "./utils.js";

function normalizeTargetType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["content", "movie", "movies", "episode", "episodes"].includes(normalized)) {
    return "content";
  }

  if (normalized === "series") {
    return "series";
  }

  return "";
}

function requestedTargetType(request) {
  const value = request.query.target_type
    || request.query.type
    || request.body?.target_type
    || request.body?.type;

  if (value === undefined || value === null || value === "") {
    return "";
  }

  const targetType = normalizeTargetType(value);
  if (!targetType) {
    throw legacyError(400, "invalid_reaction_target_type", "type must be content or series");
  }

  return targetType;
}

async function resolveLegacyReactionTarget(db, id, targetType = "") {
  if (!targetType || targetType === "content") {
    const content = await db.one("SELECT id FROM content WHERE id = $1", [id]);

    if (content) {
      return { source: "legacy", type: "content", id: content.id, contentId: content.id };
    }
  }

  if (!targetType || targetType === "series") {
    const series = await db.one("SELECT id FROM series WHERE id = $1", [id]);

    if (series) {
      return { source: "legacy", type: "series", id: series.id, contentId: null };
    }
  }

  return null;
}

function metricValue(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function isStoreSeriesTarget(contentMovies, movie) {
  const contentType = String(movie?.content_type || movie?.type || "").trim().toLowerCase();

  if (contentType === "series") {
    return true;
  }

  return (movie?.series || []).some((itemId) => Boolean(contentMovies?.findById?.(itemId)));
}

function resolveStoreReactionTarget(contentMovies, id, targetType = "") {
  const movie = contentMovies?.findById?.(id);

  if (!movie) {
    return null;
  }

  const type = isStoreSeriesTarget(contentMovies, movie) ? "series" : "content";

  if (targetType && targetType !== type) {
    return null;
  }

  return {
    source: "store",
    type,
    id: movie.id,
    contentId: type === "content" ? movie.id : null,
    movie
  };
}

async function resolveReactionTarget(db, id, targetType = "", { contentMovies = null } = {}) {
  if (!isUuid(id)) {
    throw legacyError(404, "reaction_target_not_found", "content or series not found");
  }

  const legacyTarget = await resolveLegacyReactionTarget(db, id, targetType);

  if (legacyTarget) {
    return legacyTarget;
  }

  const storeTarget = resolveStoreReactionTarget(contentMovies, id, targetType);

  if (storeTarget) {
    return storeTarget;
  }

  throw legacyError(404, "reaction_target_not_found", targetType === "series" ? "series not found" : "content or series not found");
}

async function ownerUserIdForActor(db, actor) {
  if (actor.kind === "user") {
    return actor.user.id;
  }

  if (actor.kind === "child_device") {
    if (actor.parent_id) {
      return actor.parent_id;
    }

    const child = await db.one("SELECT parent_id FROM children WHERE id = $1", [actor.child_id]);
    return child?.parent_id || null;
  }

  if (actor.kind === "tv_device") {
    return actor.parent_id;
  }

  return null;
}

async function requireOwnerUserIdForActor(db, actor) {
  const userId = await ownerUserIdForActor(db, actor);

  if (!userId) {
    throw legacyError(403, "forbidden", "user token is required");
  }

  return userId;
}

function storeSeriesItems(contentMovies, seriesId) {
  const rows = [];
  const seenIds = new Set();

  function add(movie) {
    if (!movie || seenIds.has(movie.id)) {
      return;
    }

    seenIds.add(movie.id);
    rows.push(movie);
  }

  const parent = contentMovies?.findById?.(seriesId);

  for (const itemId of parent?.series || []) {
    add(contentMovies?.findById?.(itemId));
  }

  for (const movie of contentMovies?.list?.() || []) {
    if (movie.series_id === seriesId) {
      add(movie);
    }
  }

  return rows;
}

function storeViewsForTarget(contentMovies, target) {
  const movie = target.movie || contentMovies?.findById?.(target.id);

  if (!movie) {
    return 0;
  }

  if (target.type === "series") {
    const explicitViews = metricValue(movie.series_views_count);

    if (explicitViews > 0) {
      return explicitViews;
    }

    return storeSeriesItems(contentMovies, target.id)
      .reduce((total, item) => total + metricValue(item.views_count), 0);
  }

  return metricValue(movie.views_count);
}

async function statisticsForTarget(db, target, { contentMovies = null, contentReactions = null } = {}) {
  if (target.source === "store") {
    return {
      likes: contentReactions?.countByTarget?.(target.id, target.type, "like") || 0,
      dislikes: contentReactions?.countByTarget?.(target.id, target.type, "dislike") || 0,
      views: storeViewsForTarget(contentMovies, target)
    };
  }

  const [likes, dislikes, views] = await Promise.all([
    db.one(
      "SELECT COUNT(*)::integer AS count FROM likes WHERE target_type = $1 AND target_id = $2",
      [target.type, target.id]
    ),
    db.one(
      "SELECT COUNT(*)::integer AS count FROM dislikes WHERE target_type = $1 AND target_id = $2",
      [target.type, target.id]
    ),
    target.type === "series"
      ? db.one(
        "SELECT COALESCE(SUM(views_count), 0)::integer AS views FROM content WHERE series_id = $1",
        [target.id]
      )
      : db.one(
        "SELECT COALESCE(views_count, 0)::integer AS views FROM content WHERE id = $1",
        [target.id]
      )
  ]);

  return {
    likes: likes?.count || 0,
    dislikes: dislikes?.count || 0,
    views: views?.views || 0
  };
}

async function runReactionTransaction(db, work) {
  if (typeof db.transaction === "function") {
    return db.transaction(work);
  }

  return work({
    query: db.query.bind(db)
  });
}

async function setReaction(db, userId, target, reaction, options = {}) {
  if (target.source === "store") {
    if (typeof options.contentReactions?.setReaction !== "function") {
      throw legacyError(503, "reaction_store_unavailable", "reaction store unavailable");
    }

    options.contentReactions.setReaction(userId, target.id, target.type, reaction);

    return {
      liked: reaction === "like",
      disliked: reaction === "dislike",
      ...await statisticsForTarget(db, target, options)
    };
  }

  await runReactionTransaction(db, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [String(userId), `${target.type}:${target.id}`]
    );

    if (reaction === "like") {
      await client.query(
        "DELETE FROM dislikes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
        [userId, target.type, target.id]
      );
      await client.query(
        `
          INSERT INTO likes (user_id, content_id, target_type, target_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `,
        [userId, target.contentId, target.type, target.id]
      );
      return;
    }

    await client.query(
      "DELETE FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
      [userId, target.type, target.id]
    );
    await client.query(
      `
        INSERT INTO dislikes (user_id, content_id, target_type, target_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [userId, target.contentId, target.type, target.id]
    );
  });

  return {
    liked: reaction === "like",
    disliked: reaction === "dislike",
    ...await statisticsForTarget(db, target, options)
  };
}

async function reactionStatus(db, userId, target, options = {}) {
  if (target.source === "store") {
    const row = options.contentReactions?.findByOwnerAndTarget?.(userId, target.id, target.type);
    const reaction = row?.reaction === "dislike" ? "dislike" : row?.reaction === "like" ? "like" : null;

    return {
      liked: reaction === "like",
      disliked: reaction === "dislike",
      reaction,
      ...await statisticsForTarget(db, target, options)
    };
  }

  const [like, dislike, statistics] = await Promise.all([
    db.one(
      "SELECT 1 FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
      [userId, target.type, target.id]
    ),
    db.one(
      "SELECT 1 FROM dislikes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
      [userId, target.type, target.id]
    ),
    statisticsForTarget(db, target, options)
  ]);

  return {
    liked: Boolean(like),
    disliked: Boolean(dislike),
    reaction: like ? "like" : dislike ? "dislike" : null,
    ...statistics
  };
}

export function createAnalyticsRoutes({ contentMovies = null, contentReactions = null } = {}) {
  const router = Router();
  const analyticsOptions = { contentMovies, contentReactions };

  async function reactionStatusHandler(request, response) {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveReactionTarget(request.legacyDb, request.params.content_id, requestedTargetType(request), analyticsOptions);

    response.json(await reactionStatus(request.legacyDb, userId, target, analyticsOptions));
  }

  router.get("/reaction/:content_id", requireActor, asyncHandler(reactionStatusHandler));
  router.get("/like/:content_id", requireActor, asyncHandler(reactionStatusHandler));

  router.post("/like/:content_id", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveReactionTarget(request.legacyDb, request.params.content_id, requestedTargetType(request), analyticsOptions);

    response.status(201).json(await setReaction(request.legacyDb, userId, target, "like", analyticsOptions));
  }));

  router.post("/dislike/:content_id", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveReactionTarget(request.legacyDb, request.params.content_id, requestedTargetType(request), analyticsOptions);

    response.status(201).json(await setReaction(request.legacyDb, userId, target, "dislike", analyticsOptions));
  }));

  router.get("/statistics/:content_id", asyncHandler(async (request, response) => {
    const target = await resolveReactionTarget(request.legacyDb, request.params.content_id, requestedTargetType(request), analyticsOptions);

    response.json(await statisticsForTarget(request.legacyDb, target, analyticsOptions));
  }));

  router.use(legacyErrorMiddleware);

  return router;
}

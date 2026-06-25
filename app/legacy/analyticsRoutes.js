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

async function resolveReactionTarget(db, id, targetType = "") {
  if (!isUuid(id)) {
    throw legacyError(404, "reaction_target_not_found", "content or series not found");
  }

  if (!targetType || targetType === "content") {
    const content = await db.one("SELECT id FROM content WHERE id = $1", [id]);

    if (content) {
      return { type: "content", id: content.id, contentId: content.id };
    }

    if (targetType === "content") {
      throw legacyError(404, "reaction_target_not_found", "content not found");
    }
  }

  const series = await db.one("SELECT id FROM series WHERE id = $1", [id]);

  if (series) {
    return { type: "series", id: series.id, contentId: null };
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

async function statisticsForTarget(db, target) {
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

async function setReaction(db, userId, target, reaction) {
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
    ...await statisticsForTarget(db, target)
  };
}

export function createAnalyticsRoutes() {
  const router = Router();

  router.post("/like/:content_id", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveReactionTarget(request.legacyDb, request.params.content_id, requestedTargetType(request));

    response.status(201).json(await setReaction(request.legacyDb, userId, target, "like"));
  }));

  router.post("/dislike/:content_id", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveReactionTarget(request.legacyDb, request.params.content_id, requestedTargetType(request));

    response.status(201).json(await setReaction(request.legacyDb, userId, target, "dislike"));
  }));

  router.get("/statistics/:content_id", asyncHandler(async (request, response) => {
    const target = await resolveReactionTarget(request.legacyDb, request.params.content_id, requestedTargetType(request));

    response.json(await statisticsForTarget(request.legacyDb, target));
  }));

  router.use(legacyErrorMiddleware);

  return router;
}

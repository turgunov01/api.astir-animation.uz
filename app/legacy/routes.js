import { Router } from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import QRCode from "qrcode";
import { hashSecret, verifySecret } from "../lib/security.js";
import { buildHlsMasterPlaylist, hlsRenditionProfiles } from "../lib/hlsProfiles.js";
import {
  authenticateRequest,
  createOtp,
  findOrCreateOAuthUser,
  issueDeviceToken,
  issueTokenPair,
  issueTVToken,
  messageResponse,
  refreshTokenPair,
  requireActor,
  requireAdmin,
  requireParent,
  requireSuperAdmin,
  requireUser,
  tokenUser,
  verifyAppleToken,
  verifyGoogleToken,
  verifyOtp
} from "./auth.js";
import {
  asyncHandler,
  buildUpdate,
  i18n,
  isUuid,
  legacyError,
  legacyErrorMiddleware,
  localizeRecord,
  parseJsonBodyField,
  parseLimitOffset,
  randomAlphaNumericCode,
  randomCode,
  requestedLang,
  requireFields,
  sha256,
  slugify,
  toInteger
} from "./utils.js";

const clickEnv = [
  "CLICK_MERCHANT_ID",
  "CLICK_SERVICE_ID",
  "CLICK_SECRET_KEY"
];
const legacyTranscodeJobs = new Map();
const maxLogTailBytes = 1024 * 1024;
const latestTranscodingJobSelect = `
  tj.id AS transcode_job_id,
  tj.status AS transcode_job_status,
  tj.error AS transcode_error,
  tj.created_at AS transcode_job_created_at,
  tj.started_at AS transcode_job_started_at,
  tj.finished_at AS transcode_job_finished_at
`;
const latestTranscodingJobJoin = `
  LEFT JOIN LATERAL (
    SELECT id, status, error, created_at, started_at, finished_at
    FROM transcoding_jobs
    WHERE content_id = c.id
    ORDER BY created_at DESC
    LIMIT 1
  ) tj ON true
`;

function requireClickEnv() {
  const missing = clickEnv.filter((name) => !process.env[name]);

  if (!process.env.CLICK_BASE_URL && !process.env.CLICK_PAYMENT_URL) {
    missing.push("CLICK_PAYMENT_URL");
  }

  if (missing.length > 0) {
    throw legacyError(503, "click_unavailable", `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`);
  }
}

function legacyClickPaymentBaseUrl() {
  return process.env.CLICK_PAYMENT_URL || process.env.CLICK_BASE_URL;
}

function nowPlus(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

const childExtendMinutesEnv = "CHILD_EXTEND_MINUTES";
const defaultChildExtendMinutes = 5;

function positiveInteger(value, fallback) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function runtimeEnvValue(name) {
  const envPath = process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), ".env");

  try {
    const values = dotenv.parse(fs.readFileSync(envPath));

    return values[name];
  } catch {
    return process.env[name];
  }
}

function childExtendMinutes() {
  return positiveInteger(runtimeEnvValue(childExtendMinutesEnv), defaultChildExtendMinutes);
}

function requestPublicOrigin(request) {
  const forwardedProto = (request.get("x-forwarded-proto") || "").split(",")[0].trim();
  const forwardedHost = (request.get("x-forwarded-host") || "").split(",")[0].trim();
  const host = forwardedHost || request.get("host");
  const protocol = forwardedProto || (host?.endsWith("astir-animation.uz") ? "https" : request.protocol);

  return `${protocol}://${host}`;
}

async function qrPngBase64(payload) {
  const dataUrl = await QRCode.toDataURL(payload, {
    type: "image/png",
    width: 320,
    margin: 1
  });

  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

function normalizeI18n(value, fallback = "") {
  return i18n(parseJsonBodyField(value, value || fallback), fallback);
}

function createSlug(value, fallback) {
  return `${slugify(value, fallback)}-${Date.now().toString(36)}`;
}

function serializeContent(row) {
  const transcodeError = row.transcode_error || row.status_error || row.error_message || null;
  const transcodeStatus = row.transcode_status || row.transcode_job_status || row.status || "";

  return {
    id: row.id,
    title: row.title || {},
    description: row.description || {},
    slug: row.slug,
    category_id: row.category_id || "",
    series_id: row.series_id || "",
    poster_url: row.poster_url || "",
    source_path: row.source_path || "",
    status: row.status,
    transcode_status: transcodeStatus,
    transcode_error: transcodeError,
    status_error: transcodeError,
    error_message: transcodeError,
    transcoding_job: row.transcode_job_id
      ? {
        id: row.transcode_job_id,
        status: row.transcode_job_status || "",
        error: transcodeError,
        created_at: row.transcode_job_created_at || null,
        started_at: row.transcode_job_started_at || null,
        finished_at: row.transcode_job_finished_at || null
      }
      : null,
    age_rating: row.age_rating || 0,
    duration_sec: row.duration_sec || 0,
    season_number: row.season_number,
    episode_number: row.episode_number,
    year: row.year,
    published: row.published,
    published_at: row.published_at,
    views_count: row.views_count || 0,
    created_by_id: row.created_by_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function serializeSeries(row) {
  return {
    id: row.id,
    item_type: "series",
    target_type: "series",
    target_id: row.id,
    title: row.title || {},
    description: row.description || {},
    slug: row.slug,
    category_id: row.category_id || "",
    kind: row.kind || "seasons",
    poster_path: row.poster_path || "",
    poster_url: row.poster_path ? legacyPosterUrl("series", row.id) : row.poster_url || "",
    likes_count: 0,
    is_liked: false,
    active: row.active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function optionalLegacyActor(request) {
  if (!request.get("authorization")) {
    return null;
  }

  return authenticateRequest(request);
}

async function optionalLegacyUserId(request) {
  const actor = await optionalLegacyActor(request);

  return actor ? await ownerUserIdForActor(request.legacyDb, actor) : null;
}

async function targetLikeState(db, targetType, targetId, userId = null) {
  const likes = await db.one(
    "SELECT COUNT(*)::integer AS count FROM likes WHERE target_type = $1 AND target_id = $2",
    [targetType, targetId]
  );
  const liked = userId
    ? await db.one(
      "SELECT 1 FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
      [userId, targetType, targetId]
    )
    : null;

  return {
    likes_count: likes?.count || 0,
    is_liked: Boolean(liked)
  };
}

async function serializeSeriesWithLikes(db, row, userId = null) {
  return {
    ...serializeSeries(row),
    ...await targetLikeState(db, "series", row.id, userId)
  };
}

function legacyStatusForMovie(movie) {
  const status = movie.status || movie.transcode?.status || "";

  if (status === "ready" || status === "failed" || status === "uploaded") {
    return status;
  }

  if (status === "queued" || status === "transcoding") {
    return "transcoding";
  }

  return "uploaded";
}

function serializeMovieAsLegacyContent(movie, seriesId = null) {
  const transcodeError = movie.transcode?.error || null;
  const transcodeStatus = movie.transcode?.status || legacyStatusForMovie(movie);

  return {
    id: movie.id,
    title: movie.title || {},
    description: movie.description || {},
    slug: movie.slug || movie.id,
    category_id: movie.category_id || "",
    series_id: movie.series_id || seriesId || "",
    poster_url: movie.poster?.url || "",
    source_path: movie.source?.path || "",
    status: legacyStatusForMovie(movie),
    transcode_status: transcodeStatus,
    transcode_error: transcodeError,
    status_error: transcodeError,
    error_message: transcodeError,
    transcoding_job: null,
    age_rating: movie.age_rating || 0,
    duration_sec: movie.duration_sec || movie.duration || 0,
    season_number: movie.season_number,
    episode_number: movie.episode_number,
    year: movie.year,
    published: movie.published,
    published_at: movie.published_at,
    views_count: movie.views_count || 0,
    created_by_id: movie.created_by_id,
    created_at: movie.createdAt || movie.created_at,
    updated_at: movie.updatedAt || movie.updated_at
  };
}

function serializeMovieFavourite(movie, like, contentLikes) {
  const targetType = like.targetType || "content";
  const likesCount = contentLikes?.countByTarget
    ? contentLikes.countByTarget(movie.id, targetType)
    : 0;

  return {
    ...serializeMovieAsLegacyContent(movie),
    item_type: "movie",
    target_type: targetType,
    target_id: movie.id,
    content_id: movie.id,
    likes_count: likesCount,
    is_liked: true,
    liked_at: like.createdAt || like.created_at || null
  };
}

function compareEpisodeRows(left, right) {
  return (left.season_number ?? 0) - (right.season_number ?? 0)
    || (left.episode_number ?? 0) - (right.episode_number ?? 0)
    || String(left.created_at || "").localeCompare(String(right.created_at || ""));
}

function movieEpisodesForSeries(contentMovies, seriesId) {
  if (!contentMovies?.list || !contentMovies?.findById) {
    return [];
  }

  const episodes = [];
  const seen = new Set();
  const addMovie = (movie, fallbackSeriesId = seriesId) => {
    if (!movie || seen.has(movie.id)) {
      return;
    }

    seen.add(movie.id);
    episodes.push(serializeMovieAsLegacyContent(movie, fallbackSeriesId));
  };

  for (const movie of contentMovies.list()) {
    if (movie.series_id === seriesId) {
      addMovie(movie, seriesId);
    }
  }

  const parentMovie = contentMovies.findById(seriesId);

  for (const episodeId of parentMovie?.series || []) {
    addMovie(contentMovies.findById(episodeId), seriesId);
  }

  return episodes.sort(compareEpisodeRows);
}

function supportMessageBody(body = {}) {
  for (const field of ["body", "message", "text", "content"]) {
    const value = body[field];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function assertSupportMessagePayload(body, stored) {
  if (!body && !stored) {
    throw legacyError(400, "message is required");
  }
}

function boundedInteger(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseRequestedLogSources(value) {
  const requested = Array.isArray(value) ? value.join(",") : String(value || "all");

  return requested
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function safeLogFileSource(id, label, filePath) {
  return {
    id,
    label,
    path: filePath,
    exists: fs.existsSync(filePath)
  };
}

function availableLogSources() {
  const sources = [];
  const projectRoot = process.cwd();
  const logDir = path.resolve(projectRoot, process.env.LOG_DIR || "logs");

  if (fs.existsSync(logDir)) {
    for (const entry of fs.readdirSync(logDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".log")) {
        const id = `project:${entry.name}`;
        sources.push(safeLogFileSource(id, entry.name, path.join(logDir, entry.name)));
      }
    }
  }

  for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".log")) {
      const id = `root:${entry.name}`;
      sources.push(safeLogFileSource(id, entry.name, path.join(projectRoot, entry.name)));
    }
  }

  const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), ".pm2");
  const pm2LogsDir = path.join(pm2Home, "logs");
  const pm2AppName = process.env.PM2_APP_NAME || "astir";

  sources.push(
    safeLogFileSource("pm2:out", `${pm2AppName} stdout`, path.join(pm2LogsDir, `${pm2AppName}-out.log`)),
    safeLogFileSource("pm2:error", `${pm2AppName} stderr`, path.join(pm2LogsDir, `${pm2AppName}-error.log`))
  );

  return sources;
}

function readTailLines(filePath, limit) {
  const stats = fs.statSync(filePath);
  const start = Math.max(0, stats.size - maxLogTailBytes);
  const length = stats.size - start;
  const file = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(file, buffer, 0, length, start);
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);

    if (start > 0) {
      lines.shift();
    }

    return lines.filter((line) => line.trim() !== "").slice(-limit);
  } finally {
    fs.closeSync(file);
  }
}

function normalizeLogLine(source, line) {
  let parsed = null;

  if (line.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
  }

  const text = parsed ? JSON.stringify(parsed) : line;
  const lowered = text.toLowerCase();
  const level = parsed?.level
    || (source.id.includes("error") || lowered.includes("error") ? "error" : lowered.includes("warn") ? "warn" : "info");

  return {
    source: source.id,
    source_label: source.label,
    level,
    text: line,
    parsed
  };
}

function contentKind(row) {
  if (row.series_id) {
    return "content";
  }

  if (row.category_kind === "series") {
    return "series";
  }

  return "content";
}

function firstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return value || "";
}

function queryValues(value) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((entry) => String(entry || "").split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function firstBodyString(body, ...fields) {
  for (const field of fields) {
    const value = body?.[field];

    if (value !== undefined && value !== null && value !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function requestEmailValue(request) {
  return firstBodyString(request.body, "email")
    || firstBodyString(request.query, "email");
}

async function legacyEmailStatus(db, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw legacyError(400, "email is required", "email is required");
  }

  const user = await db.one(
    "SELECT id, role, active FROM users WHERE email = $1",
    [normalizedEmail]
  );

  return {
    email: normalizedEmail,
    emailExists: Boolean(user),
    user_exists: Boolean(user),
    can_register: !user,
    auth_flow: user ? "login" : "register",
    user_role: user?.role || "",
    active: user ? Boolean(user.active) : false
  };
}

async function insertRow(db, table, attributes) {
  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = entries.map((entry, index) => `$${index + 1}`);
  const result = await db.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values
  );

  return result.rows[0];
}

async function updateById(db, table, id, attributes) {
  const { sql, values } = buildUpdate(table, id, attributes);
  const result = await db.query(sql, values);

  if (!result.rows[0]) {
    throw legacyError(404, "not_found", "record not found");
  }

  return result.rows[0];
}

async function deleteById(db, table, id) {
  const result = await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);

  if (!result.rows[0]) {
    throw legacyError(404, "not_found", "record not found");
  }

  return result.rows[0];
}

async function getById(db, table, id) {
  const result = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);

  if (!result.rows[0]) {
    throw legacyError(404, "not_found", "record not found");
  }

  return result.rows[0];
}

async function findLegacyPlan(db, planId) {
  const normalizedPlanId = String(planId || "").trim();

  if (!normalizedPlanId) {
    return null;
  }

  if (isUuid(normalizedPlanId)) {
    const planById = await db.one("SELECT * FROM plans WHERE id = $1", [normalizedPlanId]);

    if (planById) {
      return planById;
    }
  }

  return await db.one(
    "SELECT * FROM plans WHERE lower(slug) = lower($1) OR lower(package_code) = lower($1) ORDER BY created_at DESC LIMIT 1",
    [normalizedPlanId]
  );
}

async function findTariff(tariffs, tariffId) {
  const normalizedTariffId = String(tariffId || "").trim();

  if (!normalizedTariffId || !tariffs?.findById) {
    return null;
  }

  return await tariffs.findById(normalizedTariffId);
}

async function ensureLegacyPlanForTariff(db, tariff) {
  const packageCode = tariff?.id || tariff?.code;

  if (!packageCode) {
    return null;
  }

  const existingPlan = await findLegacyPlan(db, packageCode);

  if (existingPlan) {
    return existingPlan;
  }

  const name = i18n(tariff.title || tariff.name || packageCode, packageCode);
  const description = i18n(tariff.description || tariff.title || packageCode, packageCode);

  return await insertRow(db, "plans", {
    name,
    description,
    slug: createSlug(name, "plan"),
    package_code: packageCode,
    price_cents: toInteger(tariff.price_cents, 0),
    currency: tariff.currency || "UZS",
    duration_days: 30,
    max_children: 1,
    active: true
  });
}

async function resolveAssignablePlan(db, tariffs, planId) {
  const existingPlan = await findLegacyPlan(db, planId);

  if (existingPlan) {
    return existingPlan;
  }

  const tariff = await findTariff(tariffs, planId);

  if (tariff) {
    return await ensureLegacyPlanForTariff(db, tariff);
  }

  throw legacyError(404, "plan_not_found", "plan not found");
}

async function resolveCommentTarget(db, contentId, contentMovies = null) {
  if (isUuid(contentId)) {
    const row = await db.one("SELECT id FROM content WHERE id = $1", [contentId]);

    if (row) {
      return {
        contentId: row.id,
        targetId: row.id,
        targetType: "content"
      };
    }
  }

  const movie = contentMovies?.findById?.(contentId);

  if (movie) {
    return {
      contentId: null,
      targetId: movie.id,
      targetType: "content"
    };
  }

  const seriesMovie = contentMovies?.list?.().find((item) => item.series_id === contentId);

  if (seriesMovie) {
    return {
      contentId: null,
      targetId: contentId,
      targetType: "content"
    };
  }

  if (isUuid(contentId)) {
    const series = await db.one("SELECT id FROM series WHERE id = $1", [contentId]);

    if (series) {
      return {
        contentId: null,
        targetId: series.id,
        targetType: "content"
      };
    }
  }

  throw legacyError(404, "content_not_found", "content not found");
}

function serializeComment(row) {
  const firstName = row.user_name || row.name || "";
  const lastName = row.user_last_name || row.last_name || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    ...row,
    content_id: row.content_id || row.target_id || null,
    user_full_name: fullName,
    full_name: fullName,
    avatar_url: row.user_avatar_url || row.avatar_url || "",
    author: {
      id: row.user_id,
      name: firstName,
      last_name: lastName,
      full_name: fullName,
      avatar_url: row.user_avatar_url || row.avatar_url || ""
    }
  };
}

function normalizeLikeTargetType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["content", "movie", "movies", "episode", "episodes"].includes(normalized)) {
    return "content";
  }

  if (normalized === "series") {
    return "series";
  }

  return "";
}

function requestedLikeTargetType(request) {
  const value = request.query.target_type
    || request.query.type
    || request.body?.target_type
    || request.body?.type;

  if (value === undefined || value === null || value === "") {
    return "";
  }

  const targetType = normalizeLikeTargetType(value);
  if (!targetType) {
    throw legacyError(400, "invalid_like_target_type", "type must be content or series");
  }

  return targetType;
}

async function resolveLikeTarget(db, id, targetType = "") {
  if (!isUuid(id)) {
    throw legacyError(404, "like_target_not_found", "content or series not found");
  }

  if (!targetType) {
    const content = await db.one("SELECT id FROM content WHERE id = $1", [id]);
    if (content) {
      return { type: "content", id: content.id, contentId: content.id };
    }

    const series = await db.one("SELECT id FROM series WHERE id = $1", [id]);
    if (series) {
      return { type: "series", id: series.id, contentId: null };
    }

    throw legacyError(404, "like_target_not_found", "content or series not found");
  }

  const row = await db.one(`SELECT id FROM ${targetType} WHERE id = $1`, [id]);
  if (!row) {
    throw legacyError(404, "like_target_not_found", `${targetType} not found`);
  }

  return {
    type: targetType,
    id: row.id,
    contentId: targetType === "content" ? row.id : null
  };
}

async function legacyBlacklistTarget(db, id) {
  if (!isUuid(id)) {
    throw legacyError(404, "content_not_found", "content or series not found");
  }

  const content = await db.one("SELECT id, series_id FROM content WHERE id = $1", [id]);

  if (content) {
    return {
      type: "content",
      id: content.id,
      seriesId: content.series_id || null,
      contentIds: [content.id]
    };
  }

  const series = await db.one("SELECT id FROM series WHERE id = $1", [id]);

  if (!series) {
    throw legacyError(404, "content_not_found", "content or series not found");
  }

  const rows = await db.many("SELECT id FROM content WHERE series_id = $1 ORDER BY season_number NULLS FIRST, episode_number NULLS FIRST, created_at", [series.id]);

  return {
    type: "series",
    id: series.id,
    seriesId: series.id,
    contentIds: rows.map((row) => row.id)
  };
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

function isLegacyAdminActor(actor) {
  return actor?.kind === "user" && ["admin", "super_admin"].includes(actor.user?.role);
}

async function appendLegacyContentVisibilityFilters(db, actor, filters, values, alias = "c") {
  if (!actor || isLegacyAdminActor(actor)) {
    return;
  }

  const userId = await ownerUserIdForActor(db, actor);

  if (userId) {
    values.push(userId);
    filters.push(`NOT EXISTS (
      SELECT 1
      FROM blocks b
      WHERE b.user_id = $${values.length}
        AND b.content_id = ${alias}.id
    )`);
  }

  const childId = legacyActorChildId(actor);

  if (childId) {
    values.push(childId);
    filters.push(`NOT EXISTS (
      SELECT 1
      FROM child_permissions p
      WHERE p.child_id = $${values.length}
        AND p.mode = 'deny'
        AND (
          p.content_id = ${alias}.id
          OR (p.series_id IS NOT NULL AND p.series_id = ${alias}.series_id)
          OR (p.category_id IS NOT NULL AND p.category_id = ${alias}.category_id)
        )
    )`);
  }
}

async function appendLegacySeriesVisibilityFilters(db, actor, filters, values, alias = "s") {
  if (!actor || isLegacyAdminActor(actor)) {
    return;
  }

  const childId = legacyActorChildId(actor);

  if (childId) {
    values.push(childId);
    filters.push(`NOT EXISTS (
      SELECT 1
      FROM child_permissions p
      WHERE p.child_id = $${values.length}
        AND p.mode = 'deny'
        AND (
          (p.category_id IS NOT NULL AND p.category_id = ${alias}.category_id)
          OR (p.series_id IS NOT NULL AND p.series_id = ${alias}.id)
        )
    )`);
  }
}

async function legacySeriesDeniedForActor(db, actor, seriesId) {
  if (!actor || isLegacyAdminActor(actor)) {
    return false;
  }

  const childId = legacyActorChildId(actor);

  if (!childId) {
    return false;
  }

  const denied = await db.one(
    `
      SELECT 1
      FROM child_permissions p
      JOIN series s ON s.id = $2
      WHERE p.child_id = $1
        AND p.mode = 'deny'
        AND (
          (p.series_id IS NOT NULL AND p.series_id = s.id)
          OR (p.category_id IS NOT NULL AND p.category_id = s.category_id)
        )
      LIMIT 1
    `,
    [childId, seriesId]
  );

  return Boolean(denied);
}

async function legacyLikedItems(db, userId) {
  const rows = await db.many(
    `
      SELECT
        l.target_type,
        l.target_id,
        l.created_at AS liked_at,
        to_jsonb(c) AS content_row,
        to_jsonb(s) AS series_row
      FROM likes l
      LEFT JOIN content c ON l.target_type = 'content' AND l.target_id = c.id
      LEFT JOIN series s ON l.target_type = 'series' AND l.target_id = s.id
      WHERE l.user_id = $1
        AND (c.id IS NOT NULL OR s.id IS NOT NULL)
      ORDER BY l.created_at DESC
    `,
    [userId]
  );

  return Promise.all(rows.map(async (row) => {
    const likeState = await targetLikeState(db, row.target_type, row.target_id, userId);

    if (row.target_type === "series") {
      return {
        ...serializeSeries(row.series_row),
        ...likeState,
        item_type: "series",
        target_type: row.target_type,
        target_id: row.target_id,
        liked_at: row.liked_at
      };
    }

    return {
      ...serializeContent(row.content_row),
      ...likeState,
      item_type: "content",
      target_type: row.target_type,
      target_id: row.target_id,
      liked_at: row.liked_at
    };
  }));
}

function storeMovieLikedItems({ contentLikes, contentMovies, seenTargets, userId }) {
  if (!contentLikes?.listByOwnerId || !contentMovies?.findById) {
    return [];
  }

  const items = [];

  for (const like of contentLikes.listByOwnerId(userId)) {
    const targetType = like.targetType || "content";
    const targetId = like.targetId || like.target_id;
    const key = `${targetType}:${targetId}`;

    if (seenTargets.has(key)) {
      continue;
    }

    const movie = targetType === "content" && targetId
      ? contentMovies.findById(targetId)
      : null;

    if (!movie) {
      continue;
    }

    seenTargets.add(key);
    items.push(serializeMovieFavourite(movie, like, contentLikes));
  }

  return items;
}

async function favouriteItems({ contentLikes, contentMovies, db, userId }) {
  const legacyItems = await legacyLikedItems(db, userId);
  const seenTargets = new Set(
    legacyItems.map((item) => `${item.target_type}:${item.target_id}`)
  );
  const movieItems = storeMovieLikedItems({
    contentLikes,
    contentMovies,
    seenTargets,
    userId
  });

  return [...legacyItems, ...movieItems].sort((left, right) => (
    String(right.liked_at || "").localeCompare(String(left.liked_at || ""))
  ));
}

async function activeSubscription(db, userId) {
  return db.one(
    `
      SELECT s.*, p.max_children
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1 AND s.status = 'active' AND (s.ends_at IS NULL OR s.ends_at > now())
      ORDER BY s.ends_at DESC NULLS FIRST
      LIMIT 1
    `,
    [userId]
  );
}

async function assertCanAccessContent(db, actor, contentId) {
  if (!isUuid(contentId)) {
    return;
  }

  if (isLegacyAdminActor(actor)) {
    return;
  }

  const content = await db.one("SELECT id FROM content WHERE id = $1", [contentId]);

  if (!content) {
    return;
  }

  const ownerId = await ownerUserIdForActor(db, actor);
  const blocked = ownerId
    ? await db.one("SELECT 1 FROM blocks WHERE user_id = $1 AND content_id = $2", [ownerId, contentId])
    : null;

  if (blocked) {
    throw legacyError(403, "content_blocked", "content is blocked");
  }

  const childId = legacyActorChildId(actor);

  if (childId && content) {
    const denied = await db.one(
      `
        SELECT 1
        FROM child_permissions p
        JOIN content c ON c.id = $2
        WHERE p.child_id = $1
          AND p.mode = 'deny'
          AND (
            p.content_id = c.id
            OR (p.series_id IS NOT NULL AND p.series_id = c.series_id)
            OR (p.category_id IS NOT NULL AND p.category_id = c.category_id)
          )
        LIMIT 1
      `,
      [childId, content.id]
    );

    if (denied) {
      throw legacyError(403, "content_blocked_for_child", "content is blocked for this child");
    }
  }
}

function legacyActorChildId(actor) {
  if (actor?.kind === "child_device" || actor?.kind === "tv_device") {
    return actor.child_id || null;
  }

  return null;
}

function legacyExternalContentDeniedForActor(childContentBlacklist, actor, contentId) {
  const childId = legacyActorChildId(actor);

  if (!childId || !contentId || !childContentBlacklist?.findByChildAndContent) {
    return false;
  }

  return Boolean(childContentBlacklist.findByChildAndContent(childId, contentId));
}

function legacyExternalVisibleRows(childContentBlacklist, actor, rows) {
  const childId = legacyActorChildId(actor);

  if (!childId || !childContentBlacklist?.findByChildAndContent) {
    return rows;
  }

  return rows.filter((row) => !childContentBlacklist.findByChildAndContent(childId, row.id));
}

function legacyPermissionApplies(permission, content) {
  if (permission.content_id && permission.content_id !== content.id) {
    return false;
  }

  if (permission.series_id && permission.series_id !== content.series_id) {
    return false;
  }

  if (permission.category_id && permission.category_id !== content.category_id) {
    return false;
  }

  return true;
}

function legacyMinutesNow() {
  const now = new Date();

  return now.getHours() * 60 + now.getMinutes();
}

function legacyWithinWindow(from, to, current = legacyMinutesNow()) {
  const start = from ?? 0;
  const end = to ?? 1439;

  if (start <= end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

function legacyWeekdayAllowed(mask) {
  if (mask === null || mask === undefined) {
    return true;
  }

  const dayBit = 1 << new Date().getDay();

  return (Number(mask) & dayBit) !== 0;
}

function legacyTimeOfDay(minutes, fallback) {
  if (!Number.isInteger(minutes)) {
    return fallback;
  }

  const bounded = Math.max(0, Math.min(minutes, 1439));
  const hours = String(Math.floor(bounded / 60)).padStart(2, "0");
  const mins = String(bounded % 60).padStart(2, "0");

  return `${hours}:${mins}`;
}

function legacyParseTimeOfDay(value, field, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value));

  if (!match) {
    throw legacyError(400, "invalid_time", `${field} must be HH:mm`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function legacyMaskToAllowedDays(mask) {
  if (mask === null || mask === undefined) {
    return [1, 2, 3, 4, 5, 6, 7];
  }

  const numericMask = Number(mask);
  const days = [];

  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const jsDay = day === 7 ? 0 : day;

    if ((numericMask & (1 << jsDay)) !== 0) {
      days.push(day);
    }
  }

  return days;
}

function legacyAllowedDaysToMask(value, fallbackMask = null) {
  if (value === undefined || value === null || value === "") {
    return fallbackMask;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw legacyError(400, "invalid_allowed_days", "allowedDays must be a non-empty array");
  }

  let mask = 0;

  for (const day of [...new Set(value)]) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw legacyError(400, "invalid_allowed_days", "allowedDays must contain numbers from 1 to 7");
    }

    mask |= 1 << (day === 7 ? 0 : day);
  }

  return mask;
}

function legacyLimitResponse(childId, permission = null) {
  const dailyMinutes = Number(permission?.daily_limit_minutes || 60);
  const from = permission?.watch_from_min ?? 8 * 60;
  const to = permission?.watch_until_min ?? 20 * 60;
  const allowedDays = legacyMaskToAllowedDays(permission?.weekday_mask);

  return {
    id: permission?.id || null,
    childId,
    child_id: childId,
    dailyMinutes,
    daily_minutes: dailyMinutes,
    allowedFrom: legacyTimeOfDay(from, "08:00"),
    allowed_from: legacyTimeOfDay(from, "08:00"),
    allowedTo: legacyTimeOfDay(to, "20:00"),
    allowed_to: legacyTimeOfDay(to, "20:00"),
    allowedDays,
    allowed_days: allowedDays,
    allowedDates: [],
    allowed_dates: []
  };
}

async function legacyUsedSecondsToday(db, childId) {
  const row = await db.one(
    `
      SELECT COALESCE(SUM(max_position), 0)::integer AS used_sec
      FROM (
        SELECT h.viewer_id, h.viewer_kind, h.content_id, MAX(h.position_sec)::integer AS max_position
        FROM watch_history h
        LEFT JOIN child_devices d ON h.viewer_kind = 'child_device' AND d.id = h.viewer_id
        LEFT JOIN tv_devices t ON h.viewer_kind = 'tv_device' AND t.id = h.viewer_id
        WHERE (
          (h.viewer_kind = 'child_device' AND d.child_id = $1)
          OR (h.viewer_kind = 'tv_device' AND t.current_child_id = $1)
        )
          AND h.watched_at >= date_trunc('day', now())
        GROUP BY h.viewer_id, h.viewer_kind, h.content_id
      ) usage
    `,
    [childId]
  );

  return Number(row?.used_sec || 0);
}

async function assertLegacyChildCanStream(db, actor, content) {
  const childId = legacyActorChildId(actor);

  if (!childId) {
    return;
  }

  const child = await db.one("SELECT * FROM children WHERE id = $1 AND active = true", [childId]);

  if (!child) {
    throw legacyError(403, "child_inactive", "child is inactive");
  }

  if (child.extended_until && new Date(child.extended_until).getTime() > Date.now()) {
    return;
  }

  const permissions = await db.many(
    "SELECT * FROM child_permissions WHERE child_id = $1 ORDER BY created_at",
    [childId]
  );
  const applicable = permissions.filter((permission) => legacyPermissionApplies(permission, content));

  if (applicable.some((permission) => permission.mode === "deny")) {
    throw legacyError(403, "content_blocked_for_child", "content is blocked for this child");
  }

  for (const permission of applicable) {
    if (!legacyWeekdayAllowed(permission.weekday_mask)) {
      throw legacyError(403, "watch_day_blocked", "watching is not allowed today");
    }

    if (
      (permission.watch_from_min !== null && permission.watch_from_min !== undefined)
      || (permission.watch_until_min !== null && permission.watch_until_min !== undefined)
    ) {
      if (!legacyWithinWindow(permission.watch_from_min, permission.watch_until_min)) {
        throw legacyError(403, "watch_time_blocked", "watching is outside the allowed time window");
      }
    }
  }

  const dailyLimits = applicable
    .map((permission) => Number(permission.daily_limit_minutes))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (dailyLimits.length === 0) {
    return;
  }

  const dailyLimitSeconds = Math.min(...dailyLimits) * 60;
  const usedSeconds = await legacyUsedSecondsToday(db, childId);

  if (usedSeconds >= dailyLimitSeconds) {
    throw legacyError(403, "watch_limit_reached", "daily watch limit reached");
  }
}

async function contentListItem(db, row, actor, lang) {
  const tags = await db.many(
    `
      SELECT t.*
      FROM tags t
      JOIN content_tags ct ON ct.tag_id = t.id
      WHERE ct.content_id = $1
      ORDER BY t.slug
    `,
    [row.id]
  );
  const rating = await db.one(
    "SELECT COALESCE(AVG(score), 0)::float AS avg_rating, COUNT(*)::integer AS rating_count FROM ratings WHERE content_id = $1",
    [row.id]
  );
  const likes = await db.one(
    "SELECT COUNT(*)::integer AS count FROM likes WHERE target_type = 'content' AND target_id = $1",
    [row.id]
  );
  const viewerUserId = actor ? await ownerUserIdForActor(db, actor) : null;
  const liked = viewerUserId
    ? await db.one(
      "SELECT 1 FROM likes WHERE user_id = $1 AND target_type = 'content' AND target_id = $2",
      [viewerUserId, row.id]
    )
    : null;

  return localizeRecord({
    ...serializeContent(row),
    item_type: contentKind(row),
    series_kind: row.series_kind || "seasons",
    season_count: row.season_count || 0,
    episode_count: row.episode_count || 0,
    tags,
    avg_rating: rating.avg_rating || 0,
    rating_count: rating.rating_count || 0,
    likes_count: likes.count || 0,
    is_liked: Boolean(liked)
  }, lang);
}

async function listLegacyContent(request, response) {
  const { limit, offset } = parseLimitOffset(request.query);
  const lang = requestedLang(request);
  const filters = [];
  const values = [];

  if (request.query.admin !== "true") {
    filters.push("c.published = true");
  }

  const category = firstQueryValue(request.query.category || request.query.category_id);
  if (category) {
    values.push(category);
    filters.push(`(
      c.category_id::text = $${values.length}
      OR lower(cat.slug) = lower($${values.length})
      OR lower(cat.name->>'en') = lower($${values.length})
      OR lower(cat.name->>'ru') = lower($${values.length})
      OR lower(cat.name->>'uz') = lower($${values.length})
    )`);
  }

  const search = firstQueryValue(request.query.q || request.query.search);
  if (search) {
    values.push(`%${search}%`);
    const patternParam = values.length;
    values.push(search);
    const searchParam = values.length;
    filters.push(`(
      c.title->>'en' ILIKE $${patternParam}
      OR c.title->>'ru' ILIKE $${patternParam}
      OR c.title->>'uz' ILIKE $${patternParam}
      OR c.description->>'en' ILIKE $${patternParam}
      OR c.description->>'ru' ILIKE $${patternParam}
      OR c.description->>'uz' ILIKE $${patternParam}
      OR s.title->>'en' ILIKE $${patternParam}
      OR s.title->>'ru' ILIKE $${patternParam}
      OR s.title->>'uz' ILIKE $${patternParam}
      OR similarity(COALESCE(c.title->>'en', ''), $${searchParam}) > 0.25
      OR similarity(COALESCE(c.title->>'ru', ''), $${searchParam}) > 0.25
      OR similarity(COALESCE(c.title->>'uz', ''), $${searchParam}) > 0.25
      OR similarity(COALESCE(s.title->>'en', ''), $${searchParam}) > 0.25
      OR similarity(COALESCE(s.title->>'ru', ''), $${searchParam}) > 0.25
      OR similarity(COALESCE(s.title->>'uz', ''), $${searchParam}) > 0.25
    )`);
  }

  if (request.query.min_age) {
    values.push(Number(request.query.min_age));
    filters.push(`c.age_rating >= $${values.length}`);
  }

  if (request.query.max_age) {
    values.push(Number(request.query.max_age));
    filters.push(`c.age_rating <= $${values.length}`);
  }

  if (request.query.kind && request.query.kind !== "series") {
    values.push(request.query.kind);
    filters.push(`cat.kind = $${values.length}`);
  }

  if (request.query.admin !== "true" && request.query.kind !== "series") {
    filters.push("c.series_id IS NULL");
  }

  const tags = queryValues(request.query.tags || request.query.tag_ids);
  if (tags.length > 0) {
    for (const tag of tags) {
      values.push(tag.toLowerCase());
      filters.push(`EXISTS (
        SELECT 1
        FROM content_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.content_id = c.id
          AND (
            lower(ct.tag_id::text) = $${values.length}
            OR lower(t.slug) = $${values.length}
            OR lower(t.name->>'en') = $${values.length}
            OR lower(t.name->>'ru') = $${values.length}
            OR lower(t.name->>'uz') = $${values.length}
          )
      )`);
    }
  }

  if (request.query.liked === "true") {
    const userId = await ownerUserIdForActor(request.legacyDb, request.legacyActor);
    values.push(userId);
    filters.push(`EXISTS (SELECT 1 FROM likes l WHERE l.target_type = 'content' AND l.target_id = c.id AND l.user_id = $${values.length})`);
  }

  await appendLegacyContentVisibilityFilters(request.legacyDb, request.legacyActor, filters, values, "c");

  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const total = await request.legacyDb.one(
    `
      SELECT COUNT(*)::integer AS count
      FROM content c
      LEFT JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN series s ON s.id = c.series_id
      ${where}
    `,
    values
  );
  values.push(limit, offset);
  const rows = await request.legacyDb.many(
    `
      SELECT c.*, cat.kind AS category_kind, s.kind AS series_kind,
        (SELECT COUNT(DISTINCT season_number)::integer FROM content ce WHERE ce.series_id = c.series_id) AS season_count,
        (SELECT COUNT(*)::integer FROM content ce WHERE ce.series_id = c.series_id) AS episode_count,
        ${latestTranscodingJobSelect}
      FROM content c
      LEFT JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN series s ON s.id = c.series_id
      ${latestTranscodingJobJoin}
      ${where}
      ORDER BY c.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  let data = await Promise.all(rows.map((row) => contentListItem(request.legacyDb, row, request.legacyActor, lang)));

  if (request.query.kind === "series") {
    data = data.filter((item) => item.series_id || item.item_type === "series");
  }

  response.json({ data, total: total.count, limit, offset });
}

async function saveMediaAsset(db, media, ownerTable, ownerId) {
  if (!media) {
    return null;
  }

  return insertRow(db, "media_assets", {
    owner_table: ownerTable,
    owner_id: ownerId,
    kind: media.kind,
    path: media.path,
    original_name: media.original_name,
    mime_type: media.mime_type,
    size: media.size
  });
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

function legacyPosterUrl(ownerTable, ownerId) {
  const routeByTable = {
    categories: "categories",
    content: "content",
    series: "series"
  };
  const route = routeByTable[ownerTable];

  return route ? `/api/v1/${route}/${encodeURIComponent(String(ownerId))}/poster` : "";
}

function removeStoredMedia(media, storedPaths) {
  for (const storedPath of uniquePaths(storedPaths)) {
    try {
      media.remove(storedPath);
    } catch (error) {
      console.warn(JSON.stringify({
        event: "legacy_media.remove_failed",
        path: storedPath,
        error: error.message
      }));
    }
  }
}

async function mediaAssetPaths(db, ownerTable, ownerId, kind = null) {
  const rows = kind
    ? await db.many(
      "SELECT path FROM media_assets WHERE owner_table = $1 AND owner_id = $2 AND kind = $3",
      [ownerTable, ownerId, kind]
    )
    : await db.many(
      "SELECT path FROM media_assets WHERE owner_table = $1 AND owner_id = $2",
      [ownerTable, ownerId]
    );

  return rows.map((row) => row.path);
}

async function deleteOwnerMediaAssets(db, ownerTable, ownerId, paths = []) {
  if (paths.length > 0) {
    await db.query(
      "DELETE FROM media_assets WHERE owner_table = $1 AND owner_id = $2 AND path = ANY($3::text[])",
      [ownerTable, ownerId, uniquePaths(paths)]
    );
    return;
  }

  await db.query(
    "DELETE FROM media_assets WHERE owner_table = $1 AND owner_id = $2",
    [ownerTable, ownerId]
  );
}

async function deleteLegacyRecordWithMedia(db, media, table, id, mediaColumns = [], extraStoredPaths = []) {
  const deletion = await db.transaction(async (client) => {
    const recordResult = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    const record = recordResult.rows[0];

    if (!record) {
      throw legacyError(404, "not_found", "record not found");
    }

    const assetResult = await client.query(
      "SELECT path FROM media_assets WHERE owner_table = $1 AND owner_id = $2",
      [table, id]
    );

    await client.query(
      "DELETE FROM media_assets WHERE owner_table = $1 AND owner_id = $2",
      [table, id]
    );

    const deleteResult = await client.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);

    return {
      record: deleteResult.rows[0],
      paths: [
        ...mediaColumns.map((column) => record[column]),
        ...assetResult.rows.map((row) => row.path),
        ...extraStoredPaths
      ]
    };
  });

  removeStoredMedia(media, deletion.paths);

  return deletion.record;
}

function cancelLegacyTranscode(contentId) {
  const job = legacyTranscodeJobs.get(contentId);

  if (!job) {
    return;
  }

  job.cancelled = true;

  if (job.process) {
    job.process.kill("SIGTERM");
  }

  legacyTranscodeJobs.delete(contentId);
}

function tokenUserWithAvatar(request, media, user) {
  const serialized = tokenUser(user);

  if (!serialized) {
    return serialized;
  }

  return {
    ...serialized,
    avatar_url: user.avatar_path ? media.publicUrl(request, user.avatar_path) : serialized.avatar_url
  };
}

function runLegacyFfmpeg(ffmpegPath, args, job) {
  return new Promise((resolve, reject) => {
    let childProcess;

    try {
      childProcess = spawn(ffmpegPath || "ffmpeg", args, { stdio: "ignore" });
    } catch (error) {
      reject(error);
      return;
    }

    if (job) {
      job.process = childProcess;

      if (job.cancelled) {
        childProcess.kill("SIGTERM");
      }
    }

    let settled = false;

    childProcess.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (job?.process === childProcess) {
        job.process = null;
      }
      reject(error);
    });

    childProcess.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      if (job?.process === childProcess) {
        job.process = null;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function legacyTranscodeArgs(sourcePath, rendition) {
  return [
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    `scale=-2:${rendition.height}`,
    "-c:v",
    "h264",
    "-b:v",
    String(rendition.videoBitrate),
    "-maxrate",
    String(rendition.maxrate),
    "-bufsize",
    String(rendition.bufsize),
    "-c:a",
    "aac",
    "-b:a",
    String(rendition.audioBitrate),
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    path.join(path.dirname(rendition.playlistPath), "segment_%03d.ts"),
    rendition.playlistPath
  ];
}

async function maybeStartTranscode(db, config, content) {
  if (!content.source_path) {
    return null;
  }

  cancelLegacyTranscode(content.id);

  const job = await insertRow(db, "transcoding_jobs", {
    content_id: content.id,
    status: "queued"
  });

  if (String(process.env.TRANSCODER_ENABLED || config.transcoderEnabled) === "false") {
    return updateById(db, "transcoding_jobs", job.id, {
      status: "failed",
      error: "transcoder disabled"
    });
  }

  const sourcePath = path.resolve(config.mediaRoot, "legacy", content.source_path);
  const outDir = path.resolve(config.mediaRoot, "legacy", "hls", content.id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const playlistPath = path.join(outDir, "master.m3u8");
  const legacyRoot = path.resolve(config.mediaRoot, "legacy");
  const renditions = hlsRenditionProfiles.map((profile) => {
    const playlistPathForProfile = path.join(outDir, profile.directory, "index.m3u8");
    const playlistRel = path.relative(legacyRoot, playlistPathForProfile).replaceAll(path.sep, "/");

    return {
      ...profile,
      playlistPath: playlistPathForProfile,
      playlistPathRel: playlistRel,
      playlistUrl: `/api/v1/media/${playlistRel}`,
      playlistFile: `${profile.directory}/index.m3u8`
    };
  });

  await updateById(db, "content", content.id, { status: "transcoding" });
  await updateById(db, "transcoding_jobs", job.id, { status: "running", started_at: new Date().toISOString() });
  await db.query("DELETE FROM renditions WHERE content_id = $1", [content.id]).catch(() => { });

  const runtimeJob = {
    cancelled: false,
    process: null
  };
  legacyTranscodeJobs.set(content.id, runtimeJob);

  (async () => {
    try {
      for (const rendition of renditions) {
        if (runtimeJob.cancelled) {
          return;
        }

        fs.mkdirSync(path.dirname(rendition.playlistPath), { recursive: true });
        await runLegacyFfmpeg(config.ffmpegPath, legacyTranscodeArgs(sourcePath, rendition), runtimeJob);
      }

      if (runtimeJob.cancelled) {
        return;
      }

      fs.writeFileSync(playlistPath, buildHlsMasterPlaylist(renditions));
      await updateById(db, "content", content.id, { status: "ready" }).catch(() => { });

      for (const rendition of renditions) {
        await insertRow(db, "renditions", {
          content_id: content.id,
          label: rendition.label,
          width: rendition.width,
          height: rendition.height,
          bitrate: rendition.videoBitrate,
          playlist_path: rendition.playlistPathRel,
          playlist_url: rendition.playlistUrl
        }).catch(() => { });
      }

      await updateById(db, "transcoding_jobs", job.id, {
        status: "ready",
        finished_at: new Date().toISOString()
      }).catch(() => { });
      return;
    } catch (error) {
      if (runtimeJob.cancelled) {
        return;
      }

      await updateById(db, "content", content.id, { status: "failed" }).catch(() => { });
      await updateById(db, "transcoding_jobs", job.id, {
        status: "failed",
        error: error.message,
        finished_at: new Date().toISOString()
      }).catch(() => { });
    } finally {
      if (legacyTranscodeJobs.get(content.id) === runtimeJob) {
        legacyTranscodeJobs.delete(content.id);
      }
    }
  })();

  return job;
}

export function createLegacyRoutes({
  childContentBlacklist = null,
  config,
  contentCategories = null,
  contentLikes = null,
  contentMovies = null,
  media,
  streaming = null,
  tariffs = null
}) {
  const router = Router();
  const avatarUpload = media.upload("avatars", { maxMb: 10 }).single("file");
  const posterUpload = media.upload("posters", { maxMb: 20 }).single("file");
  const videoUpload = media.upload("videos", { maxMb: config.maxVideoUploadMb || 2048 }).single("file");
  const supportUpload = media.upload("support", { maxMb: 50 }).single("file");

  function localizedContentCategoryValue(value, lang) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return String(value[lang] || value.ru || value.uz || value.en || Object.values(value)[0] || "");
    }

    return String(value || "");
  }

  function contentCategoryTitle(category) {
    return category?.title || category?.name || category?.label || category?.slug || category?.id || "";
  }

  function contentCategoryDescription(category) {
    return category?.description || "";
  }

  function legacyCategoryKind(category) {
    const value = String(category?.kind || category?.type || "other").trim().toLowerCase();

    if (["film", "series", "cartoon", "other"].includes(value)) {
      return value;
    }

    if (["movie", "movies"].includes(value)) {
      return "film";
    }

    return "other";
  }

  function contentCategorySlug(category) {
    return String(category?.slug || slugify(contentCategoryTitle(category), "category")).trim();
  }

  function contentCategoryAsLegacyResponse(category, lang) {
    const title = contentCategoryTitle(category);

    return {
      id: category.id,
      name: localizedContentCategoryValue(title, lang),
      title: localizedContentCategoryValue(title, lang),
      description: localizedContentCategoryValue(contentCategoryDescription(category), lang),
      kind: legacyCategoryKind(category),
      slug: contentCategorySlug(category),
      active: category.active !== false,
      source: "content"
    };
  }

  async function findLegacyCategoryForContentCategory(db, category) {
    if (isUuid(category?.id)) {
      const byId = await db.one("SELECT * FROM categories WHERE id = $1", [category.id]);

      if (byId) {
        return byId;
      }
    }

    const slug = contentCategorySlug(category);

    if (!slug) {
      return null;
    }

    return await db.one("SELECT * FROM categories WHERE lower(slug) = lower($1) ORDER BY created_at DESC LIMIT 1", [slug]);
  }

  async function ensureLegacyCategoryForContentCategory(db, category) {
    const existing = await findLegacyCategoryForContentCategory(db, category);

    if (existing) {
      return existing;
    }

    const title = contentCategoryTitle(category);
    const slug = contentCategorySlug(category);

    try {
      return await insertRow(db, "categories", {
        id: isUuid(category?.id) ? category.id : undefined,
        name: normalizeI18n(title),
        description: normalizeI18n(contentCategoryDescription(category), ""),
        kind: legacyCategoryKind(category),
        slug,
        active: category.active !== false
      });
    } catch (error) {
      if (error?.code !== "23505") {
        throw error;
      }

      const fallback = await findLegacyCategoryForContentCategory(db, category);

      if (fallback) {
        return fallback;
      }

      throw error;
    }
  }

  async function resolveLegacySeriesCategoryId(db, value) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null || value === "") {
      return null;
    }

    const categoryId = String(value);

    if (isUuid(categoryId)) {
      const legacyCategory = await db.one("SELECT * FROM categories WHERE id = $1", [categoryId]);

      if (legacyCategory) {
        return legacyCategory.id;
      }
    }

    const contentCategory = contentCategories?.findById?.(categoryId);

    if (!contentCategory) {
      return categoryId;
    }

    const legacyCategory = await ensureLegacyCategoryForContentCategory(db, contentCategory);

    return legacyCategory.id;
  }

  const checkEmailHandler = asyncHandler(async (request, response) => {
    response.json(await legacyEmailStatus(request.legacyDb, requestEmailValue(request)));
  });

  router.get("/auth/email/check", checkEmailHandler);
  router.post("/auth/email/check", checkEmailHandler);
  router.get("/auth/check-email", checkEmailHandler);
  router.post("/auth/check-email", checkEmailHandler);

  router.post("/auth/otp/request", asyncHandler(async (request, response) => {
    requireFields(request.body, ["email"]);
    const status = await legacyEmailStatus(request.legacyDb, request.body.email);
    const otp = await createOtp(request.legacyDb, status.email, "login");

    response.json({
      ...otp,
      ...status,
      otp_sent: true
    });
  }));

  router.post("/auth/forgot-password", asyncHandler(async (request, response) => {
    requireFields(request.body, ["email"]);
    const email = request.body.email.toLowerCase();
    const user = await request.legacyDb.one("SELECT id FROM users WHERE email = $1 AND active = true", [email]);

    if (!user) {
      throw legacyError(404, "not found", "not found");
    }

    response.json(await createOtp(request.legacyDb, email, "reset_password"));
  }));

  router.post("/auth/otp/verify", asyncHandler(async (request, response) => {
    requireFields(request.body, ["email", "code"]);
    await verifyOtp(request.legacyDb, request.body.email, request.body.code);
    const status = await legacyEmailStatus(request.legacyDb, request.body.email);
    const user = await request.legacyDb.one("SELECT * FROM users WHERE email = $1", [status.email]);

    if (!user) {
      response.json({
        ...status,
        user_exists: false,
        access_token: "",
        refresh_token: "",
        access_expires_at: "",
        refresh_expires_at: "",
        user: null
      });
      return;
    }

    response.json({
      ...(await issueTokenPair(request.legacyDb, user)),
      email: user.email,
      ...status,
      user_exists: true
    });
  }));

  router.post("/auth/otp/login", asyncHandler(async (request, response) => {
    requireFields(request.body, ["email", "password"]);
    const user = await request.legacyDb.one(
      "SELECT * FROM users WHERE email = $1 AND active = true AND role = 'parent'",
      [request.body.email.toLowerCase()]
    );

    if (!user || !verifySecret(request.body.password, user.password_hash)) {
      throw legacyError(401, "invalid credentials", "invalid credentials");
    }

    await request.legacyDb.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    response.json(await issueTokenPair(request.legacyDb, user));
  }));

  router.post("/auth/register", asyncHandler(async (request, response) => {
    requireFields(request.body, ["email", "name", "password", "pin"]);

    if (!/^\d{4}$/.test(String(request.body.pin || ""))) {
      throw legacyError(400, "invalid_pin", "PIN must be a 4-digit code");
    }

    const existing = await request.legacyDb.one("SELECT id FROM users WHERE email = $1", [request.body.email.toLowerCase()]);

    if (existing) {
      throw legacyError(409, "email already exists", "email already exists");
    }

    const verified = await request.legacyDb.one(
      "SELECT id FROM otp_codes WHERE email = $1 AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1",
      [request.body.email.toLowerCase()]
    );

    if (!verified) {
      throw legacyError(401, "invalid credentials", "invalid credentials");
    }

    const user = await insertRow(request.legacyDb, "users", {
      email: request.body.email.toLowerCase(),
      name: request.body.name,
      last_name: request.body.last_name || "",
      password_hash: hashSecret(request.body.password),
      pin_hash: hashSecret(request.body.pin),
      role: "parent",
      last_login_at: new Date().toISOString()
    });

    response.status(201).json(await issueTokenPair(request.legacyDb, user));
  }));

  router.post("/auth/reset-password", asyncHandler(async (request, response) => {
    requireFields(request.body, ["email", "password"]);
    const email = request.body.email.toLowerCase();
    const verified = await request.legacyDb.one(
      `
        SELECT id FROM otp_codes
        WHERE email = $1
          AND purpose = 'reset_password'
          AND verified_at IS NOT NULL
          AND expires_at > now()
        ORDER BY verified_at DESC
        LIMIT 1
      `,
      [email]
    );

    if (!verified) {
      throw legacyError(401, "invalid credentials", "invalid credentials");
    }

    const user = await request.legacyDb.one(
      "UPDATE users SET password_hash = $2 WHERE email = $1 AND active = true RETURNING id",
      [email, hashSecret(request.body.password)]
    );

    if (!user) {
      throw legacyError(401, "invalid credentials", "invalid credentials");
    }

    await request.legacyDb.query("DELETE FROM otp_codes WHERE id = $1", [verified.id]);
    response.json({ message: "ok" });
  }));

  router.post("/auth/login", asyncHandler(async (request, response) => {
    requireFields(request.body, ["email", "password"]);
    const user = await request.legacyDb.one(
      "SELECT * FROM users WHERE email = $1 AND active = true AND role IN ('parent', 'admin', 'super_admin')",
      [request.body.email.toLowerCase()]
    );

    if (!user || !verifySecret(request.body.password, user.password_hash)) {
      throw legacyError(401, "invalid credentials", "invalid credentials");
    }

    await request.legacyDb.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    response.json(await issueTokenPair(request.legacyDb, user));
  }));

  const changeLegacyPinHandler = asyncHandler(async (request, response) => {
    const currentPin = request.body.current_pin || request.body.currentPin || request.body.old_pin || request.body.oldPin;
    const newPin = request.body.new_pin || request.body.newPin || request.body.pin;

    if (request.legacyUser.role !== "parent") {
      throw legacyError(403, "forbidden", "parent role is required");
    }

    if (!/^\d{4}$/.test(String(currentPin || "")) || !/^\d{4}$/.test(String(newPin || ""))) {
      throw legacyError(400, "invalid_pin", "PIN must be a 4-digit code");
    }

    if (!request.legacyUser.pin_hash || !verifySecret(currentPin, request.legacyUser.pin_hash)) {
      throw legacyError(401, "invalid_pin", "invalid PIN");
    }

    await request.legacyDb.query(
      "UPDATE users SET pin_hash = $1 WHERE id = $2",
      [hashSecret(newPin), request.legacyUser.id]
    );

    response.json({ changed: true });
  });


  router.patch("/auth/pin", requireUser, changeLegacyPinHandler);
  router.put("/auth/pin", requireUser, changeLegacyPinHandler);

  router.post("/auth/google", asyncHandler(async (request, response) => {
    const token = request.body.id_token || request.body.idToken;
    if (!token) {
      throw legacyError(400, "id_token is required");
    }
    const profile = await verifyGoogleToken(token, request.body);
    const user = await findOrCreateOAuthUser(request.legacyDb, profile);
    response.json(await issueTokenPair(request.legacyDb, user));
  }));

  router.post("/auth/apple", asyncHandler(async (request, response) => {
    const token = request.body.identity_token
      || request.body.identityToken
      || request.body.id_token
      || request.body.idToken;
    if (!token) {
      throw legacyError(400, "identity_token is required");
    }
    const profile = await verifyAppleToken(token, request.body);
    const user = await findOrCreateOAuthUser(request.legacyDb, profile);
    response.json(await issueTokenPair(request.legacyDb, user));
  }));

  router.post("/auth/refresh", asyncHandler(async (request, response) => {
    requireFields(request.body, ["refresh_token"]);
    response.json(await refreshTokenPair(request.legacyDb, request.body.refresh_token));
  }));

  router.post("/auth/logout", asyncHandler(async (request, response) => {
    const refreshToken = request.body.refresh_token;
    if (refreshToken) {
      await request.legacyDb.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [sha256(refreshToken)]);
    }
    response.json({ message: "ok" });
  }));

  router.get("/auth/me", requireUser, asyncHandler(async (request, response) => {
    response.json(tokenUserWithAvatar(request, media, request.legacyUser));
  }));

  router.put("/auth/me", requireUser, asyncHandler(async (request, response) => {
    const user = await updateById(request.legacyDb, "users", request.legacyUser.id, {
      name: request.body.name,
      last_name: request.body.last_name,
      phone: request.body.phone
    });
    response.json(tokenUserWithAvatar(request, media, user));
  }));

  router.post("/auth/me/avatar", requireUser, avatarUpload, asyncHandler(async (request, response) => {
    const stored = media.persistFile("avatar", request.file, request);
    if (!stored) {
      throw legacyError(400, "file is required");
    }
    await saveMediaAsset(request.legacyDb, stored, "users", request.legacyUser.id);
    const user = await updateById(request.legacyDb, "users", request.legacyUser.id, {
      avatar_path: stored.path,
      avatar_url: stored.url
    });
    response.json(tokenUserWithAvatar(request, media, user));
  }));

  router.get("/users", requireSuperAdmin, asyncHandler(async (request, response) => {
    const { limit, offset } = parseLimitOffset(request.query);
    const total = await request.legacyDb.one("SELECT COUNT(*)::integer AS count FROM users");
    const users = await request.legacyDb.many("SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
    response.json({ data: users.map(tokenUser), total: total.count, limit, offset });
  }));

  router.post("/users", requireSuperAdmin, asyncHandler(async (request, response) => {
    requireFields(request.body, ["email", "name", "password", "role"]);
    if (!["admin", "super_admin"].includes(request.body.role)) {
      throw legacyError(400, "invalid_role", "role must be admin or super_admin");
    }
    const user = await insertRow(request.legacyDb, "users", {
      email: request.body.email.toLowerCase(),
      name: request.body.name,
      last_name: request.body.last_name || "",
      password_hash: hashSecret(request.body.password),
      role: request.body.role
    });
    response.status(201).json(tokenUser(user));
  }));

  router.get("/users/:id", requireSuperAdmin, asyncHandler(async (request, response) => {
    response.json(tokenUser(await getById(request.legacyDb, "users", request.params.id)));
  }));

  router.put("/users/:id", requireSuperAdmin, asyncHandler(async (request, response) => {
    const attrs = {
      email: request.body.email?.toLowerCase(),
      name: request.body.name,
      last_name: request.body.last_name,
      phone: request.body.phone,
      role: request.body.role,
      active: request.body.active
    };
    if (request.body.password) {
      attrs.password_hash = hashSecret(request.body.password);
    }
    response.json(tokenUser(await updateById(request.legacyDb, "users", request.params.id, attrs)));
  }));

  router.delete("/users/:id", requireSuperAdmin, asyncHandler(async (request, response) => {
    await deleteById(request.legacyDb, "users", request.params.id);
    response.json(messageResponse("deleted"));
  }));

  router.patch("/users/:id/active", requireSuperAdmin, asyncHandler(async (request, response) => {
    response.json(tokenUser(await updateById(request.legacyDb, "users", request.params.id, {
      active: Boolean(request.body.active)
    })));
  }));

  router.post("/users/:id/plan", requireSuperAdmin, asyncHandler(async (request, response) => {
    const planId = firstBodyString(request.body, "plan_id", "planId", "tariff_id", "tariffId");

    if (!planId) {
      throw legacyError(400, "plan_id is required");
    }

    if (!isUuid(request.params.id)) {
      throw legacyError(404, "user_not_found", "user not found");
    }

    const user = await request.legacyDb.one(
      "SELECT * FROM users WHERE id = $1",
      [request.params.id]
    );

    if (!user) {
      throw legacyError(404, "user_not_found", "user not found");
    }

    const plan = await resolveAssignablePlan(request.legacyDb, tariffs, planId);
    const startsAt = new Date().toISOString();
    const durationDays = toInteger(request.body.duration_days ?? request.body.durationDays, plan.duration_days || 30);
    const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    await request.legacyDb.query(
      "UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE user_id = $1 AND status IN ('active', 'pending')",
      [request.params.id]
    );
    const subscription = await insertRow(request.legacyDb, "subscriptions", {
      user_id: request.params.id,
      plan_id: plan.id,
      status: "active",
      starts_at: startsAt,
      ends_at: endsAt,
      auto_renew: Boolean(request.body.auto_renew ?? true)
    });
    response.status(201).json(subscription);
  }));

  router.get("/users/:id/subscriptions", requireSuperAdmin, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC", [request.params.id]));
  }));

  router.get("/users/:id/children", requireAdmin, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM children WHERE parent_id = $1 ORDER BY created_at DESC", [request.params.id]));
  }));

  router.delete("/users/:user_id/children/:child_id", requireAdmin, asyncHandler(async (request, response) => {
    await request.legacyDb.query("DELETE FROM children WHERE id = $1 AND parent_id = $2", [request.params.child_id, request.params.user_id]);
    response.json(messageResponse("deleted"));
  }));

  router.patch("/users/:user_id/children/:child_id/active", requireAdmin, asyncHandler(async (request, response) => {
    const result = await request.legacyDb.one(
      "UPDATE children SET active = $1 WHERE id = $2 AND parent_id = $3 RETURNING *",
      [Boolean(request.body.active), request.params.child_id, request.params.user_id]
    );
    if (!result) {
      throw legacyError(404, "child_not_found", "child not found");
    }
    response.json(result);
  }));

  router.get("/children", requireParent, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM children WHERE parent_id = $1 ORDER BY created_at DESC", [request.legacyUser.id]));
  }));

  router.post("/children", requireParent, asyncHandler(async (request, response) => {
    requireFields(request.body, ["name"]);
    const child = await insertRow(request.legacyDb, "children", {
      parent_id: request.legacyUser.id,
      name: request.body.name,
      age: toInteger(request.body.age, 0),
      avatar_url: request.body.avatar_url || "",
      active: request.body.active !== false
    });
    response.status(201).json(child);
  }));

  router.put("/children/:id", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one(
      "UPDATE children SET name = COALESCE($1, name), age = COALESCE($2, age), avatar_url = COALESCE($3, avatar_url), active = COALESCE($4, active) WHERE id = $5 AND parent_id = $6 RETURNING *",
      [request.body.name, toInteger(request.body.age, null), request.body.avatar_url, request.body.active, request.params.id, request.legacyUser.id]
    );
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }
    response.json(child);
  }));

  router.delete("/children/:id", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const result = await request.legacyDb.one(
      "DELETE FROM children WHERE id = $1 AND parent_id = $2 RETURNING *",
      [request.params.id, request.legacyUser.id]
    );
    if (!result) {
      throw legacyError(404, "child_not_found", "child not found");
    }
    response.json({ message: "ok" });
  }));

  router.put("/children/:id/pin", requireParent, asyncHandler(async (request, response) => {
    requireFields(request.body, ["pin"]);
    const child = await request.legacyDb.one(
      "UPDATE children SET pin_hash = $1 WHERE id = $2 AND parent_id = $3 RETURNING *",
      [hashSecret(request.body.pin), request.params.id, request.legacyUser.id]
    );
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }
    response.json(child);
  }));

  router.get("/children/:id/limits", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [
      request.params.id,
      request.legacyUser.id
    ]);

    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    const permission = await request.legacyDb.one(
      `
        SELECT *
        FROM child_permissions
        WHERE child_id = $1
          AND mode = 'allow'
          AND content_id IS NULL
          AND category_id IS NULL
          AND series_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [child.id]
    );

    response.json({ limit: legacyLimitResponse(child.id, permission) });
  }));

  router.put("/children/:id/limits", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [
      request.params.id,
      request.legacyUser.id
    ]);

    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    const existing = await request.legacyDb.one(
      `
        SELECT *
        FROM child_permissions
        WHERE child_id = $1
          AND mode = 'allow'
          AND content_id IS NULL
          AND category_id IS NULL
          AND series_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [child.id]
    );
    const body = request.body || {};
    const dailyMinutes = toInteger(body.dailyMinutes ?? body.daily_minutes, existing?.daily_limit_minutes || 60);
    const watchFromMin = legacyParseTimeOfDay(
      body.allowedFrom ?? body.allowed_from,
      "allowedFrom",
      existing?.watch_from_min ?? 8 * 60
    );
    const watchUntilMin = legacyParseTimeOfDay(
      body.allowedTo ?? body.allowed_to,
      "allowedTo",
      existing?.watch_until_min ?? 20 * 60
    );
    const weekdayMask = legacyAllowedDaysToMask(
      body.allowedDays ?? body.allowed_days,
      existing?.weekday_mask ?? legacyAllowedDaysToMask([1, 2, 3, 4, 5, 6, 7])
    );

    if (dailyMinutes < 1 || dailyMinutes > 1440) {
      throw legacyError(400, "invalid_daily_limit", "dailyMinutes must be between 1 and 1440");
    }

    const permission = existing
      ? await request.legacyDb.one(
        `
          UPDATE child_permissions
          SET daily_limit_minutes = $1,
              watch_from_min = $2,
              watch_until_min = $3,
              weekday_mask = $4
          WHERE id = $5
          RETURNING *
        `,
        [dailyMinutes, watchFromMin, watchUntilMin, weekdayMask, existing.id]
      )
      : await insertRow(request.legacyDb, "child_permissions", {
        child_id: child.id,
        mode: "allow",
        category_id: null,
        content_id: null,
        watch_from_min: watchFromMin,
        watch_until_min: watchUntilMin,
        weekday_mask: weekdayMask,
        daily_limit_minutes: dailyMinutes
      });

    response.json({ limit: legacyLimitResponse(child.id, permission) });
  }));

  router.get("/children/:id/blacklist", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [
      request.params.id,
      request.legacyUser.id
    ]);

    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    const rows = await request.legacyDb.many(
      `
        SELECT p.id,
               p.child_id,
               p.content_id,
               p.series_id,
               p.created_at,
               COALESCE(c.title, s.title) AS title,
               COALESCE(c.poster_url, s.poster_url, '') AS poster_url,
               c.series_id AS content_series_id
        FROM child_permissions p
        LEFT JOIN content c ON c.id = p.content_id
        LEFT JOIN series s ON s.id = p.series_id
        WHERE p.child_id = $1
          AND p.mode = 'deny'
          AND (p.content_id IS NOT NULL OR p.series_id IS NOT NULL)
        ORDER BY p.created_at DESC
      `,
      [child.id]
    );

    const blacklist = rows.map((row) => ({
      id: row.id,
      childId: row.child_id,
      child_id: row.child_id,
      contentId: row.content_id,
      content_id: row.content_id,
      seriesId: row.series_id || row.content_series_id || null,
      series_id: row.series_id || row.content_series_id || null,
      target_type: row.series_id ? "series" : "content",
      target_id: row.series_id || row.content_id,
      title: row.title,
      poster_url: row.poster_url || "",
      createdAt: row.created_at,
      created_at: row.created_at
    }));

    response.json({
      blacklist,
      items: blacklist,
      total: blacklist.length
    });
  }));

  router.post("/children/:id/blacklist", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [
      request.params.id,
      request.legacyUser.id
    ]);

    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    const targetId = request.body.contentId || request.body.content_id || request.body.seriesId || request.body.series_id;
    const target = await legacyBlacklistTarget(request.legacyDb, targetId);
    const targetColumn = target.type === "series" ? "series_id" : "content_id";
    const existing = await request.legacyDb.one(
      `SELECT * FROM child_permissions WHERE child_id = $1 AND mode = 'deny' AND ${targetColumn} = $2 LIMIT 1`,
      [child.id, target.id]
    );
    const item = existing || await insertRow(request.legacyDb, "child_permissions", {
      child_id: child.id,
      mode: "deny",
      category_id: null,
      content_id: target.type === "content" ? target.id : null,
      series_id: target.type === "series" ? target.id : null,
      watch_from_min: null,
      watch_until_min: null,
      weekday_mask: null,
      daily_limit_minutes: null
    });

    response.status(201).json({
      blacklisted: true,
      childId: child.id,
      child_id: child.id,
      target_type: target.type,
      target_id: target.id,
      content_id: target.type === "content" ? target.id : null,
      content_ids: target.contentIds,
      series_id: target.seriesId,
      items: [item]
    });
  }));

  router.delete("/children/:id/blacklist/:content_id", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [
      request.params.id,
      request.legacyUser.id
    ]);

    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    const target = await legacyBlacklistTarget(request.legacyDb, request.params.content_id);
    const targetColumn = target.type === "series" ? "series_id" : "content_id";
    const result = await request.legacyDb.query(
      `DELETE FROM child_permissions WHERE child_id = $1 AND mode = 'deny' AND ${targetColumn} = $2`,
      [child.id, target.id]
    );

    response.json({
      blacklisted: false,
      deleted: result.rowCount || 0,
      childId: child.id,
      child_id: child.id,
      target_type: target.type,
      target_id: target.id,
      content_id: target.type === "content" ? target.id : null,
      content_ids: target.contentIds,
      series_id: target.seriesId
    });
  }));

  router.get("/children/:id/devices", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [
      request.params.id,
      request.legacyUser.id
    ]);
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    response.json(await request.legacyDb.many(
      "SELECT d.* FROM child_devices d JOIN children c ON c.id = d.child_id WHERE c.id = $1 AND c.parent_id = $2 ORDER BY d.created_at DESC",
      [request.params.id, request.legacyUser.id]
    ));
  }));

  router.delete("/children/:id/devices/:device_id", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }
    if (!isUuid(request.params.device_id)) {
      throw legacyError(400, "invalid device_id", "invalid device_id");
    }

    const device = await request.legacyDb.one(
      `
        UPDATE child_devices d
        SET revoked_at = now()
        FROM children c
        WHERE d.id = $1
          AND d.child_id = c.id
          AND c.id = $2
          AND c.parent_id = $3
        RETURNING d.*
      `,
      [request.params.device_id, request.params.id, request.legacyUser.id]
    );
    if (!device) {
      throw legacyError(404, "device_not_found", "device not found");
    }
    response.json({ message: "ok" });
  }));

  router.get("/children/:id/permissions", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1 AND parent_id = $2", [
      request.params.id,
      request.legacyUser.id
    ]);
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    response.json(await request.legacyDb.many(
      "SELECT p.* FROM child_permissions p JOIN children c ON c.id = p.child_id WHERE p.child_id = $1 AND c.parent_id = $2 ORDER BY p.created_at DESC",
      [request.params.id, request.legacyUser.id]
    ));
  }));

  router.post("/children/:id/permissions", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT * FROM children WHERE id = $1 AND parent_id = $2", [request.params.id, request.legacyUser.id]);
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }
    const permission = await insertRow(request.legacyDb, "child_permissions", {
      child_id: request.params.id,
      mode: request.body.mode || "allow",
      category_id: request.body.category_id || null,
      content_id: request.body.content_id || null,
      series_id: request.body.series_id || null,
      watch_from_min: toInteger(request.body.watch_from_min, null),
      watch_until_min: toInteger(request.body.watch_until_min, null),
      weekday_mask: toInteger(request.body.weekday_mask, null),
      daily_limit_minutes: toInteger(request.body.daily_limit_minutes, null)
    });
    response.status(201).json(permission);
  }));

  router.put("/children/:id/permissions/:rule_id", requireParent, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }
    if (!isUuid(request.params.rule_id)) {
      throw legacyError(400, "invalid rule_id", "invalid rule_id");
    }

    const permission = await request.legacyDb.one(
      `
        UPDATE child_permissions p
        SET mode = COALESCE($1, p.mode),
            category_id = $2,
            content_id = $3,
            series_id = $4,
            watch_from_min = $5,
            watch_until_min = $6,
            weekday_mask = $7,
            daily_limit_minutes = $8
        FROM children c
        WHERE p.id = $9 AND p.child_id = c.id AND c.parent_id = $10
        RETURNING p.*
      `,
      [
        request.body.mode,
        request.body.category_id || null,
        request.body.content_id || null,
        request.body.series_id || null,
        toInteger(request.body.watch_from_min, null),
        toInteger(request.body.watch_until_min, null),
        toInteger(request.body.weekday_mask, null),
        toInteger(request.body.daily_limit_minutes, null),
        request.params.rule_id,
        request.legacyUser.id
      ]
    );
    if (!permission) {
      throw legacyError(404, "permission_not_found", "permission not found");
    }
    response.json(permission);
  }));

  router.delete("/children/:id/permissions/:rule_id", requireParent, asyncHandler(async (request, response) => {
    await request.legacyDb.query(
      "DELETE FROM child_permissions WHERE id = $1 AND child_id = $2",
      [request.params.rule_id, request.params.id]
    );
    response.json(messageResponse("deleted"));
  }));

  router.post("/auth/child/init", asyncHandler(async (request, response) => {
    requireFields(request.body, ["device_name", "device_fingerprint"]);
    const code = randomAlphaNumericCode(32);
    const expiresAt = nowPlus(5);
    const device = await insertRow(request.legacyDb, "child_devices", {
      device_name: request.body.device_name,
      device_fingerprint: request.body.device_fingerprint,
      code,
      pairing_expires_at: expiresAt,
      status: "pending"
    });
    const qrPayload = `${requestPublicOrigin(request)}/child/pair?code=${encodeURIComponent(code)}`;
    response.json({
      device_id: device.id,
      code,
      expires_at: expiresAt,
      qr_payload: qrPayload,
      qr_base64: await qrPngBase64(qrPayload)
    });
  }));

  router.get("/auth/child/:device_id/status", asyncHandler(async (request, response) => {
    if (!isUuid(request.params.device_id)) {
      throw legacyError(400, "invalid device_id", "invalid device_id");
    }

    const device = await getById(request.legacyDb, "child_devices", request.params.device_id);

    if (device.status !== "confirmed" || !device.child_id) {
      response.json({
        device_id: device.id,
        status: "pending",
        expires_at: device.pairing_expires_at,
        access_token: "",
        refresh_token: "",
        refresh_expires_at: "",
        child: null
      });
      return;
    }

    const child = await getById(request.legacyDb, "children", device.child_id);
    response.json({
      device_id: device.id,
      status: "confirmed",
      child,
      ...issueDeviceToken(device, child)
    });
  }));

  router.post("/auth/child/confirm", requireParent, asyncHandler(async (request, response) => {
    requireFields(request.body, ["code"]);
    const extension = await request.legacyDb.one(
      "SELECT * FROM child_extension_tickets WHERE code = $1 AND status = 'pending' AND expires_at > now()",
      [request.body.code]
    );

    if (extension) {
      const extendedUntil = nowPlus(childExtendMinutes());
      await request.legacyDb.query("UPDATE children SET extended_until = $1 WHERE id = $2", [extendedUntil, extension.child_id]);
      await request.legacyDb.query(
        "UPDATE child_extension_tickets SET status = 'confirmed', extended_until = $1 WHERE id = $2",
        [extendedUntil, extension.id]
      );
      response.json({ action: "extension", ticket_id: extension.id, extends_until: extendedUntil });
      return;
    }

    requireFields(request.body, ["child_id"]);
    const child = await request.legacyDb.one("SELECT * FROM children WHERE id = $1 AND parent_id = $2", [request.body.child_id, request.legacyUser.id]);
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }
    const device = await request.legacyDb.one(
      "UPDATE child_devices SET child_id = $1, status = 'confirmed', paired_at = now() WHERE code = $2 AND pairing_expires_at > now() RETURNING *",
      [child.id, request.body.code]
    );
    if (!device) {
      throw legacyError(410, "pairing_expired", "pairing code expired");
    }

    const permissions = [];
    for (const permission of Array.isArray(request.body.permissions) ? request.body.permissions : []) {
      permissions.push(await insertRow(request.legacyDb, "child_permissions", {
        child_id: child.id,
        mode: permission.mode || "allow",
        category_id: permission.category_id || null,
        content_id: permission.content_id || null,
        series_id: permission.series_id || null,
        watch_from_min: toInteger(permission.watch_from_min, null),
        watch_until_min: toInteger(permission.watch_until_min, null),
        weekday_mask: toInteger(permission.weekday_mask, null),
        daily_limit_minutes: toInteger(permission.daily_limit_minutes, null)
      }));
    }

    response.json({ action: "pairing", device, permissions });
  }));

  router.post("/children/:id/extend/init", requireActor, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await request.legacyDb.one("SELECT id FROM children WHERE id = $1", [request.params.id]);
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }

    const code = randomCode(6);
    const expiresAt = nowPlus(5);
    const ticket = await insertRow(request.legacyDb, "child_extension_tickets", {
      child_id: request.params.id,
      code,
      expires_at: expiresAt
    });
    const qrPayload = JSON.stringify({ type: "child_extension", code, ticket_id: ticket.id });
    response.json({
      ticket_id: ticket.id,
      expires_at: expiresAt,
      qr_payload: qrPayload,
      qr_base64: await qrPngBase64(qrPayload)
    });
  }));

  router.post("/children/:id/extend/pin", requireActor, asyncHandler(async (request, response) => {
    requireFields(request.body, ["pin"]);
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }

    const child = await getById(request.legacyDb, "children", request.params.id);
    if (!child.pin_hash || !verifySecret(request.body.pin, child.pin_hash)) {
      throw legacyError(401, "invalid_pin", "invalid PIN");
    }
    const extendedUntil = nowPlus(childExtendMinutes());
    await updateById(request.legacyDb, "children", child.id, { extended_until: extendedUntil });
    response.json({
      message: "ok",
      extended_until: extendedUntil,
      extends_until: extendedUntil
    });
  }));

  router.get("/children/:id/extend/:ticket_id/status", requireActor, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(400, "invalid child_id", "invalid child_id");
    }
    if (!isUuid(request.params.ticket_id)) {
      throw legacyError(400, "invalid ticket_id", "invalid ticket_id");
    }

    const ticket = await request.legacyDb.one(
      "SELECT * FROM child_extension_tickets WHERE id = $1 AND child_id = $2",
      [request.params.ticket_id, request.params.id]
    );
    if (!ticket) {
      throw legacyError(404, "ticket_not_found", "ticket not found");
    }

    response.json({
      ticket_id: ticket.id,
      status: ticket.status,
      extends_until: ticket.extended_until
    });
  }));

  router.get("/categories", asyncHandler(async (request, response) => {
    const lang = requestedLang(request);
    const rows = await request.legacyDb.many("SELECT * FROM categories WHERE active = true ORDER BY sort_order, created_at DESC");
    const seen = new Set();
    const categories = rows.map((row) => localizeRecord(row, lang, ["name", "description"]));

    for (const category of categories) {
      seen.add(String(category.id));
      if (category.slug) {
        seen.add(`slug:${String(category.slug).toLowerCase()}`);
      }
    }

    for (const category of contentCategories?.list?.() || []) {
      const legacyCategory = contentCategoryAsLegacyResponse(category, lang);
      const slugKey = legacyCategory.slug ? `slug:${String(legacyCategory.slug).toLowerCase()}` : "";

      if (seen.has(String(legacyCategory.id)) || (slugKey && seen.has(slugKey)) || legacyCategory.active === false) {
        continue;
      }

      seen.add(String(legacyCategory.id));
      if (slugKey) {
        seen.add(slugKey);
      }
      categories.push(legacyCategory);
    }

    response.json(categories);
  }));

  router.post("/categories", requireAdmin, asyncHandler(async (request, response) => {
    requireFields(request.body, ["name"]);
    const name = normalizeI18n(request.body.name);
    const category = await insertRow(request.legacyDb, "categories", {
      name,
      description: normalizeI18n(request.body.description, ""),
      kind: request.body.kind || "other",
      parent_category_id: request.body.parent_category_id || null,
      poster_url: request.body.poster_url || "",
      slug: createSlug(name, "category"),
      sort_order: toInteger(request.body.sort_order, 0),
      active: request.body.active !== false
    });
    response.status(201).json(category);
  }));

  router.put("/categories/:id", requireAdmin, asyncHandler(async (request, response) => {
    const attrs = {
      name: request.body.name ? normalizeI18n(request.body.name) : undefined,
      description: request.body.description ? normalizeI18n(request.body.description) : undefined,
      kind: request.body.kind,
      parent_category_id: request.body.parent_category_id || null,
      poster_url: request.body.poster_url,
      sort_order: toInteger(request.body.sort_order, undefined),
      active: request.body.active
    };
    if (attrs.name) {
      attrs.slug = createSlug(attrs.name, "category");
    }
    response.json(await updateById(request.legacyDb, "categories", request.params.id, attrs));
  }));

  router.delete("/categories/:id", requireAdmin, asyncHandler(async (request, response) => {
    await deleteLegacyRecordWithMedia(request.legacyDb, media, "categories", request.params.id, ["poster_path"]);
    response.json(messageResponse("deleted"));
  }));

  router.get("/categories/:id/poster", asyncHandler(async (request, response) => {
    const category = await getById(request.legacyDb, "categories", request.params.id);
    if (!category.poster_path) {
      throw legacyError(404, "poster_not_found", "poster not found");
    }
    response.sendFile(media.resolve(category.poster_path));
  }));

  router.post("/categories/:id/poster", requireAdmin, posterUpload, asyncHandler(async (request, response) => {
    const category = await getById(request.legacyDb, "categories", request.params.id);
    const oldPaths = await mediaAssetPaths(request.legacyDb, "categories", request.params.id, "category_poster");
    const stored = media.persistFile("category_poster", request.file, request);
    if (!stored) {
      throw legacyError(400, "file is required");
    }
    await saveMediaAsset(request.legacyDb, stored, "categories", request.params.id);
    const updatedCategory = await updateById(request.legacyDb, "categories", request.params.id, {
      poster_path: stored.path,
      poster_url: legacyPosterUrl("categories", request.params.id)
    });
    const replacedPaths = uniquePaths([category.poster_path, ...oldPaths]).filter((storedPath) => storedPath !== stored.path);
    if (replacedPaths.length > 0) {
      await deleteOwnerMediaAssets(request.legacyDb, "categories", request.params.id, replacedPaths);
    }
    removeStoredMedia(media, replacedPaths);
    response.json(updatedCategory);
  }));

  router.get("/tags", asyncHandler(async (request, response) => {
    const lang = requestedLang(request);
    const rows = await request.legacyDb.many("SELECT * FROM tags WHERE active = true ORDER BY slug");
    response.json(rows.map((row) => localizeRecord(row, lang, ["name"])));
  }));

  router.post("/tags", requireAdmin, asyncHandler(async (request, response) => {
    requireFields(request.body, ["name"]);
    const name = normalizeI18n(request.body.name);
    const tag = await insertRow(request.legacyDb, "tags", {
      name,
      slug: createSlug(name, "tag"),
      active: request.body.active !== false
    });
    response.status(201).json(tag);
  }));

  router.put("/tags/:id", requireAdmin, asyncHandler(async (request, response) => {
    const attrs = {
      name: request.body.name ? normalizeI18n(request.body.name) : undefined,
      active: request.body.active
    };
    if (attrs.name) {
      attrs.slug = createSlug(attrs.name, "tag");
    }
    response.json(await updateById(request.legacyDb, "tags", request.params.id, attrs));
  }));

  router.delete("/tags/:id", requireAdmin, asyncHandler(async (request, response) => {
    await deleteById(request.legacyDb, "tags", request.params.id);
    response.json(messageResponse("deleted"));
  }));

  router.get("/plans", asyncHandler(async (request, response) => {
    const lang = requestedLang(request);
    const rows = await request.legacyDb.many("SELECT * FROM plans WHERE active = true ORDER BY price_cents, created_at");
    response.json(rows.map((row) => localizeRecord(row, lang, ["name", "description"])));
  }));

  router.post("/plans", requireAdmin, asyncHandler(async (request, response) => {
    requireFields(request.body, ["name"]);
    const name = normalizeI18n(request.body.name);
    const plan = await insertRow(request.legacyDb, "plans", {
      name,
      description: normalizeI18n(request.body.description, ""),
      slug: createSlug(name, "plan"),
      package_code: request.body.package_code || "",
      price_cents: toInteger(request.body.price_cents, 0),
      currency: request.body.currency || "UZS",
      duration_days: toInteger(request.body.duration_days, 30),
      max_children: toInteger(request.body.max_children, 1),
      spic: request.body.spic || "",
      vat_percent: toInteger(request.body.vat_percent, 0),
      active: request.body.active !== false
    });
    response.status(201).json(plan);
  }));

  router.put("/plans/:id", requireAdmin, asyncHandler(async (request, response) => {
    const attrs = {
      name: request.body.name ? normalizeI18n(request.body.name) : undefined,
      description: request.body.description ? normalizeI18n(request.body.description) : undefined,
      package_code: request.body.package_code,
      price_cents: toInteger(request.body.price_cents, undefined),
      currency: request.body.currency,
      duration_days: toInteger(request.body.duration_days, undefined),
      max_children: toInteger(request.body.max_children, undefined),
      spic: request.body.spic,
      vat_percent: toInteger(request.body.vat_percent, undefined),
      active: request.body.active
    };
    if (attrs.name) {
      attrs.slug = createSlug(attrs.name, "plan");
    }
    response.json(await updateById(request.legacyDb, "plans", request.params.id, attrs));
  }));

  router.delete("/plans/:id", requireAdmin, asyncHandler(async (request, response) => {
    await deleteById(request.legacyDb, "plans", request.params.id);
    response.json(messageResponse("deleted"));
  }));

  router.get("/series", asyncHandler(async (request, response) => {
    const lang = requestedLang(request);
    const actor = await optionalLegacyActor(request);
    const userId = actor ? await ownerUserIdForActor(request.legacyDb, actor) : null;
    const search = firstQueryValue(request.query.q || request.query.search);
    const category = firstQueryValue(request.query.category || request.query.category_id);
    const filters = ["s.active = true"];
    const values = [];

    if (category) {
      values.push(category);
      filters.push(`(
        s.category_id::text = $${values.length}
        OR lower(cat.slug) = lower($${values.length})
        OR lower(cat.name->>'en') = lower($${values.length})
        OR lower(cat.name->>'ru') = lower($${values.length})
        OR lower(cat.name->>'uz') = lower($${values.length})
      )`);
    }

    if (search) {
      values.push(`%${search}%`);
      const patternParam = values.length;
      values.push(search);
      const searchParam = values.length;
      filters.push(`(
        s.title->>'en' ILIKE $${patternParam}
        OR s.title->>'ru' ILIKE $${patternParam}
        OR s.title->>'uz' ILIKE $${patternParam}
        OR s.description->>'en' ILIKE $${patternParam}
        OR s.description->>'ru' ILIKE $${patternParam}
        OR s.description->>'uz' ILIKE $${patternParam}
        OR EXISTS (
          SELECT 1
          FROM content ec
          WHERE ec.series_id = s.id
            AND (
              ec.title->>'en' ILIKE $${patternParam}
              OR ec.title->>'ru' ILIKE $${patternParam}
              OR ec.title->>'uz' ILIKE $${patternParam}
              OR similarity(COALESCE(ec.title->>'en', ''), $${searchParam}) > 0.25
              OR similarity(COALESCE(ec.title->>'ru', ''), $${searchParam}) > 0.25
              OR similarity(COALESCE(ec.title->>'uz', ''), $${searchParam}) > 0.25
            )
        )
        OR similarity(COALESCE(s.title->>'en', ''), $${searchParam}) > 0.25
        OR similarity(COALESCE(s.title->>'ru', ''), $${searchParam}) > 0.25
        OR similarity(COALESCE(s.title->>'uz', ''), $${searchParam}) > 0.25
      )`);
    }

    await appendLegacySeriesVisibilityFilters(request.legacyDb, actor, filters, values, "s");

    const rows = await request.legacyDb.many(
      `
        SELECT s.*
        FROM series s
        LEFT JOIN categories cat ON cat.id = s.category_id
        WHERE ${filters.join(" AND ")}
        ORDER BY s.created_at DESC
      `,
      values
    );
    const visibleRows = legacyExternalVisibleRows(childContentBlacklist, actor, rows);
    const data = await Promise.all(
      visibleRows.map(async (row) => localizeRecord(
        await serializeSeriesWithLikes(request.legacyDb, row, userId),
        lang
      ))
    );

    response.json(data);
  }));

  router.post("/series", requireAdmin, asyncHandler(async (request, response) => {
    requireFields(request.body, ["title"]);
    const title = normalizeI18n(request.body.title);
    const categoryId = await resolveLegacySeriesCategoryId(request.legacyDb, request.body.category_id);
    const row = await insertRow(request.legacyDb, "series", {
      title,
      description: normalizeI18n(request.body.description, ""),
      kind: request.body.kind || "seasons",
      category_id: categoryId || null,
      poster_url: request.body.poster_url || "",
      slug: createSlug(title, "series"),
      active: request.body.active !== false
    });
    response.status(201).json(row);
  }));

  router.get("/series/:id", asyncHandler(async (request, response) => {
    const actor = await optionalLegacyActor(request);

    if (
      await legacySeriesDeniedForActor(request.legacyDb, actor, request.params.id)
      || legacyExternalContentDeniedForActor(childContentBlacklist, actor, request.params.id)
    ) {
      throw legacyError(404, "series_not_found", "series not found");
    }

    const userId = actor ? await ownerUserIdForActor(request.legacyDb, actor) : null;
    const row = await getById(request.legacyDb, "series", request.params.id);
    response.json(localizeRecord(
      await serializeSeriesWithLikes(request.legacyDb, row, userId),
      requestedLang(request)
    ));
  }));

  router.put("/series/:id", requireAdmin, asyncHandler(async (request, response) => {
    const categoryId = Object.hasOwn(request.body || {}, "category_id")
      ? await resolveLegacySeriesCategoryId(request.legacyDb, request.body.category_id)
      : undefined;
    const attrs = {
      title: request.body.title ? normalizeI18n(request.body.title) : undefined,
      description: request.body.description ? normalizeI18n(request.body.description) : undefined,
      kind: request.body.kind,
      category_id: categoryId,
      poster_url: request.body.poster_url,
      active: request.body.active
    };
    if (attrs.title) {
      attrs.slug = createSlug(attrs.title, "series");
    }
    response.json(await updateById(request.legacyDb, "series", request.params.id, attrs));
  }));

  router.delete("/series/:id", requireAdmin, asyncHandler(async (request, response) => {
    await deleteLegacyRecordWithMedia(request.legacyDb, media, "series", request.params.id, ["poster_path"]);
    response.json(messageResponse("deleted"));
  }));

  router.get("/series/:id/episodes", asyncHandler(async (request, response) => {
    const lang = requestedLang(request);
    const actor = await optionalLegacyActor(request);
    let rows;

    if (
      await legacySeriesDeniedForActor(request.legacyDb, actor, request.params.id)
      || legacyExternalContentDeniedForActor(childContentBlacklist, actor, request.params.id)
    ) {
      response.json([]);
      return;
    }

    if (!actor) {
      rows = await request.legacyDb.many(
        `
          SELECT c.*, ${latestTranscodingJobSelect}
          FROM content c
          ${latestTranscodingJobJoin}
          WHERE c.series_id = $1 AND c.published = true
          ORDER BY c.season_number NULLS FIRST, c.episode_number NULLS FIRST, c.created_at
        `,
        [request.params.id]
      );
    } else {
      const filters = ["c.series_id = $1", "c.published = true"];
      const values = [request.params.id];

      await appendLegacyContentVisibilityFilters(request.legacyDb, actor, filters, values, "c");

      rows = await request.legacyDb.many(
        `
          SELECT c.*, ${latestTranscodingJobSelect}
          FROM content c
          ${latestTranscodingJobJoin}
          WHERE ${filters.join(" AND ")}
          ORDER BY c.season_number NULLS FIRST, c.episode_number NULLS FIRST, c.created_at
        `,
        values
      );
    }
    rows = legacyExternalVisibleRows(childContentBlacklist, actor, rows);

    const movieRows = legacyExternalVisibleRows(
      childContentBlacklist,
      actor,
      movieEpisodesForSeries(contentMovies, request.params.id)
    );
    const data = [...rows.map(serializeContent), ...movieRows];

    response.json(data.map((row) => localizeRecord(row, lang)));
  }));

  router.get("/series/:id/poster", asyncHandler(async (request, response) => {
    const row = await getById(request.legacyDb, "series", request.params.id);
    if (!row.poster_path) {
      throw legacyError(404, "poster_not_found", "poster not found");
    }
    response.sendFile(media.resolve(row.poster_path));
  }));

  router.post("/series/:id/poster", requireAdmin, posterUpload, asyncHandler(async (request, response) => {
    const row = await getById(request.legacyDb, "series", request.params.id);
    const oldPaths = await mediaAssetPaths(request.legacyDb, "series", request.params.id, "series_poster");
    const stored = media.persistFile("series_poster", request.file, request);
    if (!stored) {
      throw legacyError(400, "file is required");
    }
    await saveMediaAsset(request.legacyDb, stored, "series", request.params.id);
    const updatedSeries = await updateById(request.legacyDb, "series", request.params.id, {
      poster_path: stored.path,
      poster_url: legacyPosterUrl("series", request.params.id)
    });
    const replacedPaths = uniquePaths([row.poster_path, ...oldPaths]).filter((storedPath) => storedPath !== stored.path);
    if (replacedPaths.length > 0) {
      await deleteOwnerMediaAssets(request.legacyDb, "series", request.params.id, replacedPaths);
    }
    removeStoredMedia(media, replacedPaths);
    response.json(updatedSeries);
  }));

  router.get("/content", requireActor, asyncHandler(listLegacyContent));
  router.get("/content/movies", requireActor, asyncHandler(listLegacyContent));
  router.get("/content/filters", requireActor, asyncHandler(async (request, response) => {
    const lang = requestedLang(request);
    const categories = await request.legacyDb.many(
      "SELECT * FROM categories WHERE active = true ORDER BY sort_order, created_at DESC"
    );
    const tags = await request.legacyDb.many(
      "SELECT * FROM tags WHERE active = true ORDER BY slug, created_at DESC"
    );

    response.json({
      categories: categories.map((row) => localizeRecord(row, lang, ["name", "description"])),
      tags: tags.map((row) => localizeRecord(row, lang, ["name"]))
    });
  }));

  router.post("/content", requireAdmin, asyncHandler(async (request, response) => {
    requireFields(request.body, ["title"]);
    const title = normalizeI18n(request.body.title);
    const row = await insertRow(request.legacyDb, "content", {
      title,
      description: normalizeI18n(request.body.description, ""),
      slug: createSlug(title, "content"),
      category_id: request.body.category_id || null,
      series_id: request.body.series_id || null,
      source_path: request.body.source_path || "",
      poster_url: request.body.poster_url || "",
      status: request.body.status || "uploaded",
      age_rating: toInteger(request.body.age_rating, 0),
      duration_sec: toInteger(request.body.duration_sec, 0),
      season_number: toInteger(request.body.season_number, null),
      episode_number: toInteger(request.body.episode_number, null),
      year: toInteger(request.body.year, null),
      published: Boolean(request.body.published),
      published_at: request.body.published ? new Date().toISOString() : null,
      created_by_id: request.legacyUser.id
    });

    if (Array.isArray(request.body.tag_ids) && request.body.tag_ids.length > 0) {
      for (const tagId of request.body.tag_ids) {
        await request.legacyDb.query(
          "INSERT INTO content_tags (content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [row.id, tagId]
        );
      }
    }

    response.status(201).json(row);
  }));

  router.get("/content/:id", requireActor, asyncHandler(async (request, response) => {
    if (!isUuid(request.params.id)) {
      throw legacyError(404, "content_not_found", "content not found");
    }

    await assertCanAccessContent(request.legacyDb, request.legacyActor, request.params.id);
    const row = await request.legacyDb.one(
      `
        SELECT c.*, cat.kind AS category_kind, s.kind AS series_kind, ${latestTranscodingJobSelect}
        FROM content c
        LEFT JOIN categories cat ON cat.id = c.category_id
        LEFT JOIN series s ON s.id = c.series_id
        ${latestTranscodingJobJoin}
        WHERE c.id = $1
      `,
      [request.params.id]
    );
    if (!row) {
      throw legacyError(404, "content_not_found", "content not found");
    }
    const item = await contentListItem(request.legacyDb, row, request.legacyActor, requestedLang(request));

    if (streaming) {
      const state = await streaming.loadState(request.legacyDb, request.params.id);
      const streamingView = streaming.serializeState(state, request);

      item.hlsUrl = streamingView.hlsUrl;
      item.streamingStatus = streamingView.streamingStatus;
      item.defaultAudioLanguage = streamingView.defaultAudioLanguage;
      item.audioTracks = streamingView.audioTracks;
      item.subtitles = streamingView.subtitles;
    }

    response.json(item);
  }));

  router.put("/content/:id", requireAdmin, asyncHandler(async (request, response) => {
    const attrs = {
      title: request.body.title ? normalizeI18n(request.body.title) : undefined,
      description: request.body.description ? normalizeI18n(request.body.description) : undefined,
      category_id: request.body.category_id || undefined,
      series_id: request.body.series_id || undefined,
      source_path: request.body.source_path,
      poster_url: request.body.poster_url,
      status: request.body.status,
      age_rating: toInteger(request.body.age_rating, undefined),
      duration_sec: toInteger(request.body.duration_sec, undefined),
      season_number: toInteger(request.body.season_number, undefined),
      episode_number: toInteger(request.body.episode_number, undefined),
      year: toInteger(request.body.year, undefined),
      published: request.body.published,
      published_at: request.body.published === true ? new Date().toISOString() : undefined
    };
    if (attrs.title) {
      attrs.slug = createSlug(attrs.title, "content");
    }
    response.json(await updateById(request.legacyDb, "content", request.params.id, attrs));
  }));

  router.delete("/content/:id", requireAdmin, asyncHandler(async (request, response) => {
    cancelLegacyTranscode(request.params.id);
    if (streaming) {
      streaming.cancel(request.params.id);
    }
    await deleteLegacyRecordWithMedia(request.legacyDb, media, "content", request.params.id, ["source_path", "poster_path"], [`hls/${request.params.id}`, `streaming/${request.params.id}`]);
    response.json(messageResponse("deleted"));
  }));

  router.get("/content/:id/poster", asyncHandler(async (request, response) => {
    const row = await getById(request.legacyDb, "content", request.params.id);
    if (!row.poster_path) {
      throw legacyError(404, "poster_not_found", "poster not found");
    }
    response.sendFile(media.resolve(row.poster_path));
  }));

  router.post("/content/:id/poster", requireAdmin, posterUpload, asyncHandler(async (request, response) => {
    const row = await getById(request.legacyDb, "content", request.params.id);
    const oldPaths = await mediaAssetPaths(request.legacyDb, "content", request.params.id, "content_poster");
    const stored = media.persistFile("content_poster", request.file, request);
    if (!stored) {
      throw legacyError(400, "file is required");
    }
    await saveMediaAsset(request.legacyDb, stored, "content", request.params.id);
    const updatedContent = await updateById(request.legacyDb, "content", request.params.id, {
      poster_path: stored.path,
      poster_url: legacyPosterUrl("content", request.params.id)
    });
    const replacedPaths = uniquePaths([row.poster_path, ...oldPaths]).filter((storedPath) => storedPath !== stored.path);
    if (replacedPaths.length > 0) {
      await deleteOwnerMediaAssets(request.legacyDb, "content", request.params.id, replacedPaths);
    }
    removeStoredMedia(media, replacedPaths);
    response.json(updatedContent);
  }));

  router.post("/content/:id/upload", requireAdmin, videoUpload, asyncHandler(async (request, response) => {
    const existingContent = await getById(request.legacyDb, "content", request.params.id);
    const oldPaths = await mediaAssetPaths(request.legacyDb, "content", request.params.id, "source_video");
    const stored = media.persistFile("source_video", request.file, request);
    if (!stored) {
      throw legacyError(400, "file is required");
    }
    cancelLegacyTranscode(request.params.id);
    await saveMediaAsset(request.legacyDb, stored, "content", request.params.id);
    const row = await updateById(request.legacyDb, "content", request.params.id, {
      source_path: stored.path,
      status: "uploaded"
    });
    const replacedPaths = uniquePaths([existingContent.source_path, ...oldPaths]).filter((storedPath) => storedPath !== stored.path);
    if (replacedPaths.length > 0) {
      await deleteOwnerMediaAssets(request.legacyDb, "content", request.params.id, replacedPaths);
    }
    removeStoredMedia(media, [...replacedPaths, `hls/${request.params.id}`]);
    await request.legacyDb.query("DELETE FROM renditions WHERE content_id = $1", [request.params.id]).catch(() => { });
    await maybeStartTranscode(request.legacyDb, config, row);
    response.json(row);
  }));

  router.get("/content/:id/renditions", requireActor, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT label, width, height, bitrate, playlist_url FROM renditions WHERE content_id = $1 ORDER BY height", [request.params.id]));
  }));

  router.get("/content/:id/transcoding", requireActor, asyncHandler(async (request, response) => {
    const job = await request.legacyDb.one("SELECT * FROM transcoding_jobs WHERE content_id = $1 ORDER BY created_at DESC LIMIT 1", [request.params.id]);
    response.json(job || { content_id: request.params.id, status: "missing" });
  }));

  function ensureStreaming(request, response, next) {
    if (!streaming) {
      next(legacyError(503, "streaming_unavailable", "streaming service is not configured"));
      return;
    }

    if (!isUuid(request.params.id)) {
      next(legacyError(404, "content_not_found", "content not found"));
      return;
    }

    next();
  }

  function streamingUpload(request, response, next) {
    streaming.upload(request, response, (error) => (error ? next(error) : next()));
  }

  // Multi-audio HLS: upload a main video + per-language audio/subtitle tracks,
  // then start non-blocking FFmpeg processing. Keyed to content(id).
  router.post("/content/:id/streaming-assets", requireAdmin, ensureStreaming, streamingUpload, asyncHandler(async (request, response) => {
    await getById(request.legacyDb, "content", request.params.id);
    await streaming.ingest(request.legacyDb, request.params.id, request);
    await streaming.startProcessing(request.legacyDb, request.params.id);
    const state = await streaming.loadState(request.legacyDb, request.params.id);
    response.status(202).json(streaming.serializeState(state, request));
  }));

  router.get("/content/:id/streaming-assets", requireAdmin, ensureStreaming, asyncHandler(async (request, response) => {
    const state = await streaming.loadState(request.legacyDb, request.params.id);
    response.json(streaming.serializeState(state, request));
  }));

  router.post("/content/:id/streaming-assets/reprocess", requireAdmin, ensureStreaming, asyncHandler(async (request, response) => {
    await getById(request.legacyDb, "content", request.params.id);
    await streaming.startProcessing(request.legacyDb, request.params.id);
    const state = await streaming.loadState(request.legacyDb, request.params.id);
    response.status(202).json(streaming.serializeState(state, request));
  }));

  router.put("/content/:id/tags", requireAdmin, asyncHandler(async (request, response) => {
    const tagIds = Array.isArray(request.body.tag_ids) ? request.body.tag_ids : [];
    await request.legacyDb.transaction(async (client) => {
      await client.query("DELETE FROM content_tags WHERE content_id = $1", [request.params.id]);
      for (const tagId of tagIds) {
        await client.query(
          "INSERT INTO content_tags (content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [request.params.id, tagId]
        );
      }
    });
    response.json(messageResponse("updated"));
  }));

  router.get("/content/:id/like", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveLikeTarget(request.legacyDb, request.params.id, requestedLikeTargetType(request));
    const row = await request.legacyDb.one(
      "SELECT 1 FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
      [userId, target.type, target.id]
    );

    response.json({
      liked: Boolean(row),
      target_type: target.type,
      target_id: target.id
    });
  }));

  router.post("/content/:id/like", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveLikeTarget(request.legacyDb, request.params.id, requestedLikeTargetType(request));
    await request.legacyDb.query(
      `
        INSERT INTO likes (user_id, content_id, target_type, target_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [userId, target.contentId, target.type, target.id]
    );

    response.status(201).json({
      liked: true,
      target_type: target.type,
      target_id: target.id
    });
  }));

  router.delete("/content/:id/like", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const target = await resolveLikeTarget(request.legacyDb, request.params.id, requestedLikeTargetType(request));
    await request.legacyDb.query(
      "DELETE FROM likes WHERE user_id = $1 AND target_type = $2 AND target_id = $3",
      [userId, target.type, target.id]
    );

    response.json({
      liked: false,
      target_type: target.type,
      target_id: target.id
    });
  }));

  router.get("/content/:id/likes/count", asyncHandler(async (request, response) => {
    const target = await resolveLikeTarget(request.legacyDb, request.params.id, requestedLikeTargetType(request));
    const row = await request.legacyDb.one(
      "SELECT COUNT(*)::integer AS count FROM likes WHERE target_type = $1 AND target_id = $2",
      [target.type, target.id]
    );

    response.json({
      content_id: target.id,
      target_type: target.type,
      target_id: target.id,
      count: row.count
    });
  }));

  router.get("/me/likes", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const data = [];

    for (const item of await legacyLikedItems(request.legacyDb, userId)) {
      if (item.target_type === "content") {
        try {
          await assertCanAccessContent(request.legacyDb, request.legacyActor, item.target_id);
        } catch (error) {
          if (error.statusCode === 403) {
            continue;
          }

          throw error;
        }
      }

      data.push(item);
    }

    response.json({
      data
    });
  }));

  router.get("/me/favourites", requireActor, asyncHandler(async (request, response) => {
    const userId = await requireOwnerUserIdForActor(request.legacyDb, request.legacyActor);
    const favourites = await favouriteItems({
      contentLikes,
      contentMovies,
      db: request.legacyDb,
      userId
    });
    const data = [];

    for (const item of favourites) {
      const contentId = item.target_id || item.content_id || item.id;

      if (item.target_type === "content" && contentId) {
        try {
          await assertCanAccessContent(request.legacyDb, request.legacyActor, contentId);
        } catch (error) {
          if (error.statusCode === 403) {
            continue;
          }

          throw error;
        }
      }

      data.push(item);
    }

    response.json({
      data,
      favourites: data,
      favorites: data,
      total: data.length
    });
  }));

  router.get("/content/:id/block", requireUser, asyncHandler(async (request, response) => {
    const row = await request.legacyDb.one("SELECT 1 FROM blocks WHERE user_id = $1 AND content_id = $2", [request.legacyUser.id, request.params.id]);
    response.json({ blocked: Boolean(row) });
  }));

  router.post("/content/:id/block", requireUser, asyncHandler(async (request, response) => {
    await request.legacyDb.query("INSERT INTO blocks (user_id, content_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [request.legacyUser.id, request.params.id]);
    response.status(201).json({ blocked: true });
  }));

  router.delete("/content/:id/block", requireUser, asyncHandler(async (request, response) => {
    await request.legacyDb.query("DELETE FROM blocks WHERE user_id = $1 AND content_id = $2", [request.legacyUser.id, request.params.id]);
    response.json({ blocked: false });
  }));

  router.get("/me/blocks", requireUser, asyncHandler(async (request, response) => {
    const rows = await request.legacyDb.many(
      "SELECT c.* FROM content c JOIN blocks b ON b.content_id = c.id WHERE b.user_id = $1 ORDER BY b.created_at DESC",
      [request.legacyUser.id]
    );
    response.json({ data: rows.map(serializeContent) });
  }));

  router.get("/content/:id/rating", asyncHandler(async (request, response) => {
    const row = await request.legacyDb.one(
      "SELECT COALESCE(AVG(score), 0)::float AS avg_rating, COUNT(*)::integer AS rating_count FROM ratings WHERE content_id = $1",
      [request.params.id]
    );
    response.json({
      content_id: request.params.id,
      avg_rating: row.avg_rating || 0,
      rating_count: row.rating_count || 0
    });
  }));

  router.post("/content/:id/rating", requireUser, asyncHandler(async (request, response) => {
    const score = toInteger(request.body.score, null);
    if (score < 1 || score > 5) {
      throw legacyError(400, "invalid_score", "score must be between 1 and 5");
    }
    const row = await request.legacyDb.one(
      `
        INSERT INTO ratings (user_id, content_id, score)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, content_id)
        DO UPDATE SET score = EXCLUDED.score, updated_at = now()
        RETURNING *
      `,
      [request.legacyUser.id, request.params.id, score]
    );
    response.status(201).json(row);
  }));

  router.get("/content/:id/comments", asyncHandler(async (request, response) => {
    const { limit, offset } = parseLimitOffset(request.query, 50, 200);
    const target = await resolveCommentTarget(request.legacyDb, request.params.id, contentMovies);
    const rows = await request.legacyDb.many(
      `
        SELECT c.*, COALESCE(c.target_id, c.content_id::text) AS content_id,
          u.name AS user_name, u.last_name AS user_last_name, u.avatar_url AS user_avatar_url
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE (c.target_type = $1 AND c.target_id = $2)
          OR ($3::uuid IS NOT NULL AND c.content_id = $3)
        ORDER BY c.created_at DESC
        LIMIT $4 OFFSET $5
      `,
      [target.targetType, target.targetId, target.contentId, limit, offset]
    );
    response.json(rows.map(serializeComment));
  }));

  router.post("/content/:id/comments", requireUser, asyncHandler(async (request, response) => {
    requireFields(request.body, ["body"]);
    const target = await resolveCommentTarget(request.legacyDb, request.params.id, contentMovies);
    const row = await insertRow(request.legacyDb, "comments", {
      user_id: request.legacyUser.id,
      content_id: target.contentId,
      target_type: target.targetType,
      target_id: target.targetId,
      body: request.body.body
    });
    response.status(201).json(serializeComment({
      ...row,
      user_name: request.legacyUser.name,
      user_last_name: request.legacyUser.last_name,
      user_avatar_url: request.legacyUser.avatar_url
    }));
  }));

  router.put("/comments/:id", requireUser, asyncHandler(async (request, response) => {
    const row = await request.legacyDb.one(
      "UPDATE comments SET body = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [request.body.body, request.params.id, request.legacyUser.id]
    );
    if (!row) {
      throw legacyError(404, "comment_not_found", "comment not found");
    }
    response.json(serializeComment({
      ...row,
      user_name: request.legacyUser.name,
      user_last_name: request.legacyUser.last_name,
      user_avatar_url: request.legacyUser.avatar_url
    }));
  }));

  router.delete("/comments/:id", requireUser, asyncHandler(async (request, response) => {
    if (["admin", "super_admin"].includes(request.legacyUser.role)) {
      await request.legacyDb.query("DELETE FROM comments WHERE id = $1", [request.params.id]);
    } else {
      await request.legacyDb.query("DELETE FROM comments WHERE id = $1 AND user_id = $2", [request.params.id, request.legacyUser.id]);
    }
    response.json(messageResponse("deleted"));
  }));

  router.put("/stream/:id/progress", requireActor, asyncHandler(async (request, response) => {
    const actor = request.legacyActor;
    const viewerId = actor.kind === "user" ? actor.user.id : actor.id;
    const position = toInteger(request.body.position_sec, 0);
    const previousProgress = await request.legacyDb.one(
      "SELECT position_sec FROM watch_progress WHERE viewer_id = $1 AND viewer_kind = $2 AND content_id = $3",
      [viewerId, actor.kind, request.params.id]
    );

    await request.legacyDb.query(
      `
        INSERT INTO watch_progress (viewer_id, viewer_kind, content_id, position_sec)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (viewer_id, viewer_kind, content_id)
        DO UPDATE SET position_sec = EXCLUDED.position_sec, updated_at = now()
      `,
      [viewerId, actor.kind, request.params.id, position]
    );

    if (position >= 10 && Number(previousProgress?.position_sec || 0) < 10) {
      await request.legacyDb.query(
        "UPDATE content SET views_count = views_count + 1 WHERE id = $1",
        [request.params.id]
      );
    }

    await insertRow(request.legacyDb, "watch_history", {
      viewer_id: viewerId,
      viewer_kind: actor.kind,
      content_id: request.params.id,
      position_sec: position
    });
    response.json(messageResponse("progress saved"));
  }));

  router.get("/me/history", requireActor, asyncHandler(async (request, response) => {
    const actor = request.legacyActor;
    const viewerId = actor.kind === "user" ? actor.user.id : actor.id;
    const filters = ["h.viewer_id = $1", "h.viewer_kind = $2"];
    const values = [viewerId, actor.kind];

    await appendLegacyContentVisibilityFilters(request.legacyDb, actor, filters, values, "c");
    values.push(100);

    const rows = await request.legacyDb.many(
      `
        SELECT h.*, c.title, c.poster_url, c.duration_sec
        FROM watch_history h
        JOIN content c ON c.id = h.content_id
        WHERE ${filters.join(" AND ")}
        ORDER BY h.watched_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    response.json({ data: rows.map((row) => localizeRecord(row, requestedLang(request), ["title"])) });
  }));

  router.get("/stream/:id/grant", requireActor, asyncHandler(async (request, response) => {
    await assertCanAccessContent(request.legacyDb, request.legacyActor, request.params.id);
    const content = await getById(request.legacyDb, "content", request.params.id);
    await assertLegacyChildCanStream(request.legacyDb, request.legacyActor, content);
    const actor = request.legacyActor;
    const ownerId = await ownerUserIdForActor(request.legacyDb, actor);
    const subscription = ownerId ? await activeSubscription(request.legacyDb, ownerId) : null;
    const previewOnly = !subscription;
    const progress = await request.legacyDb.one(
      "SELECT position_sec FROM watch_progress WHERE viewer_id = $1 AND viewer_kind = $2 AND content_id = $3",
      [actor.kind === "user" ? actor.user.id : actor.id, actor.kind, content.id]
    );
    const renditionRows = await request.legacyDb.many("SELECT * FROM renditions WHERE content_id = $1 ORDER BY height", [content.id]);
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const mediaPath = renditionRows.length > 0 ? `hls/${content.id}/master.m3u8` : content.source_path || "";
    const signature = mediaPath ? media.sign(mediaPath, expires) : "";

    response.json({
      content_id: content.id,
      viewer_id: actor.kind === "user" ? actor.user.id : actor.id,
      viewer_kind: actor.kind,
      media_url: mediaPath ? `/api/v1/media/${encodeURIComponent(mediaPath)}?expires=${expires}&signature=${signature}` : "",
      is_hls: Boolean(renditionRows.length),
      renditions: renditionRows.length,
      rendition_list: renditionRows.map((row) => ({
        label: row.label,
        width: row.width,
        height: row.height,
        bitrate: row.bitrate,
        playlist_url: row.playlist_url
      })),
      duration_sec: content.duration_sec || 0,
      last_position_sec: progress?.position_sec || 0,
      preview_only: previewOnly,
      preview_until_sec: previewOnly ? 15 : content.duration_sec || 0,
      expires_at: expires
    });
  }));

  router.get("/faqs", asyncHandler(async (request, response) => {
    const lang = requestedLang(request);
    const rows = await request.legacyDb.many("SELECT * FROM faqs WHERE active = true ORDER BY sort_order, created_at");
    response.json(rows.map((row) => localizeRecord(row, lang, ["question", "answer"])));
  }));

  router.get("/admin/faqs", requireAdmin, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM faqs ORDER BY sort_order, created_at"));
  }));

  router.post("/admin/faqs", requireAdmin, asyncHandler(async (request, response) => {
    const row = await insertRow(request.legacyDb, "faqs", {
      question: normalizeI18n(request.body.question),
      answer: normalizeI18n(request.body.answer),
      sort_order: toInteger(request.body.sort_order, 0),
      active: request.body.active !== false
    });
    response.status(201).json(row);
  }));

  router.put("/admin/faqs/:id", requireAdmin, asyncHandler(async (request, response) => {
    response.json(await updateById(request.legacyDb, "faqs", request.params.id, {
      question: request.body.question ? normalizeI18n(request.body.question) : undefined,
      answer: request.body.answer ? normalizeI18n(request.body.answer) : undefined,
      sort_order: toInteger(request.body.sort_order, undefined),
      active: request.body.active
    }));
  }));

  router.delete("/admin/faqs/:id", requireAdmin, asyncHandler(async (request, response) => {
    await deleteById(request.legacyDb, "faqs", request.params.id);
    response.json(messageResponse("deleted"));
  }));

  router.get("/recommendations", asyncHandler(async (request, response) => {
    const { limit, offset } = parseLimitOffset(request.query, 10, 10);

    response.json(await request.legacyDb.many(
      "SELECT * FROM recommendations WHERE active = true ORDER BY sort_order, created_at LIMIT $1 OFFSET $2",
      [limit, offset]
    ));
  }));

  router.post("/recommendations", requireAdmin, asyncHandler(async (request, response) => {
    requireFields(request.body, ["type", "reference_id"]);
    const row = await insertRow(request.legacyDb, "recommendations", {
      type: request.body.type,
      reference_id: request.body.reference_id,
      sort_order: toInteger(request.body.sort_order, 0),
      active: request.body.active !== false
    });
    response.status(201).json(row);
  }));

  router.get("/recommendations/personalized", requireActor, asyncHandler(async (request, response) => {
    const { limit } = parseLimitOffset(request.query, 10, 10);
    const filters = ["c.published = true"];
    const values = [];

    await appendLegacyContentVisibilityFilters(request.legacyDb, request.legacyActor, filters, values, "c");
    values.push(limit);

    const rows = await request.legacyDb.many(
      `
        SELECT DISTINCT c.*
        FROM content c
        LEFT JOIN watch_history h ON h.content_id = c.id
        WHERE ${filters.join(" AND ")}
        ORDER BY c.views_count DESC, c.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );
    response.json({ data: rows.map(serializeContent) });
  }));

  router.put("/recommendations/:id", requireAdmin, asyncHandler(async (request, response) => {
    response.json(await updateById(request.legacyDb, "recommendations", request.params.id, {
      type: request.body.type,
      reference_id: request.body.reference_id,
      sort_order: toInteger(request.body.sort_order, undefined),
      active: request.body.active
    }));
  }));

  router.delete("/recommendations/:id", requireAdmin, asyncHandler(async (request, response) => {
    await deleteById(request.legacyDb, "recommendations", request.params.id);
    response.json(messageResponse("deleted"));
  }));

  router.get("/support/chat", requireUser, asyncHandler(async (request, response) => {
    let chat = await request.legacyDb.one("SELECT * FROM support_chats WHERE user_id = $1", [request.legacyUser.id]);
    if (!chat) {
      chat = await insertRow(request.legacyDb, "support_chats", { user_id: request.legacyUser.id });
    }
    response.json(chat);
  }));

  router.get("/support/chat/messages", requireUser, asyncHandler(async (request, response) => {
    const chat = await request.legacyDb.one("SELECT * FROM support_chats WHERE user_id = $1", [request.legacyUser.id]);
    if (!chat) {
      response.json({ data: [] });
      return;
    }
    response.json({ data: await request.legacyDb.many("SELECT * FROM support_messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 50", [chat.id]) });
  }));

  router.post("/support/chat/messages", requireUser, supportUpload, asyncHandler(async (request, response) => {
    let chat = await request.legacyDb.one("SELECT * FROM support_chats WHERE user_id = $1", [request.legacyUser.id]);
    if (!chat) {
      chat = await insertRow(request.legacyDb, "support_chats", { user_id: request.legacyUser.id });
    }
    const stored = media.persistFile("support_attachment", request.file, request);
    if (stored) {
      await saveMediaAsset(request.legacyDb, stored, "support_chats", chat.id);
    }
    const body = supportMessageBody(request.body);
    assertSupportMessagePayload(body, stored);
    const message = await insertRow(request.legacyDb, "support_messages", {
      chat_id: chat.id,
      sender_id: request.legacyUser.id,
      sender_role: "user",
      body,
      attachment_path: stored?.path || null,
      attachment_url: stored?.url || null,
      attachment_name: stored?.original_name || null,
      attachment_type: stored?.mime_type || null,
      attachment_size: stored?.size || null
    });
    await updateById(request.legacyDb, "support_chats", chat.id, {
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 120),
      admin_unread_count: chat.admin_unread_count + 1
    });
    response.status(201).json(message);
  }));

  router.post("/support/chat/read", requireUser, asyncHandler(async (request, response) => {
    const chat = await request.legacyDb.one("SELECT * FROM support_chats WHERE user_id = $1", [request.legacyUser.id]);
    if (chat) {
      await updateById(request.legacyDb, "support_chats", chat.id, { user_unread_count: 0 });
    }
    response.json(messageResponse("read"));
  }));

  router.get("/support/attachments/:path", asyncHandler(async (request, response) => {
    response.sendFile(media.resolve(request.params.path));
  }));

  router.get("/admin/support/chats", requireAdmin, asyncHandler(async (request, response) => {
    const { limit, offset } = parseLimitOffset(request.query);
    const rows = await request.legacyDb.many(
      `
        SELECT sc.*, row_to_json(u.*) AS user
        FROM support_chats sc
        JOIN users u ON u.id = sc.user_id
        ORDER BY sc.last_message_at DESC NULLS LAST, sc.created_at DESC
        LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );
    response.json({ data: rows, limit, offset });
  }));

  router.get("/admin/support/chats/:id", requireAdmin, asyncHandler(async (request, response) => {
    response.json(await getById(request.legacyDb, "support_chats", request.params.id));
  }));

  router.get("/admin/support/chats/:id/messages", requireAdmin, asyncHandler(async (request, response) => {
    response.json({ data: await request.legacyDb.many("SELECT * FROM support_messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 100", [request.params.id]) });
  }));

  router.post("/admin/support/chats/:id/messages", requireAdmin, supportUpload, asyncHandler(async (request, response) => {
    const chat = await getById(request.legacyDb, "support_chats", request.params.id);
    const stored = media.persistFile("support_attachment", request.file, request);
    if (stored) {
      await saveMediaAsset(request.legacyDb, stored, "support_chats", chat.id);
    }
    const body = supportMessageBody(request.body);
    assertSupportMessagePayload(body, stored);
    const message = await insertRow(request.legacyDb, "support_messages", {
      chat_id: chat.id,
      sender_id: request.legacyUser.id,
      sender_role: "admin",
      body,
      attachment_path: stored?.path || null,
      attachment_url: stored?.url || null,
      attachment_name: stored?.original_name || null,
      attachment_type: stored?.mime_type || null,
      attachment_size: stored?.size || null
    });
    await updateById(request.legacyDb, "support_chats", chat.id, {
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 120),
      user_unread_count: chat.user_unread_count + 1
    });
    response.status(201).json(message);
  }));

  router.post("/admin/support/chats/:id/read", requireAdmin, asyncHandler(async (request, response) => {
    await updateById(request.legacyDb, "support_chats", request.params.id, { admin_unread_count: 0 });
    response.json(messageResponse("read"));
  }));

  router.get("/admin/logs", requireAdmin, asyncHandler(async (request, response) => {
    const limit = boundedInteger(request.query.limit, 200, 1000);
    const sources = availableLogSources();
    const requestedSources = parseRequestedLogSources(request.query.source);
    const selectedSources = requestedSources.includes("all")
      ? sources
      : sources.filter((source) => requestedSources.includes(source.id));

    if (selectedSources.length === 0) {
      throw legacyError(400, "unknown_log_source", "unknown log source");
    }

    const data = [];

    for (const source of selectedSources) {
      if (!source.exists) {
        continue;
      }

      for (const line of readTailLines(source.path, limit)) {
        data.push(normalizeLogLine(source, line));
      }
    }

    response.json({
      data,
      limit,
      selected_sources: selectedSources.map((source) => source.id),
      sources: sources.map((source) => ({
        id: source.id,
        label: source.label,
        exists: source.exists
      }))
    });
  }));

  router.get("/cards", requireUser, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM cards WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC", [request.legacyUser.id]));
  }));

  router.get("/admin/cards", requireAdmin, asyncHandler(async (request, response) => {
    const { limit, offset } = parseLimitOffset(request.query);
    const values = [];
    let where = "";
    if (request.query.user_id) {
      values.push(request.query.user_id);
      where = "WHERE user_id = $1";
    }
    values.push(limit, offset);
    const rows = await request.legacyDb.many(
      `SELECT * FROM cards ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const count = await request.legacyDb.one(`SELECT COUNT(*)::integer AS count FROM cards ${where}`, values.slice(0, -2));
    response.json({ data: rows, total: count.count, limit, offset });
  }));

  router.get("/users/:id/cards", requireAdmin, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM cards WHERE user_id = $1 ORDER BY created_at DESC", [request.params.id]));
  }));

  router.post("/cards", requireUser, asyncHandler(async (request, response) => {
    requireClickEnv();
    requireFields(request.body, ["pan", "expiry_month", "expiry_year"]);
    const pan = String(request.body.pan).replace(/\D/g, "");
    const maskedPan = `${pan.slice(0, 6)}******${pan.slice(-4)}`;
    const card = await insertRow(request.legacyDb, "cards", {
      user_id: request.legacyUser.id,
      provider: request.body.provider || "click",
      provider_token_hash: sha256(`${request.legacyUser.id}:${pan}:${Date.now()}`),
      masked_pan: maskedPan,
      brand: request.body.brand || "",
      holder_name: request.body.holder_name || "",
      expiry_month: toInteger(request.body.expiry_month, null),
      expiry_year: toInteger(request.body.expiry_year, null),
      verified_at: new Date().toISOString()
    });
    response.status(201).json(card);
  }));

  router.delete("/cards/:id", requireUser, asyncHandler(async (request, response) => {
    await request.legacyDb.query("DELETE FROM cards WHERE id = $1 AND user_id = $2", [request.params.id, request.legacyUser.id]);
    response.json(messageResponse("deleted"));
  }));

  router.post("/cards/:id/default", requireUser, asyncHandler(async (request, response) => {
    await request.legacyDb.query("UPDATE cards SET is_default = false WHERE user_id = $1", [request.legacyUser.id]);
    const card = await request.legacyDb.one(
      "UPDATE cards SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *",
      [request.params.id, request.legacyUser.id]
    );
    if (!card) {
      throw legacyError(404, "card_not_found", "card not found");
    }
    response.json(card);
  }));

  router.post("/payments/click/card/request", requireUser, asyncHandler(async (request, response) => {
    requireClickEnv();
    requireFields(request.body, ["pan", "expiry_month", "expiry_year"]);
    const pan = String(request.body.pan).replace(/\D/g, "");
    const card = await insertRow(request.legacyDb, "cards", {
      user_id: request.legacyUser.id,
      provider: "click",
      provider_token_hash: sha256(`${request.legacyUser.id}:${pan}:${Date.now()}`),
      masked_pan: `${pan.slice(0, 6)}******${pan.slice(-4)}`,
      holder_name: request.body.holder_name || "",
      expiry_month: toInteger(request.body.expiry_month, null),
      expiry_year: toInteger(request.body.expiry_year, null),
      is_default: false
    });
    response.json({ card_id: card.id, phone_number: request.body.phone_number || "" });
  }));

  router.post("/payments/click/card/verify", requireUser, asyncHandler(async (request, response) => {
    requireClickEnv();
    requireFields(request.body, ["card_id", "code"]);
    const card = await request.legacyDb.one(
      "UPDATE cards SET verified_at = now() WHERE id = $1 AND user_id = $2 RETURNING *",
      [request.body.card_id, request.legacyUser.id]
    );
    if (!card) {
      throw legacyError(404, "card_not_found", "card not found");
    }
    response.json(card);
  }));

  router.get("/billing/subscriptions", requireUser, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC", [request.legacyUser.id]));
  }));

  router.get("/billing/transactions", requireUser, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC", [request.legacyUser.id]));
  }));

  router.get("/admin/transactions", requireAdmin, asyncHandler(async (request, response) => {
    const { limit, offset } = parseLimitOffset(request.query);
    const values = [];
    let where = "";
    if (request.query.status) {
      values.push(request.query.status);
      where = "WHERE status = $1";
    }
    values.push(limit, offset);
    const rows = await request.legacyDb.many(
      `SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const count = await request.legacyDb.one(`SELECT COUNT(*)::integer AS count FROM transactions ${where}`, values.slice(0, -2));
    response.json({ data: rows, total: count.count, limit, offset });
  }));

  async function createCheckout(request, response, hosted = false) {
    requireClickEnv();
    requireFields(request.body, ["plan_id"]);
    const plan = await getById(request.legacyDb, "plans", request.body.plan_id);
    const transaction = await insertRow(request.legacyDb, "transactions", {
      user_id: request.legacyUser.id,
      plan_id: plan.id,
      card_id: request.body.card_id || null,
      provider: "click",
      kind: "subscription",
      status: "pending",
      amount_cents: plan.price_cents,
      currency: plan.currency,
      description: `Subscription checkout for ${plan.slug}`,
      provider_ref: `click-${Date.now()}`
    });
    response.status(201).json({
      checkout_url: `${legacyClickPaymentBaseUrl()}/checkout/${transaction.id}${hosted ? "?deeplink=1" : ""}`,
      transaction,
      subscription: null
    });
  }

  router.post("/billing/checkout", requireUser, asyncHandler((request, response) => createCheckout(request, response, false)));
  router.post("/billing/checkout/deeplink", requireUser, asyncHandler((request, response) => createCheckout(request, response, true)));

  router.post("/billing/charge/recurring", requireUser, asyncHandler(async (request, response) => {
    requireClickEnv();
    requireFields(request.body, ["card_id", "plan_id"]);
    const plan = await getById(request.legacyDb, "plans", request.body.plan_id);
    const card = await request.legacyDb.one("SELECT * FROM cards WHERE id = $1 AND user_id = $2 AND verified_at IS NOT NULL", [request.body.card_id, request.legacyUser.id]);
    if (!card) {
      throw legacyError(404, "card_not_found", "verified card not found");
    }
    const subscription = await insertRow(request.legacyDb, "subscriptions", {
      user_id: request.legacyUser.id,
      plan_id: plan.id,
      status: "active",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString()
    });
    const transaction = await insertRow(request.legacyDb, "transactions", {
      user_id: request.legacyUser.id,
      plan_id: plan.id,
      subscription_id: subscription.id,
      card_id: card.id,
      provider: "click",
      kind: "subscription",
      status: "succeeded",
      amount_cents: plan.price_cents,
      currency: plan.currency,
      processed_at: new Date().toISOString(),
      provider_ref: `click-recurring-${Date.now()}`
    });
    response.status(201).json({ subscription, transaction, checkout_url: "" });
  }));

  router.get("/payments/click/mock-pay", asyncHandler(async (request, response) => {
    if (config.env === "production") {
      throw legacyError(404, "not_found", "not found");
    }
    const tx = await updateById(request.legacyDb, "transactions", request.query.transaction_id, {
      status: "succeeded",
      processed_at: new Date().toISOString()
    });
    response.json(tx);
  }));

  router.get("/payments/click/payment/:payment_id/status", requireUser, asyncHandler(async (request, response) => {
    requireClickEnv();
    const tx = await request.legacyDb.one("SELECT * FROM transactions WHERE provider_ref = $1 OR id::text = $1", [request.params.payment_id]);
    response.json({
      paymentID: Number(request.params.payment_id) || 0,
      paymentStatus: tx?.status === "succeeded" ? 2 : 1
    });
  }));

  router.delete("/payments/click/payment/:payment_id/reversal", requireUser, asyncHandler(async (request, response) => {
    requireClickEnv();
    const tx = await request.legacyDb.one(
      "UPDATE transactions SET status = 'refunded' WHERE provider_ref = $1 OR id::text = $1 RETURNING *",
      [request.params.payment_id]
    );
    if (!tx) {
      throw legacyError(404, "transaction_not_found", "transaction not found");
    }
    response.json(tx);
  }));

  router.post("/auth/tv/init", asyncHandler(async (request, response) => {
    requireFields(request.body, ["device_name", "device_fingerprint"]);
    const code = randomCode(6);
    const expiresAt = nowPlus(5);
    const device = await insertRow(request.legacyDb, "tv_devices", {
      device_name: request.body.device_name,
      device_fingerprint: request.body.device_fingerprint,
      code,
      pairing_expires_at: expiresAt,
      status: "pending"
    });
    const qrPayload = JSON.stringify({ type: "tv_pairing", code, device_id: device.id });
    response.json({
      device_id: device.id,
      code,
      expires_at: expiresAt,
      qr_payload: qrPayload,
      qr_base64: await QRCode.toDataURL(qrPayload)
    });
  }));

  router.post("/auth/tv/confirm", requireParent, asyncHandler(async (request, response) => {
    requireFields(request.body, ["code"]);
    const device = await request.legacyDb.one(
      "UPDATE tv_devices SET parent_id = $1, status = 'confirmed', confirmed_at = now() WHERE code = $2 AND pairing_expires_at > now() RETURNING *",
      [request.legacyUser.id, request.body.code]
    );
    if (!device) {
      throw legacyError(410, "pairing_expired", "pairing code expired");
    }
    response.json(messageResponse("confirmed"));
  }));

  router.get("/auth/tv/:device_id/status", asyncHandler(async (request, response) => {
    const device = await getById(request.legacyDb, "tv_devices", request.params.device_id);

    if (device.status !== "confirmed") {
      response.json({ status: "pending", device_token: "", token_expires_at: "", profiles: null });
      return;
    }

    const children = await request.legacyDb.many("SELECT id, name, age, avatar_url FROM children WHERE parent_id = $1 AND active = true", [device.parent_id]);
    const parent = await getById(request.legacyDb, "users", device.parent_id);
    response.json({
      status: "confirmed",
      profiles: {
        parent: tokenUser(parent),
        children
      },
      ...issueTVToken(device)
    });
  }));

  router.get("/auth/tv/profiles", requireActor, asyncHandler(async (request, response) => {
    if (request.legacyActor.kind !== "tv_device") {
      throw legacyError(403, "forbidden", "TV device token is required");
    }
    const device = request.legacyActor.device;
    const children = await request.legacyDb.many("SELECT id, name, age, avatar_url FROM children WHERE parent_id = $1 AND active = true", [device.parent_id]);
    const parent = await getById(request.legacyDb, "users", device.parent_id);
    response.json({ parent: tokenUser(parent), children });
  }));

  router.post("/auth/tv/profile", requireActor, asyncHandler(async (request, response) => {
    if (request.legacyActor.kind !== "tv_device") {
      throw legacyError(403, "forbidden", "TV device token is required");
    }
    requireFields(request.body, ["child_id"]);
    const child = await request.legacyDb.one(
      "SELECT * FROM children WHERE id = $1 AND parent_id = $2 AND active = true",
      [request.body.child_id, request.legacyActor.device.parent_id]
    );
    if (!child) {
      throw legacyError(404, "child_not_found", "child not found");
    }
    const device = await updateById(request.legacyDb, "tv_devices", request.legacyActor.device.id, {
      current_child_id: child.id,
      last_seen_at: new Date().toISOString()
    });
    response.json({
      child,
      ...issueTVToken(device)
    });
  }));

  router.get("/tv-devices", requireParent, asyncHandler(async (request, response) => {
    response.json(await request.legacyDb.many("SELECT * FROM tv_devices WHERE parent_id = $1 ORDER BY created_at DESC", [request.legacyUser.id]));
  }));

  router.delete("/tv-devices/:id", requireParent, asyncHandler(async (request, response) => {
    await request.legacyDb.query("UPDATE tv_devices SET revoked_at = now() WHERE id = $1 AND parent_id = $2", [request.params.id, request.legacyUser.id]);
    response.json(messageResponse("revoked"));
  }));

  router.get(/^\/support\/attachments\/(.+)/, asyncHandler(async (request, response) => {
    response.sendFile(media.resolve(request.params[0]));
  }));

  router.get(/^\/media\/(.+)/, asyncHandler(async (request, response) => {
    const storedPath = request.params[0];
    media.verify(storedPath, request.query.expires, request.query.signature);
    response.sendFile(media.resolve(storedPath));
  }));

  router.use(legacyErrorMiddleware);

  return router;
}

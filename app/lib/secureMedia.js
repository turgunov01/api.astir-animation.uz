import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Signed, expiring links for video: HLS streams, original uploads, audio
// tracks and subtitles. The token sits in the URL *path*
// (/media/s/<expires>.<mode>.<signature>/hls/<id>/master.m3u8) so the
// relative segment URIs inside playlists inherit it without rewriting.
//
// mode "full"    — the whole stream;
// mode "preview" — media playlists are cut after PREVIEW_SECONDS and later
//                  segments are refused, so a locked premium title can only
//                  be watched as a preview no matter what the client does.

export const PREVIEW_SECONDS = 15;
const SIGNED_PREFIX = "s/";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".m3u8", ".ts", ".m4s", ".aac", ".m4a", ".mp3", ".wav", ".vtt"]);
const SEGMENT_EXTENSIONS = new Set([".ts", ".m4s", ".aac", ".m4a", ".mp4", ".vtt"]);

// Where video lives; images (posters, avatars, chat files) stay public.
export function isProtectedMediaPath(relativePath) {
  const rel = String(relativePath || "").replace(/^\/+/, "");
  if (!rel || rel.startsWith(SIGNED_PREFIX)) return false;
  if (rel.startsWith("hls/") || rel.startsWith("legacy/streaming/") || rel.startsWith("legacy/videos/")) return true;
  return rel.startsWith("uploads/") && VIDEO_EXTENSIONS.has(path.extname(rel).toLowerCase());
}

// The part of the media tree one token unlocks: a whole stream folder, or a
// single file.
export function signingScope(relativePath) {
  const rel = String(relativePath || "").replace(/^\/+/, "");
  const stream = /^(hls\/[^/]+\/|legacy\/streaming\/[^/]+\/)/.exec(rel);
  return stream ? stream[1] : rel;
}

function signature(secret, scope, expires, mode) {
  return crypto.createHmac("sha256", secret).update(`${scope}|${expires}|${mode}`).digest("base64url").slice(0, 32);
}

export function createSecureMedia({ secret, mediaRoot, ttlSeconds = 12 * 60 * 60, now = () => Date.now() }) {
  const root = path.resolve(mediaRoot);
  const allowedCache = new Map();

  function signPath(relativePath, { mode = "full", ttl = ttlSeconds } = {}) {
    const rel = String(relativePath).replace(/^\/+/, "");
    const expires = Math.floor(now() / 1000) + ttl;
    const token = `${expires}.${mode}.${signature(secret, signingScope(rel), expires, mode)}`;
    return `/media/${SIGNED_PREFIX}${token}/${rel}`;
  }

  // Rewrites every video link in a response (any depth). Links may be
  // relative (/media/...) or absolute (https://host/media/...). Inside an
  // object marked subscription_required / preview_only links are preview
  // links; elsewhere they give the full stream.
  function signTree(value, mode = "full") {
    if (typeof value === "string") {
      const match = /^(https?:\/\/[^/]+)?\/media\/([^?#]+)(.*)$/.exec(value);
      if (!match || !isProtectedMediaPath(match[2])) return value;
      return `${match[1] || ""}${signPath(match[2], { mode })}${match[3] || ""}`;
    }
    if (Array.isArray(value)) return value.map((item) => signTree(item, mode));
    if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      const ownMode = value.subscription_required === true || value.preview_only === true ? "preview" : mode;
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, signTree(item, ownMode)]));
    }
    return value;
  }

  // Express middleware: every JSON response leaves with signed video links.
  function signJsonResponses(request, response, next) {
    const json = response.json.bind(response);
    response.json = (body) => json(signTree(body));
    next();
  }

  function verify(token, relativePath) {
    const [expiresRaw, mode, provided] = String(token || "").split(".");
    const expires = Number(expiresRaw);
    if (!["full", "preview"].includes(mode) || !Number.isFinite(expires) || !provided) return { ok: false, reason: "invalid" };
    if (expires < Math.floor(now() / 1000)) return { ok: false, reason: "expired" };
    const expected = signature(secret, signingScope(relativePath), expires, mode);
    const valid = expected.length === provided.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    return valid ? { ok: true, mode } : { ok: false, reason: "invalid" };
  }

  function absolute(relativePath) {
    const resolved = path.resolve(root, relativePath);
    return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
  }

  // Keeps the media playlist up to PREVIEW_SECONDS and ends it there.
  function previewPlaylist(text) {
    if (!text.includes("#EXTINF")) return text; // a master playlist
    const out = [];
    let seconds = 0;
    let pendingDuration = null;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("#EXT-X-ENDLIST")) continue;
      if (line.startsWith("#EXTINF:")) {
        if (seconds >= PREVIEW_SECONDS) break;
        pendingDuration = Number.parseFloat(line.slice(8)) || 0;
        out.push(line);
        continue;
      }
      if (line && !line.startsWith("#") && pendingDuration !== null) {
        out.push(line);
        seconds += pendingDuration;
        pendingDuration = null;
        continue;
      }
      if (seconds < PREVIEW_SECONDS || line.startsWith("#EXT-X-MAP")) out.push(line);
    }
    while (out.length && !out[out.length - 1]) out.pop();
    out.push("#EXT-X-ENDLIST", "");
    return out.join("\n");
  }

  // Segment files a preview may load in this folder, from its playlists.
  function previewSegments(directory) {
    const playlists = fs.readdirSync(directory).filter((name) => name.endsWith(".m3u8"));
    const stamp = playlists.map((name) => fs.statSync(path.join(directory, name)).mtimeMs).join(",");
    const cached = allowedCache.get(directory);
    if (cached?.stamp === stamp) return cached.allowed;

    const allowed = new Set();
    for (const name of playlists) {
      const text = previewPlaylist(fs.readFileSync(path.join(directory, name), "utf8"));
      for (const line of text.split(/\r?\n/)) {
        const map = /#EXT-X-MAP:.*URI="([^"]+)"/.exec(line);
        if (map) allowed.add(map[1]);
        else if (line && !line.startsWith("#")) allowed.add(line.split("?")[0]);
      }
    }
    allowedCache.set(directory, { stamp, allowed });
    return allowed;
  }

  // Express handler for /media/s/<token>/<path>.
  function handler(request, response, next) {
    const match = /^\/s\/([^/]+)\/(.+)$/.exec(request.path);
    if (!match) return next();
    const [, token, encodedPath] = match;
    let relativePath;
    try {
      relativePath = decodeURIComponent(encodedPath);
    } catch {
      return response.status(400).json({ code: "invalid_media_path" });
    }

    const check = verify(token, relativePath);
    if (!check.ok) {
      return response.status(403).json({ code: check.reason === "expired" ? "media_url_expired" : "invalid_media_signature" });
    }

    const file = absolute(relativePath);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return response.status(404).json({ code: "media_not_found" });
    }

    response.set("Cache-Control", "private, max-age=300");
    const extension = path.extname(file).toLowerCase();

    if (check.mode === "preview") {
      if (extension === ".m3u8") {
        response.type("application/vnd.apple.mpegurl");
        return response.send(previewPlaylist(fs.readFileSync(file, "utf8")));
      }
      const inStream = signingScope(relativePath) !== relativePath;
      if (!inStream || !SEGMENT_EXTENSIONS.has(extension) || !previewSegments(path.dirname(file)).has(path.basename(file))) {
        return response.status(403).json({ code: "subscription_required" });
      }
    }

    if (extension === ".m3u8") response.type("application/vnd.apple.mpegurl");
    return response.sendFile(file);
  }

  // Blocks the open /media mount for video, so only signed links work.
  function guard(request, response, next) {
    let relativePath = request.path;
    try {
      relativePath = decodeURIComponent(relativePath);
    } catch {
      // keep the raw path
    }
    if (isProtectedMediaPath(relativePath)) {
      return response.status(403).json({ code: "media_signature_required" });
    }
    return next();
  }

  return { signPath, signTree, signJsonResponses, verify, handler, guard, previewPlaylist };
}

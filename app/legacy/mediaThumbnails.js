import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// On-demand, cached image thumbnails served at /media-thumb/<same-path-as-/media>.
// Uses the ffmpeg binary the project already depends on (no new dependency) to
// downscale posters so list views load tiny images instead of full-resolution
// originals. Thumbnails are generated on first request and cached to disk, so
// this also covers already-uploaded content with no backfill.

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 32;
const MAX_WIDTH = 640;
const CACHE_DIR_NAME = ".thumbs";

function clampWidth(value) {
  const width = Math.round(Number(value) || DEFAULT_WIDTH);
  if (!Number.isFinite(width)) return DEFAULT_WIDTH;
  return Math.min(Math.max(width, MIN_WIDTH), MAX_WIDTH);
}

function resizeWithFfmpeg(ffmpegPath, source, width, destination) {
  return new Promise((resolve, reject) => {
    // scale=w:-2 keeps aspect ratio with an even height (required by some encoders).
    const args = ["-loglevel", "error", "-i", source, "-vf", `scale=${width}:-2`, "-y", destination];
    const child = spawn(ffmpegPath, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });
}

export function createMediaThumbnailHandler({ mediaRoot, ffmpegPath = "ffmpeg" } = {}) {
  const root = path.resolve(mediaRoot || "media");
  const cacheRoot = path.join(root, CACHE_DIR_NAME);
  const inFlight = new Map();

  async function ensureThumbnail(source, width, cachePath) {
    const key = cachePath;
    if (inFlight.has(key)) return inFlight.get(key);

    const task = (async () => {
      await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
      await resizeWithFfmpeg(ffmpegPath, source, width, cachePath);
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, task);
    return task;
  }

  return async function mediaThumbnailHandler(request, response) {
    try {
      const relativePath = decodeURIComponent(String(request.path || "").replace(/^\/+/, ""));
      if (!relativePath) {
        response.status(400).end();
        return;
      }

      const source = path.resolve(root, relativePath);

      // Path-traversal guard: never resolve outside the media root.
      if (source !== root && !source.startsWith(root + path.sep)) {
        response.status(400).end();
        return;
      }

      const extension = path.extname(source).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        // Not a thumbnailable image: serve the original file if it exists.
        response.sendFile(source, (error) => {
          if (error) response.status(404).end();
        });
        return;
      }

      const width = clampWidth(request.query.w);
      const cachePath = path.join(cacheRoot, String(width), `${relativePath}.jpg`);

      response.setHeader("Cache-Control", "public, max-age=86400");

      if (!fs.existsSync(cachePath)) {
        if (!fs.existsSync(source)) {
          response.status(404).end();
          return;
        }
        await ensureThumbnail(source, width, cachePath);
      }

      response.sendFile(cachePath, (error) => {
        if (error) {
          // Cache write/serve failed: fall back to the original so posters still show.
          response.sendFile(source, (fallbackError) => {
            if (fallbackError) response.status(404).end();
          });
        }
      });
    } catch {
      response.status(404).end();
    }
  };
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { hmac, legacyError } from "./utils.js";

function safeName(fileName) {
  const extension = path.extname(fileName || "").toLowerCase() || ".bin";

  return `${Date.now()}-${crypto.randomUUID()}${extension}`;
}

function relativePath(root, absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, "/");
}

export function createLegacyMedia({ mediaRoot, signingSecret }) {
  const root = path.resolve(mediaRoot || process.env.MEDIA_ROOT || "media", "legacy");
  fs.mkdirSync(root, { recursive: true });

  function absoluteStoredPath(storedPath) {
    const absolutePath = path.resolve(root, storedPath || "");
    const relative = path.relative(root, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw legacyError(403, "invalid_media_path", "invalid media path");
    }

    return absolutePath;
  }

  function storageFor(kind) {
    const destination = path.join(root, kind);
    fs.mkdirSync(destination, { recursive: true });

    return multer.diskStorage({
      destination(request, file, callback) {
        callback(null, destination);
      },
      filename(request, file, callback) {
        callback(null, safeName(file.originalname));
      }
    });
  }

  function upload(kind, options = {}) {
    return multer({
      storage: storageFor(kind),
      limits: {
        fileSize: (options.maxMb || 2048) * 1024 * 1024
      }
    });
  }

  function publicUrl(request, storedPath) {
    if (!storedPath) {
      return "";
    }

    const expires = Math.floor(Date.now() / 1000) + 3600;

    return `${request.protocol}://${request.get("host")}/api/v1/media/${encodeURIComponent(storedPath)}?expires=${expires}&signature=${sign(storedPath, expires)}`;
  }

  function persistFile(kind, file, request) {
    if (!file) {
      return null;
    }

    const storedPath = relativePath(root, file.path);

    return {
      path: storedPath,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      url: publicUrl(request, storedPath),
      kind
    };
  }

  function sign(storedPath, expires) {
    if (!signingSecret) {
      return "";
    }

    return hmac(`${storedPath}:${expires}`, signingSecret);
  }

  function verify(storedPath, expires, signature) {
    if (!signingSecret) {
      throw legacyError(503, "media_signing_unavailable", "MEDIA_SIGNING_SECRET is required");
    }

    const expiresAt = Number(expires);

    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      throw legacyError(403, "media_url_expired", "media URL expired");
    }

    const expected = sign(storedPath, expiresAt);
    const actual = String(signature || "");

    if (
      expected.length !== actual.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    ) {
      throw legacyError(403, "invalid_media_signature", "invalid media signature");
    }
  }

  function resolve(storedPath) {
    const absolutePath = absoluteStoredPath(storedPath);

    if (!fs.existsSync(absolutePath)) {
      throw legacyError(404, "media_not_found", "media not found");
    }

    return absolutePath;
  }

  function remove(storedPath) {
    if (!storedPath) {
      return false;
    }

    const absolutePath = absoluteStoredPath(storedPath);

    if (absolutePath === root) {
      throw legacyError(403, "invalid_media_path", "invalid media path");
    }

    fs.rmSync(absolutePath, { recursive: true, force: true });
    return true;
  }

  return {
    remove,
    root,
    persistFile,
    publicUrl,
    resolve,
    sign,
    upload,
    verify
  };
}

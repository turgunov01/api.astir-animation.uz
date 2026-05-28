import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";

function safeExtension(fileName) {
  const extension = path.extname(fileName || "").toLowerCase();

  return extension || ".bin";
}

export function createUploadMiddleware(config) {
  const uploadDir = path.resolve(config.mediaRoot, "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination(request, file, callback) {
      callback(null, uploadDir);
    },
    filename(request, file, callback) {
      const fileName = `${Date.now()}-${crypto.randomUUID()}${safeExtension(file.originalname)}`;
      callback(null, fileName);
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: config.maxVideoUploadMb * 1024 * 1024
    },
    fileFilter(request, file, callback) {
      if (!file.mimetype.startsWith("video/")) {
        callback(new Error("Only video files are allowed"));
        return;
      }

      callback(null, true);
    }
  });
}

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
      if (file.fieldname === "video" && !file.mimetype.startsWith("video/")) {
        callback(new Error("Only video files are allowed"));
        return;
      }

      if (["icon", "poster", "file"].includes(file.fieldname) && !file.mimetype.startsWith("image/")) {
        callback(new Error("Only image files are allowed"));
        return;
      }

      if (!["video", "icon", "poster", "file"].includes(file.fieldname)) {
        callback(new Error("Unsupported upload field"));
        return;
      }

      callback(null, true);
    }
  });
}

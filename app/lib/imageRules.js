import fs from "node:fs";
import { badRequest } from "./errors.js";

// Upload rules for artwork shown in the apps. Banners/posters are rendered in
// 16:9 cards (home rail, recommendations, detail header) and category icons in
// square tiles, so anything else ends up cropped or stretched.
export const IMAGE_RULES = {
  banner: {
    label: "Баннер",
    ratio: 16 / 9,
    ratioLabel: "16:9",
    minWidth: 1280,
    minHeight: 720,
    recommended: "1920×1080",
    // No size limit for posters/banners (only the upload limit applies).
    maxBytes: null
  },
  icon: {
    label: "Иконка",
    ratio: 1,
    ratioLabel: "1:1",
    minWidth: 256,
    minHeight: 256,
    recommended: "512×512",
    maxBytes: 1024 * 1024
  }
};

const RATIO_TOLERANCE = 0.03;

function readHeader(filePath, bytes = 64 * 1024) {
  const handle = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(handle, buffer, 0, bytes, 0);

    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(handle);
  }
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }

  return { format: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);

    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { format: "jpeg", width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }

    offset += 2 + length;
  }

  return null;
}

function webpSize(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const chunk = buffer.toString("ascii", 12, 16);

  if (chunk === "VP8 ") {
    return { format: "webp", width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }

  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);

    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (chunk === "VP8X") {
    return { format: "webp", width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }

  return null;
}

export function readImageInfo(filePath) {
  const buffer = readHeader(filePath);

  return pngSize(buffer) || jpegSize(buffer) || webpSize(buffer);
}

// Returns a human-readable problem (Russian, shown in the admin dashboard) or null.
export function imageProblem(file, ruleName) {
  const rule = IMAGE_RULES[ruleName];
  const info = file?.path ? readImageInfo(file.path) : null;
  const sizeNote = rule.maxBytes ? ` до ${Math.round(rule.maxBytes / 1024 / 1024) || 1} МБ` : "";
  const hint = `Нужно ${rule.ratioLabel}, рекомендуем ${rule.recommended} (JPG, PNG или WebP${sizeNote}).`;

  if (!info) {
    return `${rule.label}: поддерживаются только JPG, PNG и WebP. ${hint}`;
  }

  if (rule.maxBytes && file.size > rule.maxBytes) {
    return `${rule.label}: файл ${(file.size / 1024 / 1024).toFixed(1)} МБ — слишком большой. ${hint}`;
  }

  if (Math.abs(info.width / info.height - rule.ratio) / rule.ratio > RATIO_TOLERANCE) {
    return `${rule.label}: ${info.width}×${info.height} — неправильные пропорции. ${hint}`;
  }

  if (info.width < rule.minWidth || info.height < rule.minHeight) {
    return `${rule.label}: ${info.width}×${info.height} — слишком маленькое, минимум ${rule.minWidth}×${rule.minHeight}. ${hint}`;
  }

  return null;
}

function requestFiles(request) {
  const files = request.file ? [request.file] : [];

  for (const value of Object.values(request.files || {})) {
    if (Array.isArray(value)) {
      files.push(...value);
    }
  }

  return files;
}

// Express middleware placed right after multer. `fieldRules` maps upload field
// names to IMAGE_RULES keys; fields not listed (e.g. "video") are ignored.
// On failure every uploaded file of the request is removed from disk.
export function validateImageUploads(fieldRules, { toError = (message) => badRequest(message, "IMAGE_INVALID") } = {}) {
  return (request, response, next) => {
    const files = requestFiles(request);

    for (const file of files) {
      const ruleName = fieldRules[file.fieldname];
      const problem = ruleName ? imageProblem(file, ruleName) : null;

      if (problem) {
        for (const uploaded of files) {
          fs.rmSync(uploaded.path, { force: true });
        }

        next(toError(problem));
        return;
      }
    }

    next();
  };
}

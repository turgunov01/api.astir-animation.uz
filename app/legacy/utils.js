import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

export class LegacyError extends Error {
  constructor(statusCode, error, message = error) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
  }
}

export function legacyError(statusCode, error, message = error) {
  return new LegacyError(statusCode, error, message);
}

export function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

export function randomCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  return String(crypto.randomInt(min, max + 1));
}

export function randomAlphaNumericCode(length = 32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return code;
}

export function publicId() {
  return randomUUID();
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function parseLimitOffset(query, defaultLimit = 20, maxLimit = 200) {
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit || defaultLimit, 10) || defaultLimit, 1),
    maxLimit
  );
  const offset = Math.max(Number.parseInt(query.offset || 0, 10) || 0, 0);

  return { limit, offset };
}

export function slugify(value, fallback = "item") {
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

  return slug || `${fallback}-${randomUUID().slice(0, 8)}`;
}

export function i18n(value, fallback = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      uz: String(value.uz || value.en || value.ru || fallback),
      ru: String(value.ru || value.en || value.uz || fallback),
      en: String(value.en || value.ru || value.uz || fallback)
    };
  }

  if (value === "invalid credentials") {
    return {
      uz: "Email yoki parol noto'g'ri. Iltimos, qayta tekshiring.",
      ru: "Неверный email или пароль. Пожалуйста, проверьте данные.",
      en: "Incorrect email or password. Please check your credentials."
    };
  }

  if (value === "email already exists") {
    return {
      uz: "Bu email bilan akkaunt allaqachon mavjud.",
      ru: "Account with this email already exists.",
      en: "An account with this email already exists."
    };
  }

  if (value === "not found") {
    return {
      uz: "So'ralgan ma'lumot topilmadi.",
      ru: "Запрашиваемые данные не найдены.",
      en: "The requested resource was not found."
    };
  }

  if (value === "missing bearer token") {
    return {
      uz: "Kirish uchun avtorizatsiya tokeni talab qilinadi. Iltimos, tizimga kiring.",
      ru: "Для доступа необходим токен авторизации. Пожалуйста, войдите в систему.",
      en: "An authorization token is required. Please sign in to continue."
    };
  }

  if (value === "invalid device_id") {
    return {
      uz: "Identifikator formati noto'g'ri.",
      ru: "Неверный формат идентификатора.",
      en: "The identifier format is invalid."
    };
  }

  if (value === "invalid child_id") {
    return {
      uz: "Identifikator formati noto'g'ri.",
      ru: "Неверный формат идентификатора.",
      en: "The identifier format is invalid."
    };
  }

  if (value === "invalid ticket_id") {
    return {
      uz: "Identifikator formati noto'g'ri.",
      ru: "Неверный формат идентификатора.",
      en: "The identifier format is invalid."
    };
  }

  if (value === "invalid rule_id") {
    return {
      uz: "Identifikator formati noto'g'ri.",
      ru: "Неверный формат идентификатора.",
      en: "The identifier format is invalid."
    };
  }

  return {
    uz: String(value || fallback),
    ru: String(value || fallback),
    en: String(value || fallback)
  };
}

export function requestedLang(request) {
  const queryLang = request.query?.lang;

  if (["uz", "ru", "en"].includes(queryLang)) {
    return queryLang;
  }

  const header = request.get?.("accept-language") || "";
  const first = header.split(",")[0]?.trim()?.slice(0, 2);

  return ["uz", "ru", "en"].includes(first) ? first : null;
}

export function localizeRecord(record, lang, fields = ["title", "description", "name", "question", "answer"]) {
  if (!record || !lang) {
    return record;
  }

  const localized = { ...record };

  for (const field of fields) {
    if (localized[field] && typeof localized[field] === "object" && !Array.isArray(localized[field])) {
      localized[field] = localized[field][lang] || localized[field].en || localized[field].ru || localized[field].uz || "";
    }
  }

  if (Array.isArray(localized.tags)) {
    localized.tags = localized.tags.map((tag) => localizeRecord(tag, lang, ["name"]));
  }

  return localized;
}

export function parseJsonBodyField(value, fallback = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw legacyError(400, "invalid_json", "invalid JSON field");
    }
  }

  return value;
}

export function requireFields(body, fields) {
  for (const field of fields) {
    if (body?.[field] === undefined || body?.[field] === null || body?.[field] === "") {
      throw legacyError(400, `${field} is required`);
    }
  }
}

export function toInteger(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw legacyError(400, "invalid integer");
  }

  return number;
}

export function buildUpdate(table, id, attributes) {
  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    throw legacyError(400, "nothing to update");
  }

  const sets = entries.map(([key], index) => `${key} = $${index + 2}`);
  const values = entries.map(([, value]) => value);

  return {
    sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    values: [id, ...values]
  };
}

export function legacyErrorMiddleware(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof LegacyError) {
    response.status(error.statusCode).json({
      error: error.error,
      code: error.error,
      statusCode: error.statusCode,
      message: i18n(error.message)
    });
    return;
  }

  response.status(500).json({
    error: "internal_error",
    message: i18n(error.message || "Internal server error")
  });
}

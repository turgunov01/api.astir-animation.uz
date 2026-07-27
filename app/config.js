import "dotenv/config";

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function optionalNumber(value, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

// Values that are safe to run locally but must never sign production tokens.
const KNOWN_WEAK_JWT_SECRETS = new Set([
  "astir-local-development-secret",
  "astir-development-secret",
  "astir-insecure-dev-only-secret",
  "change-this-secret",
  "changeme",
  "secret"
]);

function envList(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveJwtSecret() {
  const provided = process.env.JWT_SECRET || "";
  if (provided) {
    return provided;
  }

  // Outside production, fall back to an obviously-insecure dev secret so the app
  // still runs locally. In production, leave it empty so assertSecureConfig()
  // refuses to boot instead of silently signing tokens with a public key.
  return isProduction ? "" : "astir-insecure-dev-only-secret";
}

export const config = {
  env,
  isProduction,
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 2048),
  // Auth cannot be disabled in production, regardless of the env flag.
  requireAuth: isProduction ? true : parseBoolean(process.env.REQUIRE_AUTH, true),
  jwtSecret: resolveJwtSecret(),
  parentTokenTtl: process.env.PARENT_TOKEN_TTL || "7d",
  deviceTokenTtl: process.env.DEVICE_TOKEN_TTL || "365d",
  pairingTtlMinutes: Number(process.env.PAIRING_TTL_MINUTES || 5),
  dataFile: process.env.DATA_FILE || "data/store.json",
  contentStorage: process.env.CONTENT_STORAGE || (process.env.DATABASE_URL ? "postgres" : "json"),
  databaseUrl: process.env.DATABASE_URL || "",
  mediaRoot: process.env.MEDIA_ROOT || "media",
  maxVideoUploadMb: Number(process.env.MAX_VIDEO_UPLOAD_MB || 8192),
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH || "ffprobe",
  transcoderEnabled: parseBoolean(process.env.TRANSCODER_ENABLED, true),
  cors: {
    // Comma-separated allow-list. Empty => permissive (dev only; warned in prod).
    origins: [...new Set([...envList("CORS_ORIGINS"), ...envList("CORS_ORIGIN")])]
  },
  media: {
    // Reserved flag for enforcing the HMAC signed-URL scheme on /media. Not yet
    // wired into server.js (see security/findings.md #4 — needs client support).
    requireSignedUrls: parseBoolean(process.env.MEDIA_REQUIRE_SIGNED_URLS, false)
  },
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
  // Debug/default OTP bypasses are force-disabled in production.
  otpDefaultCode: isProduction ? "" : (process.env.OTP_DEFAULT_CODE || ""),
  otpDebug: isProduction ? false : parseBoolean(process.env.OTP_DEBUG, false),
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || ""
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "",
    apiUrl: process.env.FIREBASE_API_URL || ""
  },
  notifications: {
    childAppOpenCooldownSeconds: optionalNumber(process.env.CHILD_APP_OPEN_NOTIFICATION_COOLDOWN_SECONDS, 300)
  },
  click: {
    paymentUrl: process.env.CLICK_PAYMENT_URL || process.env.CLICK_BASE_URL || "https://my.click.uz/services/pay",
    merchantId: process.env.CLICK_MERCHANT_ID || "",
    merchantUserId: process.env.CLICK_MERCHANT_USER_ID || "",
    serviceId: process.env.CLICK_SERVICE_ID || "",
    secretKey: process.env.CLICK_SECRET_KEY || "",
    returnUrl: process.env.CLICK_RETURN_URL || "",
    defaultSubscriptionDays: optionalNumber(process.env.CLICK_DEFAULT_SUBSCRIPTION_DAYS, 30)
  }
};

// Fail fast on an insecure production configuration. Call this once at startup
// (see app/server.js). It throws on hard problems and warns on soft ones.
export function assertSecureConfig() {
  const problems = [];
  const providedJwt = process.env.JWT_SECRET || "";

  if (isProduction) {
    if (!providedJwt) {
      problems.push("JWT_SECRET is not set");
    } else if (KNOWN_WEAK_JWT_SECRETS.has(providedJwt) || providedJwt.length < 32) {
      problems.push("JWT_SECRET is weak — use a random value of at least 32 characters");
    }

    if (parseBoolean(process.env.REQUIRE_AUTH, true) === false) {
      problems.push("REQUIRE_AUTH=false is not allowed in production");
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start with an insecure configuration:\n- ${problems.join("\n- ")}`
    );
  }

  if (isProduction && config.cors.origins.length === 0) {
    process.emitWarning(
      "CORS_ORIGINS is not set — the API accepts requests from any origin. Set an allow-list.",
      "SecurityWarning"
    );
  }

  if (isProduction && process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    process.emitWarning(
      "DATABASE_SSL_REJECT_UNAUTHORIZED=false disables DB certificate validation (MITM risk).",
      "SecurityWarning"
    );
  }

  if (!isProduction && (!providedJwt || KNOWN_WEAK_JWT_SECRETS.has(providedJwt))) {
    process.emitWarning(
      "Using an insecure development JWT secret. Set a strong JWT_SECRET before deploying.",
      "SecurityWarning"
    );
  }
}

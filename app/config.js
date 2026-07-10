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

export const config = {
  env: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 2048),
  requireAuth: parseBoolean(process.env.REQUIRE_AUTH, true),
  jwtSecret: process.env.JWT_SECRET || "astir-local-development-secret",
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
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
  otpDefaultCode: process.env.OTP_DEFAULT_CODE || "",
  otpDebug: parseBoolean(process.env.OTP_DEBUG, false),
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

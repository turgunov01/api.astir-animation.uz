import "dotenv/config";

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
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
  maxVideoUploadMb: Number(process.env.MAX_VIDEO_UPLOAD_MB || 2048),
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
  }
};

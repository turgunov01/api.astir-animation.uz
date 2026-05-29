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
  mediaRoot: process.env.MEDIA_ROOT || "media",
  maxVideoUploadMb: Number(process.env.MAX_VIDEO_UPLOAD_MB || 2048),
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  transcoderEnabled: parseBoolean(process.env.TRANSCODER_ENABLED, true)
};

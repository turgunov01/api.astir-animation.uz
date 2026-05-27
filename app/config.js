export const config = {
  env: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "astir-local-development-secret",
  parentTokenTtl: process.env.PARENT_TOKEN_TTL || "7d",
  deviceTokenTtl: process.env.DEVICE_TOKEN_TTL || "365d",
  pairingTtlMinutes: Number(process.env.PAIRING_TTL_MINUTES || 5),
  dataFile: process.env.DATA_FILE || "data/store.json"
};

import crypto from "node:crypto";

const keyLength = 64;

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(secret, salt, keyLength).toString("hex");

  return `scrypt$${salt}$${hash}`;
}

export function verifySecret(secret, storedHash) {
  const [scheme, salt, hash] = String(storedHash || "").split("$");

  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(secret, salt, keyLength);

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
}

export function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

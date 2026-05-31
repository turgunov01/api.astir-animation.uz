import { createRemoteJWKSet, jwtVerify } from "jose";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { hashSecret, verifySecret } from "../lib/security.js";
import {
  legacyError,
  randomCode,
  sha256,
  i18n,
  requireFields
} from "./utils.js";

const accessTtlSeconds = 15 * 60;
const refreshTtlSeconds = 30 * 24 * 60 * 60;
const deviceTtlSeconds = 365 * 24 * 60 * 60;

function jwtSecret() {
  return process.env.JWT_SECRET || "astir-local-development-secret";
}

function envList(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isoFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function bearerToken(request) {
  const header = request.get("authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw legacyError(401, "missing bearer token", "missing bearer token");
  }

  return token;
}

function serializeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    last_name: user.last_name,
    phone: user.phone,
    role: user.role,
    active: user.active,
    avatar_url: user.avatar_url || "",
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

async function storeRefreshToken(db, userId, refreshToken) {
  const expiresAt = isoFromNow(refreshTtlSeconds);

  await db.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, sha256(refreshToken), expiresAt]
  );

  return expiresAt;
}

export async function issueTokenPair(db, user) {
  const accessExpiresAt = isoFromNow(accessTtlSeconds);
  const accessToken = jwt.sign(
    {
      sub: user.id,
      user_id: user.id,
      role: user.role,
      kind: "user"
    },
    jwtSecret(),
    { expiresIn: accessTtlSeconds }
  );
  const refreshToken = jwt.sign(
    {
      sub: user.id,
      user_id: user.id,
      kind: "refresh"
    },
    jwtSecret(),
    { expiresIn: refreshTtlSeconds }
  );
  const refreshExpiresAt = await storeRefreshToken(db, user.id, refreshToken);

  return {
    access_token: accessToken,
    access_expires_at: accessExpiresAt,
    refresh_token: refreshToken,
    refresh_expires_at: refreshExpiresAt,
    user: serializeUser(user)
  };
}

export function issueDeviceToken(device, child = null) {
  const tokenExpiresAt = isoFromNow(deviceTtlSeconds);
  const accessToken = jwt.sign(
    {
      sub: device.id,
      kind: "child_device",
      device_id: device.id,
      child_id: device.child_id,
      parent_id: child?.parent_id || null
    },
    jwtSecret(),
    { expiresIn: deviceTtlSeconds }
  );
  const refreshToken = jwt.sign(
    {
      sub: device.id,
      kind: "child_device_refresh",
      device_id: device.id,
      child_id: device.child_id
    },
    jwtSecret(),
    { expiresIn: deviceTtlSeconds }
  );

  return {
    access_token: accessToken,
    expires_at: tokenExpiresAt,
    refresh_token: refreshToken,
    refresh_expires_at: tokenExpiresAt
  };
}

export function issueTVToken(device) {
  const tokenExpiresAt = isoFromNow(deviceTtlSeconds);
  const deviceToken = jwt.sign(
    {
      sub: device.id,
      kind: "tv_device",
      tv_device_id: device.id,
      parent_id: device.parent_id,
      child_id: device.current_child_id || null
    },
    jwtSecret(),
    { expiresIn: deviceTtlSeconds }
  );

  return {
    device_token: deviceToken,
    token_expires_at: tokenExpiresAt
  };
}

export async function createOtp(db, email, purpose = "login") {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) {
    throw legacyError(503, "smtp_unavailable", "SMTP configuration is required");
  }

  const code = randomCode(6);
  const expiresAt = isoFromNow(10 * 60);
  await db.query(
    "INSERT INTO otp_codes (email, code_hash, purpose, expires_at) VALUES ($1, $2, $3, $4)",
    [email.toLowerCase(), hashSecret(code), purpose, expiresAt]
  );

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Astir verification code",
    text: `Your Astir verification code is ${code}. It expires in 10 minutes.`
  });

  return {
    email,
    expires_at: expiresAt,
    debug_code: process.env.LEGACY_OTP_DEBUG === "true" ? code : ""
  };
}

export async function verifyOtp(db, email, code) {
  const result = await db.query(
    `
      SELECT * FROM otp_codes
      WHERE email = $1 AND verified_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [email.toLowerCase()]
  );

  const otp = result.rows.find((row) => verifySecret(code, row.code_hash));

  if (!otp) {
    throw legacyError(401, "invalid credentials", "invalid credentials");
  }

  await db.query("UPDATE otp_codes SET verified_at = now() WHERE id = $1", [otp.id]);

  return otp;
}

export async function authenticateRequest(request) {
  const token = bearerToken(request);
  let payload;

  try {
    payload = jwt.verify(token, jwtSecret());
  } catch {
    throw legacyError(401, "unauthorized", "invalid or expired token");
  }

  if (payload.kind === "user") {
    const user = await request.legacyDb.one("SELECT * FROM users WHERE id = $1 AND active = true", [payload.user_id]);

    if (!user) {
      throw legacyError(401, "unauthorized", "user not found");
    }

    request.legacyUser = user;
    request.legacyActor = {
      kind: "user",
      user,
      id: user.id,
      role: user.role
    };
    return request.legacyActor;
  }

  if (payload.kind === "child_device") {
    const device = await request.legacyDb.one(
      "SELECT * FROM child_devices WHERE id = $1 AND revoked_at IS NULL",
      [payload.device_id]
    );

    if (!device) {
      throw legacyError(401, "unauthorized", "device not found");
    }

    request.legacyActor = {
      kind: "child_device",
      device,
      id: device.id,
      child_id: device.child_id
    };
    return request.legacyActor;
  }

  if (payload.kind === "tv_device") {
    const device = await request.legacyDb.one(
      "SELECT * FROM tv_devices WHERE id = $1 AND revoked_at IS NULL",
      [payload.tv_device_id]
    );

    if (!device) {
      throw legacyError(401, "unauthorized", "TV device not found");
    }

    request.legacyActor = {
      kind: "tv_device",
      device,
      id: device.id,
      parent_id: device.parent_id,
      child_id: device.current_child_id
    };
    return request.legacyActor;
  }

  throw legacyError(401, "unauthorized", "unsupported token");
}

export function requireActor(request, response, next) {
  authenticateRequest(request).then(() => next(), next);
}

export function requireUser(request, response, next) {
  authenticateRequest(request)
    .then((actor) => {
      if (actor.kind !== "user") {
        throw legacyError(403, "forbidden", "user token is required");
      }
      next();
    })
    .catch(next);
}

export function requireParent(request, response, next) {
  authenticateRequest(request)
    .then((actor) => {
      if (actor.kind !== "user" || actor.user.role !== "parent") {
        throw legacyError(403, "forbidden", "parent role is required");
      }
      next();
    })
    .catch(next);
}

export function requireAdmin(request, response, next) {
  authenticateRequest(request)
    .then((actor) => {
      if (actor.kind !== "user" || !["admin", "super_admin"].includes(actor.user.role)) {
        throw legacyError(403, "forbidden", "admin role is required");
      }
      next();
    })
    .catch(next);
}

export function requireSuperAdmin(request, response, next) {
  authenticateRequest(request)
    .then((actor) => {
      if (actor.kind !== "user" || actor.user.role !== "super_admin") {
        throw legacyError(403, "forbidden", "super_admin role is required");
      }
      next();
    })
    .catch(next);
}

export async function refreshTokenPair(db, refreshToken) {
  let payload;

  try {
    payload = jwt.verify(refreshToken, jwtSecret());
  } catch {
    throw legacyError(401, "invalid credentials", "invalid credentials");
  }

  if (payload.kind !== "refresh") {
    throw legacyError(401, "invalid credentials", "invalid credentials");
  }

  const stored = await db.one(
    "SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
    [sha256(refreshToken)]
  );

  if (!stored) {
    throw legacyError(401, "invalid credentials", "invalid credentials");
  }

  await db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [stored.id]);

  const user = await db.one("SELECT * FROM users WHERE id = $1 AND active = true", [payload.user_id]);

  if (!user) {
    throw legacyError(401, "invalid credentials", "invalid credentials");
  }

  return issueTokenPair(db, user);
}

export async function verifyGoogleToken(idToken) {
  const audiences = envList("GOOGLE_CLIENT_ID");

  if (!audiences.length) {
    throw legacyError(503, "google_auth_unavailable", "GOOGLE_CLIENT_ID is required");
  }

  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  let payload;

  try {
    ({ payload } = await jwtVerify(idToken, jwks, {
      audience: audiences
    }));
  } catch {
    throw legacyError(401, "invalid credentials", "invalid credentials");
  }

  return {
    provider: "google",
    subject: payload.sub,
    email: payload.email,
    name: payload.given_name || payload.name || "",
    last_name: payload.family_name || ""
  };
}

export async function verifyAppleToken(identityToken, body = {}) {
  const audiences = envList("APPLE_CLIENT_ID");

  if (!audiences.length) {
    throw legacyError(503, "apple_auth_unavailable", "APPLE_CLIENT_ID is required");
  }

  const jwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  let payload;

  try {
    ({ payload } = await jwtVerify(identityToken, jwks, {
      audience: audiences,
      issuer: "https://appleid.apple.com"
    }));
  } catch {
    throw legacyError(401, "invalid credentials", "invalid credentials");
  }

  return {
    provider: "apple",
    subject: payload.sub,
    email: payload.email,
    name: body.given_name || body.name || "",
    last_name: body.family_name || body.last_name || ""
  };
}

export async function findOrCreateOAuthUser(db, profile) {
  requireFields(profile, ["provider", "subject", "email"]);
  let user = await db.one(
    "SELECT * FROM users WHERE auth_provider = $1 AND auth_subject = $2",
    [profile.provider, profile.subject]
  );

  if (!user) {
    user = await db.one("SELECT * FROM users WHERE email = $1", [profile.email.toLowerCase()]);
  }

  if (user) {
    const updated = await db.one(
      `
        UPDATE users
        SET auth_provider = $2, auth_subject = $3, last_login_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [user.id, profile.provider, profile.subject]
    );
    return updated;
  }

  return db.one(
    `
      INSERT INTO users (email, name, last_name, role, auth_provider, auth_subject, last_login_at)
      VALUES ($1, $2, $3, 'parent', $4, $5, now())
      RETURNING *
    `,
    [profile.email.toLowerCase(), profile.name || "", profile.last_name || "", profile.provider, profile.subject]
  );
}

export function tokenUser(user) {
  return serializeUser(user);
}

export function messageResponse(message = "ok") {
  return {
    message: i18n(message)
  };
}

import fs from "node:fs";
import axios from "axios";
import jwt from "jsonwebtoken";

// Sign in with Apple server-to-server calls: exchange the authorization_code
// for a refresh token at login, and revoke it when the user deletes the account
// (App Store Review Guideline 5.1.1(v)).

const appleBaseUrl = "https://appleid.apple.com";

function privateKey() {
  if (process.env.APPLE_PRIVATE_KEY) {
    return process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  }

  if (process.env.APPLE_PRIVATE_KEY_PATH) {
    return fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, "utf8");
  }

  return "";
}

export function appleRevocationConfigured() {
  return Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && privateKey());
}

export function appleClientSecret(clientId) {
  return jwt.sign({}, privateKey(), {
    algorithm: "ES256",
    expiresIn: 5 * 60,
    issuer: process.env.APPLE_TEAM_ID,
    audience: appleBaseUrl,
    subject: clientId,
    keyid: process.env.APPLE_KEY_ID
  });
}

async function postForm(path, params) {
  return axios.post(`${appleBaseUrl}${path}`, new URLSearchParams(params).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000
  });
}

function logAppleFailure(action, error) {
  console.warn(JSON.stringify({
    level: "warn",
    msg: `apple ${action} failed`,
    status: error.response?.status,
    error: error.response?.data?.error || error.message
  }));
}

// Returns Apple's refresh_token, or null when not configured / Apple refused.
// Login must not fail because of this call.
export async function exchangeAppleAuthorizationCode(code, clientId) {
  if (!code || !clientId || !appleRevocationConfigured()) {
    return null;
  }

  try {
    const { data } = await postForm("/auth/token", {
      client_id: clientId,
      client_secret: appleClientSecret(clientId),
      code,
      grant_type: "authorization_code"
    });
    return data.refresh_token || null;
  } catch (error) {
    logAppleFailure("token exchange", error);
    return null;
  }
}

export async function revokeAppleToken(refreshToken, clientId) {
  if (!refreshToken || !clientId || !appleRevocationConfigured()) {
    return false;
  }

  try {
    await postForm("/auth/revoke", {
      client_id: clientId,
      client_secret: appleClientSecret(clientId),
      token: refreshToken,
      token_type_hint: "refresh_token"
    });
    return true;
  } catch (error) {
    logAppleFailure("token revoke", error);
    return false;
  }
}

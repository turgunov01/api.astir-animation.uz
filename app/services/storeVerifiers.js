import { normalizePrivateKeyPem } from "../lib/pem.js";
import fs from "node:fs";
import { GoogleAuth } from "google-auth-library";
import { SignJWT, decodeJwt, importPKCS8 } from "jose";
import { AppError, badRequest, serviceUnavailable } from "../lib/errors.js";

// Store purchases are trusted ONLY when the server fetches them from Apple /
// Google itself over TLS. Anything the client sends (tariff, expiry, status)
// is ignored; the client only tells us which transaction / token to look up.

const APPLE_API_URLS = {
  production: "https://api.storekit.itunes.apple.com",
  sandbox: "https://api.storekit-sandbox.itunes.apple.com"
};
const GOOGLE_API_URL = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const APPLE_TOKEN_TTL_SECONDS = 50 * 60;

function readKey(inline, filePath) {
  return normalizePrivateKeyPem(inline || (filePath ? fs.readFileSync(filePath, "utf8") : ""));
}

// Unverified decode of a JWS payload. Only used to extract an ID that is then
// re-fetched from the store API, or on payloads the store API itself returned.
export function decodeStorePayload(jws, field = "payload") {
  try {
    return decodeJwt(jws);
  } catch {
    throw badRequest(`${field} is not a valid signed payload`, "VALIDATION_ERROR");
  }
}

function storeError(provider, status, body) {
  return new AppError(
    502,
    `${provider.toUpperCase()}_STORE_ERROR`,
    `${provider} store API responded with ${status}${body ? `: ${body.slice(0, 200)}` : ""}`
  );
}

// Settings can change at runtime (admin panel), so caches are tied to the
// credentials they were built from.
function fingerprint(...values) {
  return values.map((value) => String(value || "")).join("|");
}

export function createAppStoreClient(appleIap = {}, { fetchImpl = fetch } = {}) {
  let cachedToken = null;
  let cachedTokenExpiresAt = 0;
  let cachedFor = "";

  function isConfigured() {
    return Boolean(appleIap.bundleId && appleIap.issuerId && appleIap.keyId
      && (appleIap.privateKey || appleIap.privateKeyPath));
  }

  function assertConfigured() {
    if (!isConfigured()) {
      throw serviceUnavailable(
        "Apple In-App Purchase verification is not configured",
        "APPLE_IAP_NOT_CONFIGURED"
      );
    }
  }

  async function authToken() {
    const now = Math.floor(Date.now() / 1000);

    const credentials = fingerprint(appleIap.bundleId, appleIap.issuerId, appleIap.keyId, appleIap.privateKey, appleIap.privateKeyPath);

    if (cachedToken && cachedFor === credentials && cachedTokenExpiresAt - 60 > now) {
      return cachedToken;
    }

    cachedFor = credentials;

    const key = await importPKCS8(readKey(appleIap.privateKey, appleIap.privateKeyPath), "ES256");
    cachedTokenExpiresAt = now + APPLE_TOKEN_TTL_SECONDS;
    cachedToken = await new SignJWT({ bid: appleIap.bundleId })
      .setProtectedHeader({ alg: "ES256", kid: appleIap.keyId, typ: "JWT" })
      .setIssuer(appleIap.issuerId)
      .setIssuedAt(now)
      .setExpirationTime(cachedTokenExpiresAt)
      .setAudience("appstoreconnect-v1")
      .sign(key);

    return cachedToken;
  }

  function baseUrls() {
    if (appleIap.apiUrl) {
      return [{ environment: appleIap.environment || "sandbox", url: appleIap.apiUrl }];
    }

    if (appleIap.environment === "production" || appleIap.environment === "sandbox") {
      return [{ environment: appleIap.environment, url: APPLE_API_URLS[appleIap.environment] }];
    }

    // "auto": production first; App Review and TestFlight purchases live in sandbox.
    return [
      { environment: "production", url: APPLE_API_URLS.production },
      { environment: "sandbox", url: APPLE_API_URLS.sandbox }
    ];
  }

  async function getJson(pathName) {
    assertConfigured();
    const token = await authToken();

    for (const { environment, url } of baseUrls()) {
      const response = await fetchImpl(`${url}${pathName}`, {
        headers: { authorization: `Bearer ${token}` }
      });

      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        throw storeError("apple", response.status, await response.text());
      }

      return { environment, body: await response.json() };
    }

    throw badRequest("Transaction was not found in the App Store", "APPLE_TRANSACTION_NOT_FOUND");
  }

  return {
    isConfigured,

    async getTransaction(transactionId) {
      const { environment, body } = await getJson(`/inApps/v1/transactions/${encodeURIComponent(transactionId)}`);

      return { environment, ...decodeStorePayload(body.signedTransactionInfo, "signedTransactionInfo") };
    },

    // Latest state of every transaction in the subscription group of originalTransactionId.
    async getSubscriptionStatuses(originalTransactionId) {
      const { environment, body } = await getJson(`/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`);
      const lastTransactions = (body.data || []).flatMap((group) => group.lastTransactions || []);

      return lastTransactions.map((item) => ({
        environment,
        status: item.status,
        transaction: decodeStorePayload(item.signedTransactionInfo, "signedTransactionInfo")
      }));
    }
  };
}

export function createGooglePlayClient(googlePlay = {}, { fetchImpl = fetch, accessTokenProvider = null } = {}) {
  let auth = null;
  let authFor = "";

  function isConfigured() {
    return Boolean(googlePlay.packageName && (googlePlay.serviceAccountJson || googlePlay.serviceAccountPath || accessTokenProvider));
  }

  function assertConfigured() {
    if (!isConfigured()) {
      throw serviceUnavailable(
        "Google Play purchase verification is not configured",
        "GOOGLE_PLAY_NOT_CONFIGURED"
      );
    }
  }

  async function accessToken() {
    if (accessTokenProvider) {
      return await accessTokenProvider();
    }

    // Service account JSON pasted in the admin panel wins over a key file.
    const credentials = fingerprint(googlePlay.serviceAccountJson, googlePlay.serviceAccountPath);
    if (!auth || authFor !== credentials) {
      auth = googlePlay.serviceAccountJson
        ? new GoogleAuth({ credentials: JSON.parse(googlePlay.serviceAccountJson), scopes: [GOOGLE_SCOPE] })
        : new GoogleAuth({ keyFile: googlePlay.serviceAccountPath, scopes: [GOOGLE_SCOPE] });
      authFor = credentials;
    }

    return await auth.getAccessToken();
  }

  async function call(pathName, method = "GET") {
    assertConfigured();
    const baseUrl = googlePlay.apiUrl || GOOGLE_API_URL;
    const response = await fetchImpl(`${baseUrl}/applications/${encodeURIComponent(googlePlay.packageName)}${pathName}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken()}` }
    });

    if (response.status === 404 || response.status === 410) {
      throw badRequest("Purchase token was not found in Google Play", "GOOGLE_PURCHASE_NOT_FOUND");
    }

    if (!response.ok) {
      throw storeError("google", response.status, await response.text());
    }

    const text = await response.text();

    return text ? JSON.parse(text) : {};
  }

  return {
    isConfigured,

    async getSubscription(purchaseToken) {
      return await call(`/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
    },

    // Google refunds subscriptions that are not acknowledged within 3 days.
    async acknowledgeSubscription(productId, purchaseToken) {
      await call(
        `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
        "POST"
      );
    }
  };
}

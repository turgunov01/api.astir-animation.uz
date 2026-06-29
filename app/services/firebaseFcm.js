import fs from "node:fs";
import axios from "axios";
import { GoogleAuth } from "google-auth-library";

const FIREBASE_MESSAGING_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const LEGACY_FCM_PATH = "/fcm/send";

class FirebaseFcmConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "FirebaseFcmConfigurationError";
  }
}

function firebaseValue(config, key, envKey) {
  return config?.[key] || process.env[envKey] || "";
}

export function normalizeFcmData(data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

function buildFcmUrl(projectId, configuredUrl) {
  const apiUrl = configuredUrl || `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  if (apiUrl.includes(LEGACY_FCM_PATH)) {
    throw new FirebaseFcmConfigurationError("FIREBASE_API_URL must use Firebase Cloud Messaging HTTP v1, not legacy /fcm/send");
  }

  return apiUrl;
}

function resolveFirebaseConfig(firebaseConfig = {}) {
  const projectId = firebaseValue(firebaseConfig, "projectId", "FIREBASE_PROJECT_ID");
  const serviceAccountPath = firebaseValue(firebaseConfig, "serviceAccountPath", "FIREBASE_SERVICE_ACCOUNT_PATH");

  if (!projectId) {
    throw new FirebaseFcmConfigurationError("FIREBASE_PROJECT_ID is required for Firebase Cloud Messaging HTTP v1");
  }

  if (!serviceAccountPath) {
    throw new FirebaseFcmConfigurationError("FIREBASE_SERVICE_ACCOUNT_PATH is required for Firebase Cloud Messaging HTTP v1");
  }

  if (!fs.existsSync(serviceAccountPath)) {
    throw new FirebaseFcmConfigurationError(`Firebase service account file was not found at FIREBASE_SERVICE_ACCOUNT_PATH: ${serviceAccountPath}`);
  }

  return {
    projectId,
    serviceAccountPath,
    apiUrl: buildFcmUrl(projectId, firebaseValue(firebaseConfig, "apiUrl", "FIREBASE_API_URL"))
  };
}

function safeFirebaseError(error) {
  const details = {
    name: error?.name || "Error",
    message: error?.message || "Firebase FCM request failed"
  };

  if (error?.response) {
    details.status = error.response.status;
    details.statusText = error.response.statusText;

    const firebaseError = error.response.data?.error;
    if (firebaseError) {
      details.firebase = {
        code: firebaseError.code,
        status: firebaseError.status,
        message: firebaseError.message
      };
    }
  }

  return details;
}

function logFirebaseError(message, error) {
  console.error(JSON.stringify({
    event: "firebase_fcm_error",
    message,
    error: safeFirebaseError(error)
  }));
}

function resultForConfigError(error, tokenCount) {
  return {
    sent: false,
    skipped: error instanceof FirebaseFcmConfigurationError,
    reason: error.message,
    successCount: 0,
    failureCount: tokenCount,
    providerResponse: {
      error: safeFirebaseError(error)
    }
  };
}

function uniqueTokens(tokens) {
  const values = Array.isArray(tokens) ? tokens : [tokens];

  return [...new Set(values.filter((token) => typeof token === "string" && token.trim()).map((token) => token.trim()))];
}

export function createFirebaseFcmService(firebaseConfig = {}) {
  const authClients = new Map();

  function getAuth(serviceAccountPath) {
    if (!authClients.has(serviceAccountPath)) {
      authClients.set(serviceAccountPath, new GoogleAuth({
        keyFile: serviceAccountPath,
        scopes: [FIREBASE_MESSAGING_SCOPE]
      }));
    }

    return authClients.get(serviceAccountPath);
  }

  async function getAccessToken(serviceAccountPath) {
    const client = await getAuth(serviceAccountPath).getClient();
    const tokenResponse = await client.getAccessToken();
    const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

    if (!token) {
      throw new Error("Failed to get Firebase access token");
    }

    return token;
  }

  async function postMessage({ apiUrl, accessToken, token, title, body, data }) {
    const payload = {
      message: {
        token,
        notification: {
          title: title || "",
          body: body || ""
        },
        data: normalizeFcmData(data)
      }
    };

    const response = await axios.post(apiUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    return response;
  }

  async function sendFcmToToken({ token, title, body, data = {} }) {
    if (!token) {
      throw new Error("FCM device token is required");
    }

    try {
      const resolvedConfig = resolveFirebaseConfig(firebaseConfig);
      const accessToken = await getAccessToken(resolvedConfig.serviceAccountPath);
      const response = await postMessage({
        apiUrl: resolvedConfig.apiUrl,
        accessToken,
        token,
        title,
        body,
        data
      });

      return response.data;
    } catch (error) {
      logFirebaseError("Firebase FCM single-token send failed", error);
      throw error;
    }
  }

  async function sendFcmToTokens(tokens, { title, body, data = {} }) {
    const tokenList = uniqueTokens(tokens);

    if (tokenList.length === 0) {
      return {
        sent: false,
        skipped: true,
        reason: "No FCM device tokens provided",
        successCount: 0,
        failureCount: 0,
        providerResponse: null
      };
    }

    let resolvedConfig;
    let accessToken;

    try {
      resolvedConfig = resolveFirebaseConfig(firebaseConfig);
      accessToken = await getAccessToken(resolvedConfig.serviceAccountPath);
    } catch (error) {
      logFirebaseError("Firebase FCM configuration or authentication failed", error);
      return resultForConfigError(error, tokenList.length);
    }

    const responses = [];

    for (const token of tokenList) {
      try {
        const response = await postMessage({
          apiUrl: resolvedConfig.apiUrl,
          accessToken,
          token,
          title,
          body,
          data
        });

        responses.push({
          sent: true,
          status: response.status,
          providerResponse: response.data
        });
      } catch (error) {
        logFirebaseError("Firebase FCM token request failed", error);
        responses.push({
          sent: false,
          error: safeFirebaseError(error)
        });
      }
    }

    const successCount = responses.filter((response) => response.sent).length;
    const failureCount = responses.length - successCount;

    return {
      sent: successCount > 0,
      skipped: false,
      successCount,
      failureCount,
      providerResponse: {
        responses
      }
    };
  }

  return {
    sendFcmToToken,
    sendFcmToTokens
  };
}

const defaultFirebaseFcmService = createFirebaseFcmService();

export async function sendFcmToToken(payload) {
  return defaultFirebaseFcmService.sendFcmToToken(payload);
}

export async function sendFcmToTokens(tokens, payload) {
  return defaultFirebaseFcmService.sendFcmToTokens(tokens, payload);
}

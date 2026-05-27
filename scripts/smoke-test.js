import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataFile = path.join(os.tmpdir(), `astir-smoke-${Date.now()}.json`);
process.env.DATA_FILE = dataFile;
process.env.JWT_SECRET = "astir-smoke-test-secret";

const { createServer } = await import("../app/server.js");

const server = createServer();

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

const port = await listen();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const registration = await request(baseUrl, "/v1/auth/register", {
    method: "POST",
    body: {
      name: "Smoke Parent",
      email: `smoke-${Date.now()}@example.com`,
      password: "password123",
      pin: "1234"
    }
  });

  assert.equal(typeof registration.token, "string");
  const parentToken = registration.token;

  const pinVerification = await request(baseUrl, "/v1/auth/pin/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { pin: "1234" }
  });

  assert.equal(pinVerification.verified, true);

  const childResponse = await request(baseUrl, "/v1/children", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      name: "Smoke Child",
      birthYear: 2018
    }
  });

  const childId = childResponse.child.id;
  assert.equal(typeof childId, "string");

  await request(baseUrl, `/v1/children/${childId}/limits`, {
    method: "PUT",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      dailyMinutes: 60,
      allowedFrom: "00:00",
      allowedTo: "23:59",
      allowedDays: [1, 2, 3, 4, 5, 6, 7]
    }
  });

  const pairing = await request(baseUrl, "/v1/pairing/sessions", {
    method: "POST",
    body: {
      deviceName: "Smoke TV",
      platform: "tv"
    }
  });

  const pairingSession = pairing.pairingSession;
  assert.equal(typeof pairingSession.setupToken, "string");

  await request(baseUrl, `/v1/pairing/sessions/${pairingSession.id}/approve`, {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { childId }
  });

  const paired = await request(baseUrl, `/v1/pairing/sessions/${pairingSession.id}`, {
    headers: { "x-setup-token": pairingSession.setupToken }
  });

  const deviceToken = paired.pairingSession.deviceToken;
  assert.equal(typeof deviceToken, "string");

  const config = await request(baseUrl, "/v1/device/config", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(config.child.id, childId);

  const content = await request(baseUrl, "/v1/content", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(content.content.length > 0, true);

  const started = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: content.content[0].id }
  });

  const watchSessionId = started.watchSession.id;
  assert.equal(typeof watchSessionId, "string");

  const stopped = await request(baseUrl, `/v1/watch-sessions/${watchSessionId}/stop`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(stopped.watchSession.id, watchSessionId);
  console.log("Smoke test passed");
} finally {
  await close();
  fs.rmSync(dataFile, { force: true });
}

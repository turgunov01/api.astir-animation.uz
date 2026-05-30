import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.DATABASE_URL = "";
process.env.REQUIRE_AUTH = "true";
process.env.JWT_SECRET = "astir-legacy-test-secret";

const { createServer } = await import("../app/server.js");

const legacyRaw = JSON.parse(fs.readFileSync(path.resolve("app/legacy/legacy-doc.raw.json"), "utf8"));
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

function countOperations(document) {
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  let count = 0;

  for (const pathItem of Object.values(document.paths || {})) {
    for (const method of Object.keys(pathItem)) {
      if (methods.has(method)) {
        count += 1;
      }
    }
  }

  return count;
}

const port = await listen();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const docResponse = await fetch(`${baseUrl}/legacy-doc.json`);
  assert.equal(docResponse.status, 200);
  const doc = await docResponse.json();

  assert.equal(doc.swagger, legacyRaw.swagger);
  assert.equal(doc.info.title, "Astir Streaming API");
  assert.equal(doc.basePath, "/api/v1");
  assert.equal(doc.host, `127.0.0.1:${port}`);
  assert.deepEqual(doc.schemes, ["http"]);
  assert.equal(Object.keys(doc.paths).length, Object.keys(legacyRaw.paths).length);
  assert.equal(countOperations(doc), 139);
  assert.equal(Object.keys(doc.definitions).length, Object.keys(legacyRaw.definitions).length);

  const uiResponse = await fetch(`${baseUrl}/legacy-api-docs/`);
  assert.equal(uiResponse.status, 200);
  assert.match(await uiResponse.text(), /swagger-ui/);

  const indexResponse = await fetch(`${baseUrl}/index.html`);
  assert.equal(indexResponse.status, 200);
  const indexHtml = await indexResponse.text();
  assert.match(indexHtml, /\/legacy-api-docs/);
  assert.match(indexHtml, /\/legacy-doc\.json/);

  const gatedResponse = await fetch(`${baseUrl}/api/v1/plans`);
  assert.equal(gatedResponse.status, 503);
  const gatedBody = await gatedResponse.json();
  assert.equal(gatedBody.error, "database_unavailable");
  assert.equal(typeof gatedBody.message.en, "string");

  console.log("Legacy contract test passed");
} finally {
  await close();
}

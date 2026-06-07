import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "";
process.env.REQUIRE_AUTH = "true";
process.env.JWT_SECRET = "astir-legacy-test-secret";

const { createServer } = await import("../app/server.js");
const { openApiDocument } = await import("../app/openapi.js");
const { requireAdmin, requireParent, requireSuperAdmin } = await import("../app/legacy/auth.js");
const { createLegacyRoutes } = await import("../app/legacy/routes.js");

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

function listenApp(app) {
  return new Promise((resolve) => {
    const appServer = app.listen(0, "127.0.0.1", () => {
      resolve(appServer);
    });
  });
}

function closeServer(appServer) {
  return new Promise((resolve, reject) => {
    appServer.close((error) => {
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

function legacyUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      user_id: user.id,
      role: user.role,
      kind: "user"
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

function runLegacyGuard(guard, user) {
  const token = legacyUserToken(user);
  const request = {
    get(name) {
      return name.toLowerCase() === "authorization" ? `Bearer ${token}` : "";
    },
    legacyDb: {
      one(sql, values) {
        assert.match(sql, /FROM users/);
        assert.deepEqual(values, [user.id]);
        return user;
      }
    }
  };

  return new Promise((resolve) => {
    guard(request, {}, (error) => {
      resolve({ error, request });
    });
  });
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
  assert.deepEqual(doc.definitions["handler.RegisterRequest"].required, ["email", "name", "password", "pin"]);
  assert.deepEqual(
    openApiDocument.paths["/api/v1/auth/register"].post.requestBody.content["application/json"].schema.required,
    ["email", "name", "password", "pin"]
  );
  assert.equal(Boolean(openApiDocument.paths["/api/v1/admin/logs"].get), true);

  const uiResponse = await fetch(`${baseUrl}/legacy-api-docs/`);
  assert.equal(uiResponse.status, 200);
  assert.match(await uiResponse.text(), /swagger-ui/);

  const indexResponse = await fetch(`${baseUrl}/index.html`);
  assert.equal(indexResponse.status, 200);
  const indexHtml = await indexResponse.text();
  assert.match(indexHtml, /\/legacy-api-docs/);
  assert.match(indexHtml, /\/legacy-doc\.json/);

  const superAdmin = {
    id: "cc799db4-ebef-46b1-ac4e-c5b22c04daf5",
    email: "super-admin@example.com",
    name: "Super Admin",
    role: "super_admin",
    active: true
  };
  const parentGuard = await runLegacyGuard(requireParent, superAdmin);
  assert.equal(parentGuard.error, undefined);
  assert.equal(parentGuard.request.legacyUser.role, "super_admin");

  const adminGuard = await runLegacyGuard(requireAdmin, superAdmin);
  assert.equal(adminGuard.error, undefined);

  const superAdminGuard = await runLegacyGuard(requireSuperAdmin, superAdmin);
  assert.equal(superAdminGuard.error, undefined);

  const adminAsParent = await runLegacyGuard(requireParent, {
    ...superAdmin,
    id: "7a893ccb-7b3a-42dd-a5e6-2ab1d5f6f8a1",
    role: "admin"
  });
  assert.equal(adminAsParent.error.statusCode, 403);

  const gatedResponse = await fetch(`${baseUrl}/api/v1/plans`);
  assert.equal(gatedResponse.status, 503);
  const gatedBody = await gatedResponse.json();
  assert.equal(gatedBody.error, "database_unavailable");
  assert.equal(typeof gatedBody.message.en, "string");

  const missingContentId = "165f1d6e-2fb6-4785-812f-5fd18c020cfd";
  const movieContentId = "791bfc32-2ce1-44f3-a1b0-91da4c70aa1b";
  const movieSeriesId = "87d4f2af-ee4d-4783-b905-971a392ba483";
  const movieEpisodeId = "5fe224b5-e8c0-4543-9f30-64e2f7ef103d";
  const fakeUser = {
    id: "8f847c1c-bc7e-4c17-9d58-6f0c96917ca8",
    email: "parent@example.com",
    name: "Parent",
    role: "parent",
    active: true
  };
  const fakeQueries = [];
  const fakeLegacyDb = {
    one(sql, values) {
      fakeQueries.push({ method: "one", sql, values });

      if (/FROM users/.test(sql)) {
        return fakeUser;
      }

      if (/FROM content WHERE id = \$1/.test(sql)) {
        return null;
      }

      throw new Error(`unexpected query: ${sql}`);
    },
    many(sql, values) {
      fakeQueries.push({ method: "many", sql, values });

      if (/FROM content WHERE series_id = \$1/.test(sql)) {
        return [];
      }

      throw new Error(`unexpected many query: ${sql}`);
    },
    query(sql, values) {
      fakeQueries.push({ method: "query", sql, values });

      if (/INSERT INTO comments/.test(sql)) {
        return {
          rows: [{
            id: "0d4bf2c5-f39d-4e95-90c6-97df78ab0f6b",
            user_id: values[0],
            content_id: values[1],
            target_type: values[2],
            target_id: values[3],
            body: values[4]
          }]
        };
      }

      throw new Error(`unexpected write: ${sql}`);
    }
  };
  const fakeMovieRecords = [
    {
      id: movieContentId,
      title: { en: "Movie", ru: "Movie RU", uz: "Movie UZ" },
      description: { en: "Movie description", ru: "Movie description RU", uz: "Movie description UZ" },
      series: []
    },
    {
      id: movieEpisodeId,
      title: { en: "Episode", ru: "Episode RU", uz: "Episode UZ" },
      description: { en: "Episode description", ru: "Episode description RU", uz: "Episode description UZ" },
      series_id: movieSeriesId,
      season_number: 1,
      episode_number: 1,
      published: false,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    }
  ];
  const fakeContentMovies = {
    list() {
      return fakeMovieRecords;
    },

    findById(id) {
      return fakeMovieRecords.find((movie) => movie.id === id) || null;
    }
  };
  const fakeMedia = {
    upload() {
      return {
        single() {
          return (request, response, next) => next();
        }
      };
    }
  };
  const commentsApp = express();
  commentsApp.use(express.json());
  commentsApp.use((request, response, next) => {
    request.legacyDb = fakeLegacyDb;
    next();
  });
  commentsApp.use("/api/v1", createLegacyRoutes({
    config: { maxVideoUploadMb: 1 },
    contentMovies: fakeContentMovies,
    media: fakeMedia
  }));
  const commentsServer = await listenApp(commentsApp);

  try {
    const commentsBaseUrl = `http://127.0.0.1:${commentsServer.address().port}`;
    const missingContentResponse = await fetch(`${commentsBaseUrl}/api/v1/content/${missingContentId}/comments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${legacyUserToken(fakeUser)}`
      },
      body: JSON.stringify({ body: "Jgar qarziyni qachon berasa?" })
    });
    const missingContentBody = await missingContentResponse.json();

    assert.equal(missingContentResponse.status, 404);
    assert.equal(missingContentBody.error, "content_not_found");
    assert.equal(missingContentBody.message.en, "content not found");
    assert.equal(fakeQueries.some((query) => query.method === "query" && /INSERT INTO comments/.test(query.sql)), false);

    const movieCommentResponse = await fetch(`${commentsBaseUrl}/api/v1/content/${movieContentId}/comments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${legacyUserToken(fakeUser)}`
      },
      body: JSON.stringify({ body: "Zaybal kament 2" })
    });
    const movieCommentBody = await movieCommentResponse.json();
    const insertQuery = fakeQueries.find((query) => query.method === "query" && /INSERT INTO comments/.test(query.sql));

    assert.equal(movieCommentResponse.status, 201);
    assert.equal(movieCommentBody.content_id, movieContentId);
    assert.equal(movieCommentBody.target_type, "content");
    assert.equal(movieCommentBody.target_id, movieContentId);
    assert.equal(movieCommentBody.body, "Zaybal kament 2");
    assert.equal(insertQuery.values[1], null);
    assert.equal(insertQuery.values[2], "content");
    assert.equal(insertQuery.values[3], movieContentId);

    const seriesEpisodesResponse = await fetch(`${commentsBaseUrl}/api/v1/series/${movieSeriesId}/episodes`);
    const seriesEpisodesBody = await seriesEpisodesResponse.json();

    assert.equal(seriesEpisodesResponse.status, 200);
    assert.equal(seriesEpisodesBody.length, 1);
    assert.equal(seriesEpisodesBody[0].id, movieEpisodeId);
    assert.equal(seriesEpisodesBody[0].title.en, "Episode");
    assert.equal(seriesEpisodesBody[0].series_id, movieSeriesId);
  } finally {
    await closeServer(commentsServer);
  }

  console.log("Legacy contract test passed");
} finally {
  await close();
}

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
const { hashSecret } = await import("../app/lib/security.js");

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

function legacyChildDeviceToken(device) {
  return jwt.sign(
    {
      sub: device.id,
      kind: "child_device",
      device_id: device.id,
      child_id: device.child_id
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

function v1DeviceToken(device) {
  return jwt.sign(
    {
      sub: device.id,
      type: "device",
      deviceId: device.id,
      parentId: device.parent_id,
      childId: device.child_id
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
  assert.equal(doc.basePath, "/v1");
  assert.equal(doc.host, `127.0.0.1:${port}`);
  assert.deepEqual(doc.schemes, ["http"]);
  assert.equal(Object.keys(doc.paths).length, Object.keys(legacyRaw.paths).length);
  assert.equal(countOperations(doc), 138);
  assert.equal(Boolean(doc.paths["/payments/click/webhook"]), false);
  assert.equal(Object.keys(doc.definitions).length, Object.keys(legacyRaw.definitions).length);
  assert.deepEqual(doc.definitions["handler.RegisterRequest"].required, ["email", "name", "password", "pin"]);
  assert.deepEqual(
    openApiDocument.paths["/v1/auth/register"].post.requestBody.content["application/json"].schema.required,
    ["email", "name", "password", "pin"]
  );
  assert.equal(Boolean(openApiDocument.paths["/v1/admin/logs"].get), true);
  assert.equal(Object.keys(openApiDocument.paths).some((path) => path.startsWith("/api/v1")), false);

  const uiResponse = await fetch(`${baseUrl}/legacy-api-docs/`);
  assert.equal(uiResponse.status, 200);
  assert.match(await uiResponse.text(), /swagger-ui/);

  const indexResponse = await fetch(`${baseUrl}/index.html`);
  assert.equal(indexResponse.status, 200);
  const indexHtml = await indexResponse.text();
  assert.match(indexHtml, /\/legacy-api-docs/);
  assert.match(indexHtml, /\/legacy-doc\.json/);

  const extendChildId = "0bfa0ff4-06a8-42cb-8f26-32b2f7f22941";
  const extendDeviceToken = v1DeviceToken({
    id: "c4592e94-483d-462c-836e-b9c8c8f0ac89",
    parent_id: "8d865658-99a0-4265-90ce-fd2060b78c9b",
    child_id: extendChildId
  });
  const extendInitResponse = await fetch(`${baseUrl}/v1/children/${extendChildId}/extend/init`, {
    method: "POST",
    headers: { authorization: `Bearer ${extendDeviceToken}` }
  });
  const extendInitBody = await extendInitResponse.json();

  assert.equal(extendInitResponse.status, 503);
  assert.equal(extendInitBody.error, "database_unavailable");

  const previousDotenvPath = process.env.DOTENV_CONFIG_PATH;
  const extendEnvPath = path.join(path.dirname(path.resolve("package.json")), `astir-extend-${Date.now()}.env`);
  const dynamicExtendChildId = "10a5e7cb-5801-4cf8-bfe4-1c02f94bb75e";
  const dynamicExtendDeviceId = "33d0b7c1-7cfe-4fb5-af0c-9dd0821cf844";
  const dynamicExtendParentId = "c74dc41c-8338-4f9c-9af8-e07c5a1db3fd";
  const dynamicExtendChild = {
    id: dynamicExtendChildId,
    parent_id: dynamicExtendParentId,
    pin_hash: hashSecret("1234")
  };
  const dynamicExtendDb = {
    one(sql, values) {
      if (/FROM child_devices WHERE id = \$1/.test(sql)) {
        return values[0] === dynamicExtendDeviceId
          ? { id: dynamicExtendDeviceId, parent_id: dynamicExtendParentId, child_id: dynamicExtendChildId }
          : null;
      }

      throw new Error(`unexpected dynamic extend one query: ${sql}`);
    },
    query(sql, values) {
      if (/SELECT \* FROM children WHERE id = \$1/.test(sql)) {
        return { rows: values[0] === dynamicExtendChildId ? [dynamicExtendChild] : [] };
      }

      if (/UPDATE children SET/.test(sql)) {
        dynamicExtendChild.extended_until = values[0];

        return { rows: [{ ...dynamicExtendChild }] };
      }

      throw new Error(`unexpected dynamic extend query: ${sql}`);
    }
  };
  const dynamicExtendApp = express();
  dynamicExtendApp.use(express.json());
  dynamicExtendApp.use((request, response, next) => {
    request.legacyDb = dynamicExtendDb;
    next();
  });
  dynamicExtendApp.use("/api/v1", createLegacyRoutes({
    config: { maxVideoUploadMb: 1 },
    contentMovies: null,
    media: {
      upload() {
        return { single: () => (request, response, next) => next() };
      }
    }
  }));
  const dynamicExtendServer = await listenApp(dynamicExtendApp);

  try {
    process.env.DOTENV_CONFIG_PATH = extendEnvPath;
    fs.writeFileSync(extendEnvPath, "CHILD_EXTEND_MINUTES=7\n");

    const extendByPin = async () => {
      const response = await fetch(
        `http://127.0.0.1:${dynamicExtendServer.address().port}/api/v1/children/${dynamicExtendChildId}/extend/pin`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${v1DeviceToken({
              id: dynamicExtendDeviceId,
              parent_id: dynamicExtendParentId,
              child_id: dynamicExtendChildId
            })}`
          },
          body: JSON.stringify({ pin: "1234" })
        }
      );
      const body = await response.json();

      assert.equal(response.status, 200);

      return body;
    };

    const sevenMinuteExtend = await extendByPin();
    const sevenMinuteDelta = Math.round((new Date(sevenMinuteExtend.extended_until).getTime() - Date.now()) / 60000);

    assert.equal(sevenMinuteDelta, 7);

    fs.writeFileSync(extendEnvPath, "CHILD_EXTEND_MINUTES=9\n");

    const nineMinuteExtend = await extendByPin();
    const nineMinuteDelta = Math.round((new Date(nineMinuteExtend.extended_until).getTime() - Date.now()) / 60000);

    assert.equal(nineMinuteDelta, 9);
  } finally {
    if (previousDotenvPath === undefined) {
      delete process.env.DOTENV_CONFIG_PATH;
    } else {
      process.env.DOTENV_CONFIG_PATH = previousDotenvPath;
    }

    fs.rmSync(extendEnvPath, { force: true });
    await closeServer(dynamicExtendServer);
  }

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

  const assignParentId = "ee4c9500-4d82-4800-b6c0-580a420d9d6d";
  const assignPlanId = "c15bbdb4-1c51-4dbb-a439-cf849619547d";
  const assignQueries = [];
  const assignDb = {
    one(sql, values) {
      assignQueries.push({ method: "one", sql, values });

      if (/FROM users WHERE id = \$1 AND active = true/.test(sql)) {
        return values[0] === superAdmin.id ? superAdmin : null;
      }

      if (/FROM users WHERE id = \$1 AND role = 'parent'/.test(sql)) {
        return values[0] === assignParentId
          ? { id: assignParentId, role: "parent", active: true }
          : null;
      }

      if (/FROM users WHERE id = \$1$/.test(sql)) {
        return values[0] === assignParentId
          ? { id: assignParentId, role: "parent", active: true }
          : null;
      }

      if (/FROM plans WHERE lower\(slug\)/.test(sql)) {
        return null;
      }

      throw new Error(`unexpected assign one query: ${sql}`);
    },
    many() {
      throw new Error("unexpected assign many query");
    },
    query(sql, values) {
      assignQueries.push({ method: "query", sql, values });

      if (/INSERT INTO plans/.test(sql)) {
        return {
          rows: [{
            id: assignPlanId,
            name: values[0],
            description: values[1],
            slug: values[2],
            package_code: values[3],
            price_cents: values[4],
            currency: values[5],
            duration_days: values[6],
            max_children: values[7],
            active: values[8]
          }]
        };
      }

      if (/UPDATE subscriptions SET status = 'canceled'/.test(sql)) {
        return { rows: [] };
      }

      if (/INSERT INTO subscriptions/.test(sql)) {
        return {
          rows: [{
            id: "4892b175-5216-4f37-a03e-4063be04fddf",
            user_id: values[0],
            plan_id: values[1],
            status: values[2],
            starts_at: values[3],
            ends_at: values[4],
            auto_renew: values[5]
          }]
        };
      }

      throw new Error(`unexpected assign write: ${sql}`);
    }
  };
  const assignApp = express();
  assignApp.use(express.json());
  assignApp.use((request, response, next) => {
    request.legacyDb = assignDb;
    next();
  });
  assignApp.use("/api/v1", createLegacyRoutes({
    config: { maxVideoUploadMb: 1 },
    contentMovies: null,
    media: {
      upload() {
        return { single: () => (request, response, next) => next() };
      }
    },
    tariffs: {
      findById(id) {
        return id === "premium"
          ? {
              id: "premium",
              title: { en: "Premium", ru: "Premium", uz: "Premium" },
              description: { en: "Premium access", ru: "Premium access", uz: "Premium access" },
              price_cents: 4900000,
              currency: "UZS"
            }
          : null;
      }
    }
  }));
  const assignServer = await listenApp(assignApp);

  try {
    const assignResponse = await fetch(`http://127.0.0.1:${assignServer.address().port}/api/v1/users/${assignParentId}/plan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${legacyUserToken(superAdmin)}`
      },
      body: JSON.stringify({ tariff_id: "premium" })
    });
    const assignBody = await assignResponse.json();

    assert.equal(assignResponse.status, 201);
    assert.equal(assignBody.user_id, assignParentId);
    assert.equal(assignBody.plan_id, assignPlanId);
    assert.equal(assignQueries.some((query) => query.method === "query" && /INSERT INTO plans/.test(query.sql) && query.values[3] === "premium"), true);
    assert.equal(assignQueries.some((query) => query.method === "query" && /UPDATE subscriptions SET status = 'canceled'/.test(query.sql)), true);
  } finally {
    await closeServer(assignServer);
  }

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

      if (/FROM series WHERE id = \$1/.test(sql)) {
        return values[0] === movieSeriesId ? { id: movieSeriesId } : null;
      }

      throw new Error(`unexpected query: ${sql}`);
    },
    many(sql, values) {
      fakeQueries.push({ method: "many", sql, values });

      if (/FROM content c[\s\S]*WHERE c\.series_id = \$1/.test(sql)) {
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

    const seriesCommentResponse = await fetch(`${commentsBaseUrl}/api/v1/content/${movieSeriesId}/comments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${legacyUserToken(fakeUser)}`
      },
      body: JSON.stringify({ body: "Series comment" })
    });
    const seriesCommentBody = await seriesCommentResponse.json();
    const seriesInsertQuery = fakeQueries
      .filter((query) => query.method === "query" && /INSERT INTO comments/.test(query.sql))
      .at(-1);

    assert.equal(seriesCommentResponse.status, 201);
    assert.equal(seriesCommentBody.content_id, movieSeriesId);
    assert.equal(seriesCommentBody.target_type, "content");
    assert.equal(seriesCommentBody.target_id, movieSeriesId);
    assert.equal(seriesCommentBody.body, "Series comment");
    assert.equal(seriesInsertQuery.values[1], null);
    assert.equal(seriesInsertQuery.values[2], "content");
    assert.equal(seriesInsertQuery.values[3], movieSeriesId);

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

  const visibilityParentId = "52a3e7e4-3e8d-4bea-8c35-a6811a102bbc";
  const visibilityChildId = "7447d81f-920c-4245-bc33-afca1c6191eb";
  const visibilityDevice = {
    id: "70ad9484-e170-448f-adea-602ae1f2c63a",
    child_id: visibilityChildId
  };
  const visibilitySeriesId = "d9c69d2b-f73d-4a52-bd39-cd341c55b040";
  const visibilityEpisodeOneId = "2c5f5c53-eb7f-42af-a662-0bf656e96522";
  const visibilityEpisodeTwoId = "6092a3ca-bba5-4de7-84bf-c00c459d4b62";
  const visibilityParent = {
    id: visibilityParentId,
    email: "visibility-parent@example.com",
    role: "parent",
    active: true
  };
  const visibilitySeries = {
    id: visibilitySeriesId,
    title: { en: "Visibility Series", ru: "Visibility Series RU", uz: "Visibility Series UZ" },
    description: {},
    kind: "episodes",
    slug: "visibility-series",
    active: true,
    category_id: null,
    created_at: "2026-06-15T00:00:00.000Z",
    updated_at: "2026-06-15T00:00:00.000Z"
  };
  const visibilityEpisodes = [
    {
      id: visibilityEpisodeOneId,
      title: { en: "Episode One", ru: "Episode One RU", uz: "Episode One UZ" },
      description: {},
      series_id: visibilitySeriesId,
      published: true,
      season_number: 1,
      episode_number: 1,
      created_at: "2026-06-15T01:00:00.000Z",
      updated_at: "2026-06-15T01:00:00.000Z"
    },
    {
      id: visibilityEpisodeTwoId,
      title: { en: "Episode Two", ru: "Episode Two RU", uz: "Episode Two UZ" },
      description: {},
      series_id: visibilitySeriesId,
      published: true,
      season_number: 1,
      episode_number: 2,
      created_at: "2026-06-15T02:00:00.000Z",
      updated_at: "2026-06-15T02:00:00.000Z"
    }
  ];
  const visibilityPermissions = [];
  const visibilityDb = {
    one(sql, values) {
      if (/FROM users WHERE id = \$1 AND active = true/.test(sql)) {
        return values[0] === visibilityParentId ? visibilityParent : null;
      }

      if (/FROM child_devices WHERE id = \$1 AND revoked_at IS NULL/.test(sql)) {
        return values[0] === visibilityDevice.id ? visibilityDevice : null;
      }

      if (/SELECT parent_id FROM children WHERE id = \$1/.test(sql)) {
        return values[0] === visibilityChildId ? { parent_id: visibilityParentId } : null;
      }

      if (/SELECT id FROM children WHERE id = \$1 AND parent_id = \$2/.test(sql)) {
        return values[0] === visibilityChildId && values[1] === visibilityParentId
          ? { id: visibilityChildId }
          : null;
      }

      if (/SELECT id, series_id FROM content WHERE id = \$1/.test(sql)) {
        const episode = visibilityEpisodes.find((item) => item.id === values[0]);
        return episode ? { id: episode.id, series_id: episode.series_id } : null;
      }

      if (/SELECT id FROM series WHERE id = \$1/.test(sql)) {
        return values[0] === visibilitySeriesId ? { id: visibilitySeriesId } : null;
      }

      if (/FROM child_permissions p[\s\S]*JOIN series s ON s\.id = \$2/.test(sql)) {
        return visibilityPermissions.some((permission) => (
          permission.child_id === values[0]
          && permission.mode === "deny"
          && permission.series_id === values[1]
        ))
          ? { "?column?": 1 }
          : null;
      }

      if (/SELECT \* FROM child_permissions WHERE child_id = \$1/.test(sql)) {
        const field = /series_id = \$2/.test(sql) ? "series_id" : "content_id";
        return visibilityPermissions.find((permission) => (
          permission.child_id === values[0]
          && permission.mode === "deny"
          && permission[field] === values[1]
        )) || null;
      }

      if (/SELECT COUNT\(\*\)::integer AS count FROM likes/.test(sql)) {
        return { count: 0 };
      }

      if (/SELECT 1 FROM likes/.test(sql)) {
        return null;
      }

      throw new Error(`unexpected visibility one query: ${sql}`);
    },
    many(sql, values) {
      if (/SELECT id FROM content WHERE series_id = \$1/.test(sql)) {
        return values[0] === visibilitySeriesId
          ? visibilityEpisodes.map((episode) => ({ id: episode.id }))
          : [];
      }

      if (/FROM content c[\s\S]*WHERE c\.series_id = \$1/.test(sql)) {
        assert.match(sql, /p\.content_id = c\.id/);
        assert.match(sql, /p\.series_id IS NOT NULL AND p\.series_id = c\.series_id/);
        const seriesBlocked = visibilityPermissions.some((permission) => (
          permission.child_id === visibilityChildId
          && permission.series_id === visibilitySeriesId
        ));

        return seriesBlocked
          ? []
          : visibilityEpisodes.filter((episode) => !visibilityPermissions.some((permission) => (
            permission.child_id === visibilityChildId
            && permission.content_id === episode.id
          )));
      }

      if (/SELECT s\.\*[\s\S]*FROM series s/.test(sql)) {
        assert.match(sql, /p\.series_id IS NOT NULL AND p\.series_id = s\.id/);
        assert.doesNotMatch(sql, /p\.content_id/);
        const seriesBlocked = visibilityPermissions.some((permission) => (
          permission.child_id === visibilityChildId
          && permission.series_id === visibilitySeriesId
        ));

        return seriesBlocked ? [] : [visibilitySeries];
      }

      throw new Error(`unexpected visibility many query: ${sql}`);
    },
    query(sql, values) {
      if (/INSERT INTO child_permissions/.test(sql)) {
        const permission = {
          id: `permission-${visibilityPermissions.length + 1}`,
          child_id: values[0],
          mode: values[1],
          category_id: values[2],
          content_id: values[3],
          series_id: values[4],
          created_at: "2026-06-15T03:00:00.000Z"
        };
        visibilityPermissions.push(permission);
        return { rows: [permission], rowCount: 1 };
      }

      if (/DELETE FROM child_permissions/.test(sql)) {
        const field = /series_id = \$2/.test(sql) ? "series_id" : "content_id";
        const index = visibilityPermissions.findIndex((permission) => (
          permission.child_id === values[0]
          && permission.mode === "deny"
          && permission[field] === values[1]
        ));
        if (index !== -1) {
          visibilityPermissions.splice(index, 1);
        }
        return { rows: [], rowCount: index === -1 ? 0 : 1 };
      }

      throw new Error(`unexpected visibility write: ${sql}`);
    }
  };
  const visibilityApp = express();
  visibilityApp.use(express.json());
  visibilityApp.use((request, response, next) => {
    request.legacyDb = visibilityDb;
    next();
  });
  visibilityApp.use("/api/v1", createLegacyRoutes({
    config: { maxVideoUploadMb: 1 },
    media: fakeMedia
  }));
  const visibilityServer = await listenApp(visibilityApp);

  try {
    const visibilityBaseUrl = `http://127.0.0.1:${visibilityServer.address().port}`;
    const parentHeaders = {
      "content-type": "application/json",
      authorization: `Bearer ${legacyUserToken(visibilityParent)}`
    };
    const deviceHeaders = {
      authorization: `Bearer ${legacyChildDeviceToken(visibilityDevice)}`
    };
    const blockSeriesResponse = await fetch(
      `${visibilityBaseUrl}/api/v1/children/${visibilityChildId}/blacklist`,
      {
        method: "POST",
        headers: parentHeaders,
        body: JSON.stringify({ series_id: visibilitySeriesId })
      }
    );
    const blockSeriesBody = await blockSeriesResponse.json();

    assert.equal(blockSeriesResponse.status, 201);
    assert.equal(blockSeriesBody.target_type, "series");
    assert.equal(blockSeriesBody.series_id, visibilitySeriesId);
    assert.equal(visibilityPermissions.length, 1);
    assert.equal(visibilityPermissions[0].series_id, visibilitySeriesId);
    assert.equal(visibilityPermissions[0].content_id, null);

    const blockedSeriesListResponse = await fetch(`${visibilityBaseUrl}/api/v1/series`, {
      headers: deviceHeaders
    });
    const blockedSeriesListBody = await blockedSeriesListResponse.json();
    assert.equal(blockedSeriesListResponse.status, 200);
    assert.deepEqual(blockedSeriesListBody, []);

    const blockedSeriesDetailResponse = await fetch(
      `${visibilityBaseUrl}/api/v1/series/${visibilitySeriesId}`,
      { headers: deviceHeaders }
    );
    const blockedSeriesDetailBody = await blockedSeriesDetailResponse.json();
    assert.equal(blockedSeriesDetailResponse.status, 404);
    assert.equal(blockedSeriesDetailBody.error, "series_not_found");

    const blockedSeriesEpisodesResponse = await fetch(
      `${visibilityBaseUrl}/api/v1/series/${visibilitySeriesId}/episodes`,
      { headers: deviceHeaders }
    );
    const blockedSeriesEpisodesBody = await blockedSeriesEpisodesResponse.json();
    assert.equal(blockedSeriesEpisodesResponse.status, 200);
    assert.deepEqual(blockedSeriesEpisodesBody, []);

    const unblockSeriesResponse = await fetch(
      `${visibilityBaseUrl}/api/v1/children/${visibilityChildId}/blacklist/${visibilitySeriesId}`,
      {
        method: "DELETE",
        headers: parentHeaders
      }
    );
    assert.equal(unblockSeriesResponse.status, 200);
    assert.equal(visibilityPermissions.length, 0);

    const blockEpisodeResponse = await fetch(
      `${visibilityBaseUrl}/api/v1/children/${visibilityChildId}/blacklist`,
      {
        method: "POST",
        headers: parentHeaders,
        body: JSON.stringify({ content_id: visibilityEpisodeOneId })
      }
    );
    const blockEpisodeBody = await blockEpisodeResponse.json();

    assert.equal(blockEpisodeResponse.status, 201);
    assert.equal(blockEpisodeBody.target_type, "content");
    assert.equal(blockEpisodeBody.content_id, visibilityEpisodeOneId);
    assert.equal(blockEpisodeBody.series_id, visibilitySeriesId);
    assert.equal(visibilityPermissions.length, 1);
    assert.equal(visibilityPermissions[0].content_id, visibilityEpisodeOneId);
    assert.equal(visibilityPermissions[0].series_id, null);

    const visibleSeriesListResponse = await fetch(`${visibilityBaseUrl}/api/v1/series`, {
      headers: deviceHeaders
    });
    const visibleSeriesListBody = await visibleSeriesListResponse.json();
    assert.equal(visibleSeriesListResponse.status, 200);
    assert.equal(visibleSeriesListBody.length, 1);
    assert.equal(visibleSeriesListBody[0].id, visibilitySeriesId);

    const filteredEpisodesResponse = await fetch(
      `${visibilityBaseUrl}/api/v1/series/${visibilitySeriesId}/episodes`,
      { headers: deviceHeaders }
    );
    const filteredEpisodesBody = await filteredEpisodesResponse.json();
    assert.equal(filteredEpisodesResponse.status, 200);
    assert.equal(filteredEpisodesBody.length, 1);
    assert.equal(filteredEpisodesBody[0].id, visibilityEpisodeTwoId);
  } finally {
    await closeServer(visibilityServer);
  }

  const likeParentId = "9df0170b-f0c7-4f47-b2af-c99787704633";
  const likeChildId = "1e4c8fa8-9465-4a58-840b-284a2f91b7a8";
  const likeDevice = {
    id: "d4d42403-e64b-41a5-bff7-6c7645e452b5",
    child_id: likeChildId
  };
  const likedSeriesId = "650135c9-21ec-40f2-bf6e-84e72d6c9ad2";
  const likedSeriesRow = {
    id: likedSeriesId,
    title: { en: "Liked Series", ru: "Liked Series RU", uz: "Liked Series UZ" },
    description: { en: "Series description" },
    kind: "seasons",
    slug: "liked-series",
    active: true,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z"
  };
  const likedMovieId = "1f2e1a5b-91d9-4a3b-82fa-6a2d48b4d5fa";
  const likedMovieRow = {
    id: likedMovieId,
    title: { en: "Liked Movie", ru: "Liked Movie RU", uz: "Liked Movie UZ" },
    description: { en: "Movie description" },
    poster: { url: "/media/uploads/liked-movie.png" },
    source: { path: "uploads/liked-movie.mp4" },
    content_type: "movie",
    published: true,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z"
  };
  const storeLikeRows = [
    {
      ownerId: likeParentId,
      targetType: "content",
      targetId: likedMovieId,
      createdAt: "2026-06-14T00:00:00.000Z"
    }
  ];
  const likeRows = [];
  const likesContentMovies = {
    findById(id) {
      return id === likedMovieId ? likedMovieRow : null;
    }
  };
  const likesContentLikes = {
    countByTarget(targetId, targetType = "content") {
      return storeLikeRows.filter((row) => row.targetId === targetId && row.targetType === targetType).length;
    },
    listByOwnerId(ownerId) {
      return storeLikeRows.filter((row) => row.ownerId === ownerId);
    }
  };
  const likesDb = {
    one(sql, values) {
      if (/FROM child_devices WHERE id = \$1 AND revoked_at IS NULL/.test(sql)) {
        return values[0] === likeDevice.id ? likeDevice : null;
      }

      if (/SELECT parent_id FROM children WHERE id = \$1/.test(sql)) {
        return values[0] === likeChildId ? { parent_id: likeParentId } : null;
      }

      if (/SELECT id FROM content WHERE id = \$1/.test(sql)) {
        return null;
      }

      if (/SELECT id FROM series WHERE id = \$1/.test(sql)) {
        return values[0] === likedSeriesId ? { id: likedSeriesId } : null;
      }

      if (/FROM child_permissions p[\s\S]*JOIN series s ON s\.id = \$2/.test(sql)) {
        return null;
      }

      if (/SELECT 1 FROM likes WHERE user_id = \$1 AND target_type = \$2 AND target_id = \$3/.test(sql)) {
        return likeRows.some((row) => (
          row.user_id === values[0]
          && row.target_type === values[1]
          && row.target_id === values[2]
        ))
          ? { "?column?": 1 }
          : null;
      }

      if (/SELECT COUNT\(\*\)::integer AS count FROM likes WHERE target_type = \$1 AND target_id = \$2/.test(sql)) {
        return {
          count: likeRows.filter((row) => row.target_type === values[0] && row.target_id === values[1]).length
        };
      }

      throw new Error(`unexpected likes one query: ${sql}`);
    },
    many(sql, values) {
      if (/SELECT s\.\*[\s\S]*FROM series s/.test(sql)) {
        return [{ ...likedSeriesRow }];
      }

      if (/FROM likes l[\s\S]*LEFT JOIN series s/.test(sql)) {
        return likeRows
          .filter((row) => row.user_id === values[0] && row.target_type === "series" && row.target_id === likedSeriesId)
          .map((row) => ({
            target_type: row.target_type,
            target_id: row.target_id,
            liked_at: row.created_at,
            content_row: null,
            series_row: likedSeriesRow
          }));
      }

      throw new Error(`unexpected likes many query: ${sql}`);
    },
    query(sql, values) {
      if (/INSERT INTO likes/.test(sql)) {
        const [userId, contentId, targetType, targetId] = values;
        if (!likeRows.some((row) => row.user_id === userId && row.target_type === targetType && row.target_id === targetId)) {
          likeRows.push({
            user_id: userId,
            content_id: contentId,
            target_type: targetType,
            target_id: targetId,
            created_at: "2026-06-13T00:00:00.000Z"
          });
        }
        return { rows: [] };
      }

      if (/SELECT \* FROM series WHERE id = \$1/.test(sql)) {
        return { rows: values[0] === likedSeriesId ? [{ ...likedSeriesRow }] : [] };
      }

      if (/DELETE FROM likes WHERE user_id = \$1 AND target_type = \$2 AND target_id = \$3/.test(sql)) {
        const index = likeRows.findIndex((row) => (
          row.user_id === values[0]
          && row.target_type === values[1]
          && row.target_id === values[2]
        ));
        if (index !== -1) {
          likeRows.splice(index, 1);
        }
        return { rows: [] };
      }

      throw new Error(`unexpected likes write: ${sql}`);
    }
  };
  const likesApp = express();
  likesApp.use(express.json());
  likesApp.use((request, response, next) => {
    request.legacyDb = likesDb;
    next();
  });
  likesApp.use("/api/v1", createLegacyRoutes({
    config: { maxVideoUploadMb: 1 },
    contentLikes: likesContentLikes,
    contentMovies: likesContentMovies,
    media: fakeMedia
  }));
  const likesServer = await listenApp(likesApp);

  try {
    const likesBaseUrl = `http://127.0.0.1:${likesServer.address().port}`;
    const childDeviceHeaders = {
      authorization: `Bearer ${legacyChildDeviceToken(likeDevice)}`
    };
    const initialLikeResponse = await fetch(`${likesBaseUrl}/api/v1/content/${likedSeriesId}/like`, {
      headers: childDeviceHeaders
    });
    const initialLikeBody = await initialLikeResponse.json();

    assert.equal(initialLikeResponse.status, 200);
    assert.equal(initialLikeBody.liked, false);
    assert.equal(initialLikeBody.target_type, "series");
    assert.equal(initialLikeBody.target_id, likedSeriesId);

    const createLikeResponse = await fetch(`${likesBaseUrl}/api/v1/content/${likedSeriesId}/like`, {
      method: "POST",
      headers: childDeviceHeaders
    });
    const createLikeBody = await createLikeResponse.json();

    assert.equal(createLikeResponse.status, 201);
    assert.equal(createLikeBody.liked, true);
    assert.equal(createLikeBody.target_type, "series");
    assert.equal(likeRows[0].user_id, likeParentId);
    assert.equal(likeRows[0].content_id, null);

    const likedSeriesDetailResponse = await fetch(`${likesBaseUrl}/api/v1/series/${likedSeriesId}`, {
      headers: childDeviceHeaders
    });
    const likedSeriesDetailBody = await likedSeriesDetailResponse.json();

    assert.equal(likedSeriesDetailResponse.status, 200);
    assert.equal(likedSeriesDetailBody.id, likedSeriesId);
    assert.equal(likedSeriesDetailBody.item_type, "series");
    assert.equal(likedSeriesDetailBody.target_type, "series");
    assert.equal(likedSeriesDetailBody.target_id, likedSeriesId);
    assert.equal(likedSeriesDetailBody.is_liked, true);
    assert.equal(likedSeriesDetailBody.likes_count, 1);

    const likedSeriesListResponse = await fetch(`${likesBaseUrl}/api/v1/series`, {
      headers: childDeviceHeaders
    });
    const likedSeriesListBody = await likedSeriesListResponse.json();

    assert.equal(likedSeriesListResponse.status, 200);
    assert.equal(likedSeriesListBody.length, 1);
    assert.equal(likedSeriesListBody[0].id, likedSeriesId);
    assert.equal(likedSeriesListBody[0].is_liked, true);
    assert.equal(likedSeriesListBody[0].likes_count, 1);

    const likedListResponse = await fetch(`${likesBaseUrl}/api/v1/me/likes`, {
      headers: childDeviceHeaders
    });
    const likedListBody = await likedListResponse.json();

    assert.equal(likedListResponse.status, 200);
    assert.equal(likedListBody.data.length, 1);
    assert.equal(likedListBody.data[0].item_type, "series");
    assert.equal(likedListBody.data[0].target_id, likedSeriesId);
    assert.equal(likedListBody.data[0].is_liked, true);
    assert.equal(likedListBody.data[0].likes_count, 1);

    const favouritesResponse = await fetch(`${likesBaseUrl}/api/v1/me/favourites`, {
      headers: childDeviceHeaders
    });
    const favouritesBody = await favouritesResponse.json();

    assert.equal(favouritesResponse.status, 200);
    assert.equal(favouritesBody.total, 2);
    assert.equal(favouritesBody.data.length, 2);
    assert.equal(favouritesBody.favourites.length, 2);
    assert.equal(favouritesBody.favorites.length, 2);
    assert.equal(favouritesBody.data[0].item_type, "movie");
    assert.equal(favouritesBody.data[0].target_id, likedMovieId);
    assert.equal(favouritesBody.data[0].is_liked, true);
    assert.equal(favouritesBody.data[0].likes_count, 1);
    assert.equal(favouritesBody.data[1].item_type, "series");
    assert.equal(favouritesBody.data[1].target_id, likedSeriesId);
    assert.equal(favouritesBody.data[1].is_liked, true);

    const v1DeviceHeaders = {
      authorization: `Bearer ${v1DeviceToken({
        id: "d74d7623-7c3e-47d2-92dc-376e8b3a0eca",
        parent_id: likeParentId,
        child_id: likeChildId
      })}`
    };
    const v1TokenSeriesDetailResponse = await fetch(`${likesBaseUrl}/api/v1/series/${likedSeriesId}`, {
      headers: v1DeviceHeaders
    });
    const v1TokenSeriesDetailBody = await v1TokenSeriesDetailResponse.json();

    assert.equal(v1TokenSeriesDetailResponse.status, 200);
    assert.equal(v1TokenSeriesDetailBody.id, likedSeriesId);
    assert.equal(v1TokenSeriesDetailBody.is_liked, true);

    const v1TokenLikeStatusResponse = await fetch(`${likesBaseUrl}/api/v1/content/${likedSeriesId}/like`, {
      headers: v1DeviceHeaders
    });
    const v1TokenLikeStatusBody = await v1TokenLikeStatusResponse.json();

    assert.equal(v1TokenLikeStatusResponse.status, 200);
    assert.equal(v1TokenLikeStatusBody.liked, true);
    assert.equal(v1TokenLikeStatusBody.target_type, "series");

    const deleteLikeResponse = await fetch(`${likesBaseUrl}/api/v1/content/${likedSeriesId}/like`, {
      method: "DELETE",
      headers: childDeviceHeaders
    });
    const deleteLikeBody = await deleteLikeResponse.json();

    assert.equal(deleteLikeResponse.status, 200);
    assert.equal(deleteLikeBody.liked, false);
    assert.equal(likeRows.length, 0);
  } finally {
    await closeServer(likesServer);
  }

  const seriesPosterId = "069f50f5-e0c8-48d3-adc2-d2647ba16d36";
  const seriesPosterAdmin = {
    id: "4df2191a-fe3d-4b2b-a260-162e793516ba",
    email: "poster-admin@example.com",
    name: "Poster Admin",
    role: "admin",
    active: true
  };
  const seriesPosterState = {
    id: seriesPosterId,
    title: { en: "Series" },
    kind: "seasons",
    poster_path: "posters/old-series.png",
    poster_url: "http://127.0.0.1/api/v1/media/posters%2Fold-series.png?expires=1&signature=expired",
    active: true
  };
  const seriesPosterAssets = [
    {
      owner_table: "series",
      owner_id: seriesPosterId,
      kind: "series_poster",
      path: "posters/old-series.png"
    },
    {
      owner_table: "series",
      owner_id: "d7f4a9e7-9f2a-42e7-a132-3c9767fef59f",
      kind: "series_poster",
      path: "posters/other-series.png"
    }
  ];
  const removedPosterPaths = [];
  const fakePosterDb = {
    one(sql, values) {
      if (/FROM users/.test(sql)) return seriesPosterAdmin;
      if (/SELECT \* FROM series WHERE id = \$1/.test(sql)) return values[0] === seriesPosterId ? { ...seriesPosterState } : null;
      if (/SELECT COUNT\(\*\)::integer AS count FROM likes WHERE target_type = \$1 AND target_id = \$2/.test(sql)) return { count: 0 };
      throw new Error(`unexpected poster one query: ${sql}`);
    },
    many(sql, values) {
      if (/SELECT s\.\*[\s\S]*FROM series s/.test(sql)) {
        return [{ ...seriesPosterState }];
      }

      if (/SELECT path FROM media_assets/.test(sql)) {
        return seriesPosterAssets
          .filter((asset) => asset.owner_table === values[0] && asset.owner_id === values[1] && asset.kind === values[2])
          .map((asset) => ({ path: asset.path }));
      }

      throw new Error(`unexpected poster many query: ${sql}`);
    },
    query(sql, values) {
      if (/SELECT \* FROM series WHERE id = \$1/.test(sql)) {
        return { rows: values[0] === seriesPosterId ? [{ ...seriesPosterState }] : [] };
      }

      if (/INSERT INTO media_assets/.test(sql)) {
        const asset = {
          owner_table: values[0],
          owner_id: values[1],
          kind: values[2],
          path: values[3],
          original_name: values[4],
          mime_type: values[5],
          size: values[6]
        };
        seriesPosterAssets.push(asset);
        return { rows: [asset] };
      }

      if (/UPDATE series SET/.test(sql)) {
        seriesPosterState.poster_path = values[1];
        seriesPosterState.poster_url = values[2];
        return { rows: [{ ...seriesPosterState }] };
      }

      if (/DELETE FROM media_assets/.test(sql)) {
        const paths = new Set(values[2]);
        for (let index = seriesPosterAssets.length - 1; index >= 0; index -= 1) {
          const asset = seriesPosterAssets[index];
          if (asset.owner_table === values[0] && asset.owner_id === values[1] && paths.has(asset.path)) {
            seriesPosterAssets.splice(index, 1);
          }
        }
        return { rows: [] };
      }

      throw new Error(`unexpected poster query: ${sql}`);
    }
  };
  const fakePosterMedia = {
    upload() {
      return {
        single() {
          return (request, response, next) => {
            request.file = {
              originalname: "new-series.png",
              mimetype: "image/png",
              size: 128,
              path: "unused"
            };
            next();
          };
        }
      };
    },
    persistFile(kind, file) {
      assert.equal(kind, "series_poster");
      assert.equal(file.originalname, "new-series.png");
      return {
        kind,
        path: "posters/new-series.png",
        original_name: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
        url: "http://127.0.0.1/api/v1/media/posters%2Fnew-series.png?expires=1&signature=temporary"
      };
    },
    remove(storedPath) {
      removedPosterPaths.push(storedPath);
    }
  };
  const seriesPosterApp = express();
  seriesPosterApp.use((request, response, next) => {
    request.legacyDb = fakePosterDb;
    next();
  });
  seriesPosterApp.use("/api/v1", createLegacyRoutes({
    config: { maxVideoUploadMb: 1 },
    media: fakePosterMedia
  }));
  const seriesPosterServer = await listenApp(seriesPosterApp);

  try {
    const seriesPosterBaseUrl = `http://127.0.0.1:${seriesPosterServer.address().port}`;
    const posterResponse = await fetch(`${seriesPosterBaseUrl}/api/v1/series/${seriesPosterId}/poster`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${legacyUserToken(seriesPosterAdmin)}`
      }
    });
    const posterBody = await posterResponse.json();

    assert.equal(posterResponse.status, 200);
    assert.equal(posterBody.poster_path, "posters/new-series.png");
    assert.equal(posterBody.poster_url, `/api/v1/series/${seriesPosterId}/poster`);
    assert.deepEqual(removedPosterPaths, ["posters/old-series.png"]);
    assert.equal(seriesPosterAssets.some((asset) => asset.path === "posters/new-series.png"), true);
    assert.equal(seriesPosterAssets.some((asset) => asset.path === "posters/old-series.png"), false);
    assert.equal(seriesPosterAssets.some((asset) => asset.path === "posters/other-series.png"), true);

    const posterDetailResponse = await fetch(`${seriesPosterBaseUrl}/api/v1/series/${seriesPosterId}`);
    const posterDetailBody = await posterDetailResponse.json();
    const posterListResponse = await fetch(`${seriesPosterBaseUrl}/api/v1/series`);
    const posterListBody = await posterListResponse.json();

    assert.equal(posterDetailResponse.status, 200);
    assert.equal(posterDetailBody.poster_url, `/api/v1/series/${seriesPosterId}/poster`);
    assert.equal(posterListResponse.status, 200);
    assert.equal(posterListBody[0].poster_url, `/api/v1/series/${seriesPosterId}/poster`);
  } finally {
    await closeServer(seriesPosterServer);
  }

  console.log("Legacy contract test passed");
} finally {
  await close();
}

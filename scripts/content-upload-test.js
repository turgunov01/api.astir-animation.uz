import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astir-content-upload-"));
const dataFile = path.join(testRoot, "store.json");
const mediaRoot = path.join(testRoot, "media");
const failingDataFile = path.join(testRoot, "failing-store.json");

process.env.DATA_FILE = dataFile;
process.env.MEDIA_ROOT = mediaRoot;
process.env.JWT_SECRET = "astir-content-upload-test-secret";
process.env.REQUIRE_AUTH = "false";
process.env.TRANSCODER_ENABLED = "true";
process.env.FFMPEG_PATH = "__astir_missing_ffmpeg_for_tests__";

const { createServer } = await import("../app/server.js");
const { createContainer } = await import("../app/bootstrap/createContainer.js");
const { JsonStore } = await import("../app/store/jsonStore.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
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

async function parseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function requestRaw(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);

  return {
    body: await parseBody(response),
    status: response.status
  };
}

async function requestJson(baseUrl, pathName, options = {}) {
  return requestRaw(baseUrl, pathName, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

function movieMetadata(suffix = Date.now()) {
  return {
    title: {
      en: `Multipart Movie ${suffix}`,
      ru: `Multipart Movie RU ${suffix}`,
      uz: `Multipart Movie UZ ${suffix}`
    },
    description: {
      en: "Created by content upload test",
      ru: "Created by content upload test RU",
      uz: "Created by content upload test UZ"
    },
    series: [],
    is_premium: false
  };
}

function videoBlob() {
  return new Blob([Buffer.from("fake mp4 bytes")], { type: "video/mp4" });
}

function uploadFiles() {
  const uploadDir = path.join(mediaRoot, "uploads");

  if (!fs.existsSync(uploadDir)) {
    return [];
  }

  return fs.readdirSync(uploadDir).sort();
}

function multipartMovieBody(metadata, options = {}) {
  const form = new FormData();
  form.append("metadata", typeof metadata === "string" ? metadata : JSON.stringify(metadata));

  if (options.video !== false) {
    form.append("video", videoBlob(), options.fileName || "upload-test.mp4");
  }

  return form;
}

const server = createServer();
let failingServer = null;

try {
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  const createResponse = await requestRaw(baseUrl, "/v1/content/movies/create", {
    method: "POST",
    body: multipartMovieBody(movieMetadata(), { fileName: "upload-test.mp4" })
  });

  assert.equal(createResponse.status, 201);
  assert.equal(typeof createResponse.body.data.id, "string");
  assert.equal(createResponse.body.movie.id, createResponse.body.data.id);
  assert.equal(createResponse.body.data.media.has_source, true);
  assert.equal(createResponse.body.data.media.original_name, "upload-test.mp4");
  assert.equal(createResponse.body.data.transcode_status, "queued");
  assert.equal(typeof createResponse.body.data.transcode_job_id, "string");
  assert.match(createResponse.body.data.video_url, /^\/media\/uploads\//);
  assert.equal(fs.existsSync(createResponse.body.data.storage_path), true);

  const movieId = createResponse.body.data.id;
  const videoUrl = createResponse.body.data.video_url;

  const listedMovies = await requestJson(baseUrl, "/v1/content/movies");
  assert.equal(listedMovies.status, 200);
  assert.equal(
    listedMovies.body.movies.some((movie) => movie.id === movieId),
    true
  );

  const singleMovie = await requestJson(baseUrl, `/v1/content/movies/${movieId}`);
  assert.equal(singleMovie.status, 200);
  assert.equal(singleMovie.body.movie.id, movieId);
  assert.equal(singleMovie.body.movie.video_url, videoUrl);

  const metadataOnlyResponse = await requestRaw(baseUrl, "/v1/content/movies/create", {
    method: "POST",
    body: multipartMovieBody(movieMetadata("metadata-only"), { video: false })
  });

  assert.equal(metadataOnlyResponse.status, 201);
  assert.equal(typeof metadataOnlyResponse.body.data.id, "string");
  assert.equal(metadataOnlyResponse.body.data.source, null);
  assert.equal(metadataOnlyResponse.body.data.video_url, null);
  assert.equal(metadataOnlyResponse.body.data.transcode_status, "missing_source");

  const filesBeforeInvalidMetadata = uploadFiles();
  const invalidMetadataResponse = await requestRaw(baseUrl, "/v1/content/movies/create", {
    method: "POST",
    body: multipartMovieBody("{invalid-json", { fileName: "invalid-metadata.mp4" })
  });

  assert.equal(invalidMetadataResponse.status, 400);
  assert.equal(invalidMetadataResponse.body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(uploadFiles(), filesBeforeInvalidMetadata);

  const failingContainer = createContainer({ store: new JsonStore(failingDataFile) });
  failingContainer.middleware.upload = {
    single(fieldName) {
      assert.equal(fieldName, "video");

      return (request, response, next) => {
        next(new Error("Simulated storage failure"));
      };
    }
  };
  failingServer = createServer({ container: failingContainer });

  const failingPort = await listen(failingServer);
  const failingBaseUrl = `http://127.0.0.1:${failingPort}`;
  const storageFailureResponse = await requestRaw(failingBaseUrl, "/v1/content/movies/create", {
    method: "POST",
    body: multipartMovieBody(movieMetadata("storage-failure"), { fileName: "storage-failure.mp4" })
  });

  assert.equal(storageFailureResponse.status, 500);
  assert.equal(storageFailureResponse.body.error.code, "INTERNAL_SERVER_ERROR");

  const moviesAfterStorageFailure = await requestJson(failingBaseUrl, "/v1/content/movies");
  assert.equal(moviesAfterStorageFailure.status, 200);
  assert.equal(moviesAfterStorageFailure.body.movies.length, 0);

  console.log("Content upload test passed");
} finally {
  if (failingServer) {
    await close(failingServer);
  }

  await close(server);
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  fs.rmSync(testRoot, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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
const { buildHlsMasterPlaylist, hlsRenditionProfiles } = await import("../app/lib/hlsProfiles.js");
const { createTranscoderService } = await import("../app/services/transcoderService.js");
const { JsonStore } = await import("../app/store/jsonStore.js");

const masterPlaylist = buildHlsMasterPlaylist(hlsRenditionProfiles.map((profile) => ({
  ...profile,
  playlistFile: `${profile.directory}/index.m3u8`
})));
assert.match(masterPlaylist, /#EXT-X-STREAM-INF:BANDWIDTH=1000000/);
assert.match(masterPlaylist, /360p\/index\.m3u8/);
assert.match(masterPlaylist, /1080p\/index\.m3u8/);

async function waitForTranscode(getMovie) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const movieRecord = getMovie();

    if (movieRecord.transcode?.status === "ready" || movieRecord.transcode?.status === "failed") {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error("Timed out waiting for fake transcode");
}

function fakeFfmpegSpawn(command, args) {
  const childProcess = new EventEmitter();
  const playlistPath = args[args.length - 1];

  childProcess.kill = () => {
    childProcess.emit("close", 143);
  };

  queueMicrotask(() => {
    try {
      assert.equal(command, "fake-ffmpeg");
      fs.mkdirSync(path.dirname(playlistPath), { recursive: true });
      fs.writeFileSync(playlistPath, "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST\n");
      childProcess.emit("close", 0);
    } catch (error) {
      childProcess.emit("error", error);
    }
  });

  return childProcess;
}

async function assertMultiRenditionTranscode() {
  const sourcePath = path.join(testRoot, "source.mp4");
  const transcodeMediaRoot = path.join(testRoot, "transcoded-media");
  const movie = {
    id: "movie-multi-rendition-test",
    source: { path: sourcePath },
    transcode: { status: "queued" }
  };
  const records = new Map([[movie.id, movie]]);
  const contentMovies = {
    findById(id) {
      return records.get(id) || null;
    },
    update(id, attributes) {
      const updated = {
        ...records.get(id),
        ...attributes
      };
      records.set(id, updated);
      return updated;
    }
  };
  const transcoder = createTranscoderService({
    config: {
      mediaRoot: transcodeMediaRoot,
      ffmpegPath: "fake-ffmpeg",
      transcoderEnabled: true
    },
    contentMovies,
    spawnProcess: fakeFfmpegSpawn
  });

  fs.writeFileSync(sourcePath, "fake mp4 bytes");
  transcoder.ensureMovieTranscoded(movie);
  await waitForTranscode(() => records.get(movie.id));

  const updatedMovie = records.get(movie.id);
  const masterPath = path.join(transcodeMediaRoot, "hls", movie.id, "master.m3u8");

  assert.equal(updatedMovie.transcode.status, "ready");
  assert.equal(updatedMovie.transcode.hlsUrl, `/media/hls/${movie.id}/master.m3u8`);
  assert.deepEqual(updatedMovie.transcode.renditions.map((rendition) => rendition.quality), ["360", "480", "720", "1080"]);
  assert.equal(fs.existsSync(masterPath), true);
  assert.match(fs.readFileSync(masterPath, "utf8"), /1080p\/index\.m3u8/);
}

await assertMultiRenditionTranscode();

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

function categoryMetadata(suffix = Date.now()) {
  return {
    title: {
      en: `Multipart Category ${suffix}`,
      ru: `Multipart Category RU ${suffix}`,
      uz: `Multipart Category UZ ${suffix}`
    },
    description: {
      en: "Created by category icon upload test",
      ru: "Created by category icon upload test RU",
      uz: "Created by category icon upload test UZ"
    }
  };
}

function videoBlob() {
  return new Blob([Buffer.from("fake mp4 bytes")], { type: "video/mp4" });
}

function imageBlob() {
  return new Blob([Buffer.from("fake png bytes")], { type: "image/png" });
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

function multipartCategoryBody(metadata, options = {}) {
  const form = new FormData();

  if (metadata !== null) {
    form.append("metadata", typeof metadata === "string" ? metadata : JSON.stringify(metadata));
  }

  if (options.icon !== false) {
    form.append("icon", imageBlob(), options.fileName || "category-icon.png");
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
  assert.equal(createResponse.body.data.playback.hls_url, null);
  assert.deepEqual(createResponse.body.data.playback.qualities, []);
  assert.deepEqual(createResponse.body.data.playback.renditions, []);
  assert.equal(fs.existsSync(createResponse.body.data.storage_path), true);

  const movieId = createResponse.body.data.id;
  const videoUrl = createResponse.body.data.video_url;
  const storagePath = createResponse.body.data.storage_path;

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

  const hlsDir = path.join(mediaRoot, "hls", movieId);
  fs.mkdirSync(hlsDir, { recursive: true });
  fs.writeFileSync(path.join(hlsDir, "master.m3u8"), "#EXTM3U\n");

  const deleteMovieResponse = await requestJson(baseUrl, `/v1/content/movies/${movieId}`, {
    method: "DELETE"
  });

  assert.equal(deleteMovieResponse.status, 200);
  assert.equal(deleteMovieResponse.body.deleted, true);
  assert.equal(fs.existsSync(storagePath), false);
  assert.equal(fs.existsSync(hlsDir), false);

  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  assert.equal(fs.existsSync(storagePath), false);
  assert.equal(fs.existsSync(hlsDir), false);

  const moviesAfterDelete = await requestJson(baseUrl, "/v1/content/movies");
  assert.equal(
    moviesAfterDelete.body.movies.some((movie) => movie.id === movieId),
    false
  );

  const metadataOnlyResponse = await requestRaw(baseUrl, "/v1/content/movies/create", {
    method: "POST",
    body: multipartMovieBody(movieMetadata("metadata-only"), { video: false })
  });

  assert.equal(metadataOnlyResponse.status, 201);
  assert.equal(typeof metadataOnlyResponse.body.data.id, "string");
  assert.equal(metadataOnlyResponse.body.data.source, null);
  assert.equal(metadataOnlyResponse.body.data.video_url, null);
  assert.equal(metadataOnlyResponse.body.data.transcode_status, "missing_source");
  assert.deepEqual(metadataOnlyResponse.body.data.playback.renditions, []);

  const metadataOnlyMovieId = metadataOnlyResponse.body.data.id;
  const seriesUploadResponse = await requestRaw(baseUrl, `/v1/content/movies/${metadataOnlyMovieId}/series`, {
    method: "POST",
    body: multipartMovieBody(movieMetadata("series-upload"), { fileName: "series-upload.mp4" })
  });

  assert.equal(seriesUploadResponse.status, 201);
  assert.equal(typeof seriesUploadResponse.body.series_item.id, "string");
  assert.equal(seriesUploadResponse.body.series_item.media.has_source, true);
  assert.equal(fs.existsSync(seriesUploadResponse.body.series_item.storage_path), true);

  const seriesMovieId = seriesUploadResponse.body.series_item.id;
  const seriesStoragePath = seriesUploadResponse.body.series_item.storage_path;
  const seriesHlsDir = path.join(mediaRoot, "hls", seriesMovieId);
  fs.mkdirSync(seriesHlsDir, { recursive: true });
  fs.writeFileSync(path.join(seriesHlsDir, "master.m3u8"), "#EXTM3U\n");

  const deleteParentMovieResponse = await requestJson(baseUrl, `/v1/content/movies/${metadataOnlyMovieId}`, {
    method: "DELETE"
  });

  assert.equal(deleteParentMovieResponse.status, 200);
  assert.equal(deleteParentMovieResponse.body.deleted, true);
  assert.equal(fs.existsSync(seriesStoragePath), false);
  assert.equal(fs.existsSync(seriesHlsDir), false);

  const moviesAfterCascadeDelete = await requestJson(baseUrl, "/v1/content/movies");
  assert.equal(
    moviesAfterCascadeDelete.body.movies.some((movie) => movie.id === metadataOnlyMovieId || movie.id === seriesMovieId),
    false
  );

  const categoryUploadResponse = await requestRaw(baseUrl, "/v1/content/categories/create", {
    method: "POST",
    body: multipartCategoryBody(categoryMetadata(), { fileName: "category-icon.png" })
  });

  assert.equal(categoryUploadResponse.status, 201);
  assert.equal(typeof categoryUploadResponse.body.category.id, "string");
  assert.match(categoryUploadResponse.body.category.icon_url, /^\/media\/uploads\//);
  assert.equal(categoryUploadResponse.body.category.icon.original_name, "category-icon.png");
  assert.equal(categoryUploadResponse.body.category.icon.mime_type, "image/png");
  assert.equal(fs.existsSync(categoryUploadResponse.body.category.icon.storage_path), true);

  const categoryId = categoryUploadResponse.body.category.id;
  const firstIconPath = categoryUploadResponse.body.category.icon.storage_path;

  const listedCategories = await requestJson(baseUrl, "/v1/content/categories");
  assert.equal(
    listedCategories.body.categories.some((category) => category.id === categoryId && category.icon_url),
    true
  );

  const singleCategory = await requestJson(baseUrl, `/v1/content/categories/${categoryId}`);
  assert.equal(singleCategory.status, 200);
  assert.equal(singleCategory.body.category.id, categoryId);
  assert.equal(singleCategory.body.category.icon_url, categoryUploadResponse.body.category.icon_url);

  const replacementResponse = await requestRaw(baseUrl, `/v1/content/categories/${categoryId}`, {
    method: "PATCH",
    body: multipartCategoryBody(null, { fileName: "replacement-icon.png" })
  });

  assert.equal(replacementResponse.status, 200);
  assert.equal(replacementResponse.body.category.id, categoryId);
  assert.equal(replacementResponse.body.category.icon.original_name, "replacement-icon.png");
  assert.equal(fs.existsSync(firstIconPath), false);
  assert.equal(fs.existsSync(replacementResponse.body.category.icon.storage_path), true);

  const replacementIconPath = replacementResponse.body.category.icon.storage_path;
  const deleteCategoryResponse = await requestJson(baseUrl, `/v1/content/categories/${categoryId}`, {
    method: "DELETE"
  });

  assert.equal(deleteCategoryResponse.status, 200);
  assert.equal(deleteCategoryResponse.body.deleted, true);
  assert.equal(fs.existsSync(replacementIconPath), false);

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
      assert.equal(["video", "icon"].includes(fieldName), true);

      return (request, response, next) => {
        if (fieldName === "video") {
          next(new Error("Simulated storage failure"));
          return;
        }

        next();
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

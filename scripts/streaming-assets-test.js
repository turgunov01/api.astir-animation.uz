// Unit smoke test for the multi-audio HLS streaming layer.
// Runs without a database or FFmpeg: it exercises the master-playlist builder and
// the streaming service's serializeState() shape. For an end-to-end upload check,
// see docs/streaming-multi-audio.md (manual curl steps).
//
//   node scripts/streaming-assets-test.js

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMultiAudioMasterPlaylist } from "../app/lib/hlsProfiles.js";
import { buildMasterPlaylistFromState } from "../app/lib/masterPlaylist.js";
import { createLegacyStreaming } from "../app/legacy/streaming.js";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const renditions = [
  { label: "480p", width: 854, height: 480, bandwidth: 1700000, averageBandwidth: 1200000, playlistFile: "video/480p.m3u8" },
  { label: "720p", width: 1280, height: 720, bandwidth: 3300000, averageBandwidth: 2400000, playlistFile: "video/720p.m3u8" },
  { label: "1080p", width: 1920, height: 1080, bandwidth: 5800000, averageBandwidth: 4300000, playlistFile: "video/1080p.m3u8" }
];

await check("master playlist advertises each external audio track", () => {
  const master = buildMultiAudioMasterPlaylist({
    renditions,
    audioTracks: [
      { languageCode: "uz", label: "Uzbek", uri: "audio/uz/index.m3u8" },
      { languageCode: "ru", label: "Russian", uri: "audio/ru/index.m3u8" },
      { languageCode: "en", label: "English", uri: "audio/en/index.m3u8" }
    ],
    defaultAudioLanguage: "ru"
  });

  assert.match(master, /^#EXTM3U/);
  assert.match(master, /#EXT-X-VERSION:7/);
  assert.equal((master.match(/#EXT-X-MEDIA:TYPE=AUDIO/g) || []).length, 3);
  // The default language must be the only DEFAULT=YES audio.
  assert.match(master, /NAME="Russian",DEFAULT=YES/);
  assert.match(master, /NAME="Uzbek",DEFAULT=NO/);
  // Every variant references the shared audio group and advertises an audio codec.
  assert.equal((master.match(/AUDIO="audio"/g) || []).length, 3);
  assert.match(master, /CODECS="avc1\.640028,mp4a\.40\.2"/);
});

await check("video-only master (no external audio) omits audio group", () => {
  const master = buildMultiAudioMasterPlaylist({ renditions, audioTracks: [] });

  assert.doesNotMatch(master, /#EXT-X-MEDIA/);
  assert.doesNotMatch(master, /AUDIO="audio"/);
  assert.match(master, /CODECS="avc1\.64001f"/);
});

await check("first track becomes default when defaultAudioLanguage is unknown", () => {
  const master = buildMultiAudioMasterPlaylist({
    renditions,
    audioTracks: [
      { languageCode: "uz", label: "Uzbek", uri: "audio/uz/index.m3u8" },
      { languageCode: "en", label: "English", uri: "audio/en/index.m3u8" }
    ],
    defaultAudioLanguage: "xx"
  });

  assert.match(master, /NAME="Uzbek",DEFAULT=YES/);
});

const streaming = createLegacyStreaming({
  config: { mediaRoot: "media", maxVideoUploadMb: 2048, ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", transcoderEnabled: true }
});

const fakeRequest = { protocol: "https", get: (header) => (header === "host" ? "api.astir.uz" : "") };

await check("serializeState returns the public streaming contract with absolute URLs", () => {
  const view = streaming.serializeState({
    asset: {
      status: "ready",
      hls_master_url: "/media/legacy/streaming/movie-1/hls/master.m3u8",
      default_audio_language: "uz",
      duration_seconds: 5400,
      processing_error: null
    },
    audioTracks: [
      { language_code: "uz", label: "Uzbek", is_default: true, hls_playlist_url: "/media/legacy/streaming/movie-1/hls/audio/uz/index.m3u8" },
      { language_code: "ru", label: "Russian", is_default: false, hls_playlist_url: "/media/legacy/streaming/movie-1/hls/audio/ru/index.m3u8" }
    ],
    subtitles: [
      { language_code: "uz", label: "Uzbek", file_url: "/media/legacy/streaming/movie-1/hls/subtitles/uz.vtt" }
    ]
  }, fakeRequest);

  assert.equal(view.streamingStatus, "ready");
  assert.equal(view.defaultAudioLanguage, "uz");
  assert.equal(view.hlsUrl, "https://api.astir.uz/media/legacy/streaming/movie-1/hls/master.m3u8");
  assert.equal(view.audioTracks.length, 2);
  assert.equal(view.audioTracks[0].isDefault, true);
  assert.equal(view.subtitles[0].url, "https://api.astir.uz/media/legacy/streaming/movie-1/hls/subtitles/uz.vtt");
});

await check("serializeState tolerates content with no streaming assets", () => {
  const view = streaming.serializeState({ asset: null, audioTracks: [], subtitles: [] }, fakeRequest);

  assert.equal(view.streamingStatus, null);
  assert.equal(view.hlsUrl, null);
  assert.deepEqual(view.audioTracks, []);
});

await check("ingest reuses content source_path when no streaming video file is uploaded", async () => {
  const contentId = "movie-with-existing-source";
  const sourcePath = "uploads/source.mp4";
  const queries = [];
  const db = {
    async one(sql, values) {
      queries.push({ method: "one", sql, values });

      if (/FROM movie_assets/.test(sql)) {
        return null;
      }

      if (/SELECT source_path FROM content/.test(sql)) {
        return { source_path: sourcePath };
      }

      if (/SELECT 1 FROM movie_audio_tracks/.test(sql)) {
        return null;
      }

      throw new Error(`unexpected one query: ${sql}`);
    },
    async query(sql, values) {
      queries.push({ method: "query", sql, values });
      return { rows: [] };
    }
  };

  await streaming.ingest(db, contentId, { files: {}, body: {} });

  const upsertAsset = queries.find((query) => query.method === "query" && /INSERT INTO movie_assets/.test(query.sql));
  assert.equal(upsertAsset.values[0], contentId);
  assert.equal(upsertAsset.values[1], sourcePath);
});

// ---- Detaching an audio track -------------------------------------------
// Rebuilding the master playlist must not need FFmpeg: the rendition ladder is
// already persisted on movie_assets.renditions and the video playlists stay on disk.

await check("master playlist rebuilds from the persisted rendition ladder", () => {
  const master = buildMasterPlaylistFromState({
    renditions: [
      { quality: "480", label: "480p", width: 854, height: 480, bandwidth: 1700000 },
      { quality: "720", label: "720p", width: 1280, height: 720, bandwidth: 3300000 }
    ],
    audioTracks: [
      { language_code: "uz", label: "Uzbek", is_default: false },
      { language_code: "en", label: "English", is_default: true }
    ],
    defaultAudioLanguage: "en"
  });

  assert.equal((master.match(/#EXT-X-MEDIA:TYPE=AUDIO/g) || []).length, 2);
  assert.doesNotMatch(master, /LANGUAGE="ru"/);
  assert.match(master, /NAME="English",DEFAULT=YES/);
  // Variant order and the video playlist references survive the rebuild.
  assert.match(master, /video\/480p\.m3u8[\s\S]*video\/720p\.m3u8/);
  // AVERAGE-BANDWIDTH is not persisted per rendition; it comes back from the profile table.
  assert.match(master, /AVERAGE-BANDWIDTH=2400000/);
});

await check("master playlist rebuild is skipped when no ladder was rendered yet", () => {
  assert.equal(buildMasterPlaylistFromState({ renditions: [], audioTracks: [] }), null);
  assert.equal(buildMasterPlaylistFromState({ renditions: "[]", audioTracks: [] }), null);
});

function createDetachFixture({ status = "ready", tracks } = {}) {
  const contentId = "movie-detach";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "astir-streaming-"));
  const contentRoot = path.join(root, "legacy", "streaming", contentId);
  const hlsRoot = path.join(contentRoot, "hls");

  fs.mkdirSync(path.join(hlsRoot, "video"), { recursive: true });
  fs.mkdirSync(path.join(hlsRoot, "audio", "ru"), { recursive: true });
  fs.mkdirSync(path.join(hlsRoot, "audio", "uz"), { recursive: true });
  fs.mkdirSync(path.join(contentRoot, "source"), { recursive: true });
  fs.writeFileSync(path.join(hlsRoot, "video", "720p.m3u8"), "#EXTM3U\n");
  fs.writeFileSync(path.join(hlsRoot, "audio", "ru", "index.m3u8"), "#EXTM3U\n");
  fs.writeFileSync(path.join(hlsRoot, "audio", "uz", "index.m3u8"), "#EXTM3U\n");
  fs.writeFileSync(path.join(contentRoot, "source", "audio_ru.mp3"), "fake-audio");
  fs.writeFileSync(path.join(hlsRoot, "master.m3u8"), '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="ru"\n');

  const state = {
    asset: {
      content_id: contentId,
      status,
      hls_master_path: `streaming/${contentId}/hls/master.m3u8`,
      default_audio_language: "ru",
      renditions: [{ quality: "720", label: "720p", width: 1280, height: 720, bandwidth: 3300000 }]
    },
    tracks: tracks || [
      { id: "track-ru", content_id: contentId, language_code: "ru", label: "Russian", is_default: true, source_audio_path: `streaming/${contentId}/source/audio_ru.mp3` },
      { id: "track-uz", content_id: contentId, language_code: "uz", label: "Uzbek", is_default: false, source_audio_path: `streaming/${contentId}/source/audio_uz.mp3` }
    ],
    queries: [],
    contentSourceCleared: false
  };

  function run(sql, values) {
    state.queries.push({ sql, values });

    if (/DELETE FROM movie_audio_tracks WHERE content_id/.test(sql)) {
      state.tracks = [];
      return { rows: [] };
    }

    if (/DELETE FROM movie_subtitles/.test(sql)) {
      return { rows: [] };
    }

    if (/DELETE FROM movie_assets/.test(sql)) {
      state.asset = null;
      return { rows: [] };
    }

    if (/UPDATE content SET source_path = NULL/.test(sql)) {
      state.contentSourceCleared = true;
      return { rows: [] };
    }

    if (/DELETE FROM movie_audio_tracks WHERE id/.test(sql)) {
      state.tracks = state.tracks.filter((track) => track.id !== values[0]);
      return { rows: [] };
    }

    if (/UPDATE movie_assets SET default_audio_language = NULL/.test(sql)) {
      state.asset.default_audio_language = null;
      return { rows: [] };
    }

    if (/UPDATE movie_audio_tracks SET is_default = true/.test(sql)) {
      const [first] = state.tracks;
      if (first) first.is_default = true;
      return { rows: [] };
    }

    throw new Error(`unexpected query: ${sql}`);
  }

  const db = {
    async one(sql, values) {
      state.queries.push({ sql, values });

      if (/SELECT 1 FROM movie_audio_tracks/.test(sql)) {
        return state.tracks.some((track) => track.is_default) ? { exists: 1 } : null;
      }

      if (/FROM movie_assets/.test(sql)) {
        return state.asset;
      }

      throw new Error(`unexpected one query: ${sql}`);
    },
    async many(sql, values) {
      state.queries.push({ sql, values });

      if (/FROM movie_audio_tracks/.test(sql)) {
        return state.tracks;
      }

      if (/FROM movie_subtitles/.test(sql)) {
        return [];
      }

      throw new Error(`unexpected many query: ${sql}`);
    },
    async query(sql, values) {
      return run(sql, values);
    },
    async transaction(work) {
      return work({ query: async (sql, values) => run(sql, values) });
    }
  };

  const service = createLegacyStreaming({
    config: { mediaRoot: root, maxVideoUploadMb: 2048, ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", transcoderEnabled: true }
  });

  return { contentId, root, contentRoot, hlsRoot, state, db, service };
}

await check("detachAudioTrack removes the row, its files, and rewrites the master playlist", async () => {
  const fixture = createDetachFixture();

  const { state: result, wiped } = await fixture.service.detachAudioTrack(fixture.db, fixture.contentId, "ru");

  assert.equal(wiped, false);
  assert.deepEqual(fixture.state.tracks.map((track) => track.language_code), ["uz"]);
  assert.equal(fs.existsSync(path.join(fixture.hlsRoot, "audio", "ru")), false);
  assert.equal(fs.existsSync(path.join(fixture.contentRoot, "source", "audio_ru.mp3")), false);
  // Untouched neighbours stay in place.
  assert.equal(fs.existsSync(path.join(fixture.hlsRoot, "audio", "uz", "index.m3u8")), true);
  assert.equal(fs.existsSync(path.join(fixture.hlsRoot, "video", "720p.m3u8")), true);

  const master = fs.readFileSync(path.join(fixture.hlsRoot, "master.m3u8"), "utf8");
  assert.doesNotMatch(master, /LANGUAGE="ru"/);
  assert.match(master, /LANGUAGE="uz"/);
  assert.match(master, /NAME="Uzbek",DEFAULT=YES/);

  // The removed track was the default, so the survivor is promoted.
  assert.equal(result.audioTracks[0].language_code, "uz");
  assert.equal(result.audioTracks[0].is_default, true);
});

await check("detachAudioTrack rejects an unknown language with 404", async () => {
  const fixture = createDetachFixture();

  await assert.rejects(
    () => fixture.service.detachAudioTrack(fixture.db, fixture.contentId, "fr"),
    (error) => error.statusCode === 404 && error.error === "audio_track_not_found"
  );
});

// A movie whose only audio track is gone cannot be played at all (video renditions
// are encoded with -an), so the whole asset set goes with it — no prompt, no leftovers.
await check("detaching the last track hard-deletes video and every other asset", async () => {
  const fixture = createDetachFixture({
    tracks: [
      { id: "track-ru", content_id: "movie-detach", language_code: "ru", label: "Russian", is_default: true, source_audio_path: "streaming/movie-detach/source/audio_ru.mp3" }
    ]
  });

  const { state: result, wiped } = await fixture.service.detachAudioTrack(fixture.db, fixture.contentId, "ru");

  assert.equal(wiped, true);
  assert.equal(fixture.state.tracks.length, 0);
  assert.equal(fixture.state.asset, null);
  assert.equal(fixture.state.contentSourceCleared, true);
  // Video source, audio sources and the generated HLS tree are all gone.
  assert.equal(fs.existsSync(fixture.contentRoot), false);
  assert.equal(result.audioTracks.length, 0);
  assert.equal(result.asset, null);
});

await check("purgeStreamingAssets drops every row and the whole media directory", async () => {
  const fixture = createDetachFixture();

  await fixture.service.purgeStreamingAssets(fixture.db, fixture.contentId);

  assert.equal(fixture.state.tracks.length, 0);
  assert.equal(fixture.state.asset, null);
  assert.equal(fs.existsSync(fixture.contentRoot), false);

  const purgeQueries = fixture.state.queries.map((query) => query.sql).join("\n");
  assert.match(purgeQueries, /DELETE FROM movie_subtitles WHERE content_id/);
  assert.match(purgeQueries, /DELETE FROM movie_assets WHERE content_id/);
});

await check("a partial detach still refuses to race a running job", async () => {
  const fixture = createDetachFixture({ status: "processing" });

  await assert.rejects(
    () => fixture.service.detachAudioTrack(fixture.db, fixture.contentId, "ru"),
    (error) => error.statusCode === 409 && error.error === "audio_track_processing"
  );
  assert.equal(fixture.state.tracks.length, 2);
});

// The purge cancels the job first, so wiping everything never has to wait.
await check("wiping the last track works even while processing", async () => {
  const fixture = createDetachFixture({
    status: "processing",
    tracks: [
      { id: "track-ru", content_id: "movie-detach", language_code: "ru", label: "Russian", is_default: true, source_audio_path: "streaming/movie-detach/source/audio_ru.mp3" }
    ]
  });

  const { wiped } = await fixture.service.detachAudioTrack(fixture.db, fixture.contentId, "ru");

  assert.equal(wiped, true);
  assert.equal(fs.existsSync(fixture.contentRoot), false);
});

console.log(`\n${passed} checks passed`);

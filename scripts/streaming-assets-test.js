// Unit smoke test for the multi-audio HLS streaming layer.
// Runs without a database or FFmpeg: it exercises the master-playlist builder and
// the streaming service's serializeState() shape. For an end-to-end upload check,
// see docs/streaming-multi-audio.md (manual curl steps).
//
//   node scripts/streaming-assets-test.js

import assert from "node:assert/strict";
import { buildMultiAudioMasterPlaylist } from "../app/lib/hlsProfiles.js";
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

console.log(`\n${passed} checks passed`);

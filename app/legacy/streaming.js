import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { buildMultiAudioMasterPlaylist, hlsRenditionProfiles } from "../lib/hlsProfiles.js";
import { legacyError } from "./utils.js";

const LANGUAGES = ["uz", "ru", "en"];
const LANGUAGE_LABELS = { uz: "Uzbek", ru: "Russian", en: "English" };
const AUDIO_FIELDS = { audio_uz: "uz", audio_ru: "ru", audio_en: "en" };
const SUBTITLE_FIELDS = { subtitle_uz: "uz", subtitle_ru: "ru", subtitle_en: "en" };
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".mkv"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac"];
const SUBTITLE_EXTENSIONS = [".vtt"];
// Renditions to generate (video-only ladder that references the shared audio group).
const RENDITION_QUALITIES = ["480", "720", "1080"];
const DURATION_TOLERANCE_SECONDS = 1.5;
const PROBE_TIMEOUT_MS = 15000;

function extensionOf(fileName) {
  return path.extname(fileName || "").toLowerCase();
}

function normalizeLanguage(value) {
  const language = String(value || "").trim().toLowerCase();

  return LANGUAGES.includes(language) ? language : null;
}

export function createLegacyStreaming({ config }) {
  const legacyRoot = path.resolve(config.mediaRoot, "legacy");
  const runtimeJobs = new Map();

  function contentDir(contentId) {
    return path.join(legacyRoot, "streaming", contentId);
  }

  function sourceDir(contentId) {
    return path.join(contentDir(contentId), "source");
  }

  function outputDir(contentId) {
    return path.join(contentDir(contentId), "hls");
  }

  function legacyRelative(absolutePath) {
    return path.relative(legacyRoot, absolutePath).split(path.sep).join("/");
  }

  function publicPath(legacyRel) {
    return legacyRel ? `/media/legacy/${legacyRel}` : null;
  }

  function absoluteUrl(request, relativeUrl) {
    if (!relativeUrl) {
      return null;
    }

    if (/^https?:\/\//i.test(relativeUrl)) {
      return relativeUrl;
    }

    if (!request) {
      return relativeUrl;
    }

    return `${request.protocol}://${request.get("host")}${relativeUrl}`;
  }

  // ---- Upload middleware ---------------------------------------------------

  function fieldExtensionAllowed(field, extension) {
    if (field === "video") {
      return VIDEO_EXTENSIONS.includes(extension);
    }

    if (AUDIO_FIELDS[field]) {
      return AUDIO_EXTENSIONS.includes(extension);
    }

    if (SUBTITLE_FIELDS[field]) {
      return SUBTITLE_EXTENSIONS.includes(extension);
    }

    return false;
  }

  const storage = multer.diskStorage({
    destination(request, file, callback) {
      try {
        const destination = sourceDir(request.params.id);
        fs.mkdirSync(destination, { recursive: true });
        callback(null, destination);
      } catch (error) {
        callback(error);
      }
    },
    filename(request, file, callback) {
      // Deterministic per-field name so re-uploads replace the previous source.
      callback(null, `${file.fieldname}${extensionOf(file.originalname)}`);
    }
  });

  const uploadFields = [
    { name: "video", maxCount: 1 },
    ...Object.keys(AUDIO_FIELDS).map((name) => ({ name, maxCount: 1 })),
    ...Object.keys(SUBTITLE_FIELDS).map((name) => ({ name, maxCount: 1 }))
  ];

  const upload = multer({
    storage,
    limits: {
      fileSize: (config.maxVideoUploadMb || 2048) * 1024 * 1024
    },
    fileFilter(request, file, callback) {
      const extension = extensionOf(file.originalname);

      if (!fieldExtensionAllowed(file.fieldname, extension)) {
        callback(legacyError(400, "unsupported_upload", `unsupported file for field ${file.fieldname}`));
        return;
      }

      callback(null, true);
    }
  }).fields(uploadFields);

  // ---- Persistence of uploaded sources ------------------------------------

  async function upsertAsset(db, contentId, { sourceVideoPath, defaultAudioLanguage }) {
    await db.query(
      `
        INSERT INTO movie_assets (content_id, source_video_path, default_audio_language, status, processing_error)
        VALUES ($1, $2, $3, 'uploaded', NULL)
        ON CONFLICT (content_id) DO UPDATE SET
          source_video_path = COALESCE($2, movie_assets.source_video_path),
          default_audio_language = COALESCE($3, movie_assets.default_audio_language),
          status = 'uploaded',
          processing_error = NULL
      `,
      [contentId, sourceVideoPath, defaultAudioLanguage]
    );
  }

  async function upsertAudioTrack(db, contentId, language, sourceAudioPath) {
    await db.query(
      `
        INSERT INTO movie_audio_tracks (content_id, language_code, label, source_audio_path)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (content_id, language_code) DO UPDATE SET
          label = EXCLUDED.label,
          source_audio_path = COALESCE(EXCLUDED.source_audio_path, movie_audio_tracks.source_audio_path)
      `,
      [contentId, language, LANGUAGE_LABELS[language] || language, sourceAudioPath]
    );
  }

  async function upsertSubtitle(db, contentId, language, filePath, fileUrl) {
    await db.query(
      `
        INSERT INTO movie_subtitles (content_id, language_code, label, file_path, file_url)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (content_id, language_code) DO UPDATE SET
          label = EXCLUDED.label,
          file_path = COALESCE(EXCLUDED.file_path, movie_subtitles.file_path),
          file_url = COALESCE(EXCLUDED.file_url, movie_subtitles.file_url)
      `,
      [contentId, language, LANGUAGE_LABELS[language] || language, filePath, fileUrl]
    );
  }

  async function applyDefaultAudioLanguage(db, contentId, defaultAudioLanguage) {
    if (defaultAudioLanguage) {
      await db.query(
        "UPDATE movie_audio_tracks SET is_default = (language_code = $2) WHERE content_id = $1",
        [contentId, defaultAudioLanguage]
      );
      return;
    }

    const existingDefault = await db.one(
      "SELECT 1 FROM movie_audio_tracks WHERE content_id = $1 AND is_default = true",
      [contentId]
    );

    if (!existingDefault) {
      await db.query(
        `
          UPDATE movie_audio_tracks SET is_default = true
          WHERE id = (
            SELECT id FROM movie_audio_tracks WHERE content_id = $1 ORDER BY created_at, language_code LIMIT 1
          )
        `,
        [contentId]
      );
    }
  }

  function firstFile(files, field) {
    const list = files?.[field];

    return Array.isArray(list) ? list[0] : null;
  }

  async function ingest(db, contentId, request) {
    const files = request.files || {};
    const defaultAudioLanguage = normalizeLanguage(request.body?.defaultAudioLanguage);

    const videoFile = firstFile(files, "video");
    const existingAsset = await db.one("SELECT source_video_path FROM movie_assets WHERE content_id = $1", [contentId]);

    if (!videoFile && !existingAsset?.source_video_path) {
      throw legacyError(400, "video_required", "a main video file is required");
    }

    const sourceVideoPath = videoFile ? legacyRelative(videoFile.path) : null;
    await upsertAsset(db, contentId, { sourceVideoPath, defaultAudioLanguage });

    for (const [field, language] of Object.entries(AUDIO_FIELDS)) {
      const file = firstFile(files, field);

      if (file) {
        await upsertAudioTrack(db, contentId, language, legacyRelative(file.path));
      }
    }

    for (const [field, language] of Object.entries(SUBTITLE_FIELDS)) {
      const file = firstFile(files, field);

      if (file) {
        const relative = legacyRelative(file.path);
        await upsertSubtitle(db, contentId, language, relative, publicPath(relative));
      }
    }

    await applyDefaultAudioLanguage(db, contentId, defaultAudioLanguage);
  }

  // ---- FFmpeg / FFprobe ----------------------------------------------------

  function runFfmpeg(job, args) {
    return new Promise((resolve, reject) => {
      let child;

      try {
        child = spawn(config.ffmpegPath || "ffmpeg", args, { stdio: "ignore" });
      } catch (error) {
        reject(error);
        return;
      }

      job.process = child;
      let settled = false;

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;

        if (job.process === child) {
          job.process = null;
        }

        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
  }

  function probe(sourcePath, entriesArgs) {
    return new Promise((resolve) => {
      let child;
      let output = "";
      let settled = false;

      function settle(value) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      }

      const timeout = setTimeout(() => {
        if (child?.kill) {
          child.kill("SIGTERM");
        }
        settle(null);
      }, PROBE_TIMEOUT_MS);

      try {
        child = spawn(config.ffprobePath || "ffprobe", [
          "-v", "error",
          ...entriesArgs,
          "-of", "json",
          sourcePath
        ], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        settle(null);
        return;
      }

      child.stdout?.setEncoding?.("utf8");
      child.stdout?.on("data", (chunk) => {
        output += chunk;
      });
      child.on("error", () => settle(null));
      child.on("close", (code) => {
        if (code !== 0) {
          settle(null);
          return;
        }

        try {
          settle(JSON.parse(output));
        } catch {
          settle(null);
        }
      });
    });
  }

  async function probeVideo(sourcePath) {
    const data = await probe(sourcePath, [
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration"
    ]);
    const stream = data?.streams?.[0] || {};
    const duration = Number(data?.format?.duration);

    return {
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      width: Number(stream.width) || null,
      height: Number(stream.height) || null
    };
  }

  async function probeAudioDuration(sourcePath) {
    const data = await probe(sourcePath, ["-show_entries", "format=duration"]);
    const duration = Number(data?.format?.duration);

    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }

  function selectRenditions(sourceHeight) {
    const eligible = hlsRenditionProfiles.filter((profile) => RENDITION_QUALITIES.includes(profile.quality));
    const withinSource = sourceHeight
      ? eligible.filter((profile) => profile.height <= sourceHeight)
      : eligible;
    const chosen = withinSource.length > 0 ? withinSource : [eligible[0]];

    return chosen.sort((a, b) => a.height - b.height);
  }

  function videoArgs(sourcePath, profile, playlistPath, segmentPattern) {
    return [
      "-y",
      "-i", sourcePath,
      "-an",
      "-map", "0:v:0",
      "-vf", `scale=-2:${profile.height}`,
      "-c:v", "h264",
      "-b:v", String(profile.videoBitrate),
      "-maxrate", String(profile.maxrate),
      "-bufsize", String(profile.bufsize),
      "-preset", "veryfast",
      "-g", "48",
      "-keyint_min", "48",
      "-sc_threshold", "0",
      "-f", "hls",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_flags", "independent_segments",
      "-hls_segment_filename", segmentPattern,
      playlistPath
    ];
  }

  function audioArgs(sourcePath, playlistPath, segmentPattern) {
    return [
      "-y",
      "-i", sourcePath,
      "-vn",
      "-map", "0:a:0",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      "-f", "hls",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_flags", "independent_segments",
      "-hls_segment_filename", segmentPattern,
      playlistPath
    ];
  }

  // ---- Processing worker ---------------------------------------------------

  async function markFailed(db, contentId, message) {
    await db.query(
      "UPDATE movie_assets SET status = 'failed', processing_error = $2 WHERE content_id = $1",
      [contentId, message]
    ).catch(() => {});
  }

  async function runProcessing(db, contentId, job) {
    const asset = await db.one("SELECT * FROM movie_assets WHERE content_id = $1", [contentId]);

    if (!asset?.source_video_path) {
      await markFailed(db, contentId, "no source video to process");
      return;
    }

    const tracks = await db.many(
      "SELECT * FROM movie_audio_tracks WHERE content_id = $1 ORDER BY created_at, language_code",
      [contentId]
    );
    const subtitles = await db.many(
      "SELECT * FROM movie_subtitles WHERE content_id = $1 ORDER BY language_code",
      [contentId]
    );

    const sourceVideoAbs = path.resolve(legacyRoot, asset.source_video_path);

    if (!fs.existsSync(sourceVideoAbs)) {
      await markFailed(db, contentId, "source video file was not found");
      return;
    }

    const videoInfo = await probeVideo(sourceVideoAbs);

    if (!videoInfo.duration) {
      await markFailed(db, contentId, "unable to read the source video duration");
      return;
    }

    // Validate every audio track against the video duration (tolerance 1.5s).
    for (const track of tracks) {
      const audioAbs = track.source_audio_path ? path.resolve(legacyRoot, track.source_audio_path) : null;

      if (!audioAbs || !fs.existsSync(audioAbs)) {
        await markFailed(db, contentId, `audio track "${track.language_code}" source file was not found`);
        return;
      }

      const audioDuration = await probeAudioDuration(audioAbs);

      if (!audioDuration) {
        await markFailed(db, contentId, `unable to read duration for audio track "${track.language_code}"`);
        return;
      }

      const drift = Math.abs(audioDuration - videoInfo.duration);

      if (drift > DURATION_TOLERANCE_SECONDS) {
        await markFailed(
          db,
          contentId,
          `audio track "${track.language_code}" duration (${audioDuration.toFixed(2)}s) does not match video (${videoInfo.duration.toFixed(2)}s); drift ${drift.toFixed(2)}s exceeds ${DURATION_TOLERANCE_SECONDS}s tolerance`
        );
        return;
      }
    }

    const output = outputDir(contentId);
    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(path.join(output, "video"), { recursive: true });

    // Video-only renditions.
    const renditions = selectRenditions(videoInfo.height);
    const renditionEntries = [];

    for (const profile of renditions) {
      if (job.cancelled) {
        return;
      }

      const playlistPath = path.join(output, "video", `${profile.label}.m3u8`);
      const segmentPattern = path.join(output, "video", `${profile.label}_%03d.ts`);
      await runFfmpeg(job, videoArgs(sourceVideoAbs, profile, playlistPath, segmentPattern));

      renditionEntries.push({
        label: profile.label,
        width: profile.width,
        height: profile.height,
        bandwidth: profile.bandwidth,
        averageBandwidth: profile.averageBandwidth,
        playlistFile: `video/${profile.label}.m3u8`
      });
    }

    // One AAC HLS playlist per external audio track.
    const audioEntries = [];

    for (const track of tracks) {
      if (job.cancelled) {
        return;
      }

      const audioAbs = path.resolve(legacyRoot, track.source_audio_path);
      const trackDir = path.join(output, "audio", track.language_code);
      fs.mkdirSync(trackDir, { recursive: true });

      const playlistPath = path.join(trackDir, "index.m3u8");
      const segmentPattern = path.join(trackDir, "seg_%03d.ts");
      await runFfmpeg(job, audioArgs(audioAbs, playlistPath, segmentPattern));

      const playlistRel = legacyRelative(playlistPath);
      audioEntries.push({
        id: track.id,
        languageCode: track.language_code,
        label: track.label,
        isDefault: track.is_default,
        uri: `audio/${track.language_code}/index.m3u8`,
        playlistPath: playlistRel,
        playlistUrl: publicPath(playlistRel)
      });
    }

    // Copy subtitles into the public output tree (exposed as plain .vtt tracks).
    const subtitleEntries = [];

    if (subtitles.length > 0) {
      const subtitleDir = path.join(output, "subtitles");
      fs.mkdirSync(subtitleDir, { recursive: true });

      for (const subtitle of subtitles) {
        if (!subtitle.file_path) {
          continue;
        }

        const sourceSubtitleAbs = path.resolve(legacyRoot, subtitle.file_path);

        if (!fs.existsSync(sourceSubtitleAbs)) {
          continue;
        }

        const destinationAbs = path.join(subtitleDir, `${subtitle.language_code}.vtt`);
        fs.copyFileSync(sourceSubtitleAbs, destinationAbs);

        const relative = legacyRelative(destinationAbs);
        subtitleEntries.push({
          id: subtitle.id,
          languageCode: subtitle.language_code,
          label: subtitle.label,
          filePath: relative,
          fileUrl: publicPath(relative)
        });
      }
    }

    if (job.cancelled) {
      return;
    }

    const masterPath = path.join(output, "master.m3u8");
    fs.writeFileSync(masterPath, buildMultiAudioMasterPlaylist({
      renditions: renditionEntries,
      audioTracks: audioEntries,
      subtitles: [],
      defaultAudioLanguage: asset.default_audio_language || ""
    }));

    const masterRel = legacyRelative(masterPath);

    // Persist results.
    await db.query(
      `
        UPDATE movie_assets
        SET status = 'ready', processing_error = NULL,
            hls_master_path = $2, hls_master_url = $3, duration_seconds = $4
        WHERE content_id = $1
      `,
      [contentId, masterRel, publicPath(masterRel), Math.round(videoInfo.duration)]
    );

    for (const entry of audioEntries) {
      await db.query(
        "UPDATE movie_audio_tracks SET hls_playlist_path = $2, hls_playlist_url = $3 WHERE id = $1",
        [entry.id, entry.playlistPath, entry.playlistUrl]
      );
    }

    for (const entry of subtitleEntries) {
      await db.query(
        "UPDATE movie_subtitles SET file_path = $2, file_url = $3 WHERE id = $1",
        [entry.id, entry.filePath, entry.fileUrl]
      );
    }
  }

  function cancel(contentId) {
    const job = runtimeJobs.get(contentId);

    if (!job) {
      return;
    }

    job.cancelled = true;

    if (job.process) {
      job.process.kill("SIGTERM");
    }

    runtimeJobs.delete(contentId);
  }

  async function startProcessing(db, contentId) {
    const asset = await db.one("SELECT * FROM movie_assets WHERE content_id = $1", [contentId]);

    if (!asset) {
      throw legacyError(404, "streaming_assets_not_found", "no streaming assets uploaded for this content");
    }

    if (!asset.source_video_path) {
      throw legacyError(400, "video_required", "a main video file is required before processing");
    }

    if (!config.transcoderEnabled) {
      await markFailed(db, contentId, "transcoder disabled");
      return;
    }

    cancel(contentId);

    await db.query(
      "UPDATE movie_assets SET status = 'processing', processing_error = NULL WHERE content_id = $1",
      [contentId]
    );

    const job = { cancelled: false, process: null };
    runtimeJobs.set(contentId, job);

    setImmediate(() => {
      runProcessing(db, contentId, job)
        .catch((error) => {
          if (!job.cancelled) {
            return markFailed(db, contentId, error.message);
          }
        })
        .finally(() => {
          if (runtimeJobs.get(contentId) === job) {
            runtimeJobs.delete(contentId);
          }
        });
    });
  }

  async function loadState(db, contentId) {
    const asset = await db.one("SELECT * FROM movie_assets WHERE content_id = $1", [contentId]);
    const audioTracks = await db.many(
      "SELECT * FROM movie_audio_tracks WHERE content_id = $1 ORDER BY created_at, language_code",
      [contentId]
    );
    const subtitles = await db.many(
      "SELECT * FROM movie_subtitles WHERE content_id = $1 ORDER BY language_code",
      [contentId]
    );

    return { asset, audioTracks, subtitles };
  }

  function serializeState(state, request) {
    const asset = state.asset;
    const defaultFromTracks = state.audioTracks.find((track) => track.is_default)?.language_code || null;

    return {
      streamingStatus: asset?.status || null,
      hlsUrl: absoluteUrl(request, asset?.hls_master_url || null),
      defaultAudioLanguage: asset?.default_audio_language || defaultFromTracks,
      durationSeconds: asset?.duration_seconds || null,
      processingError: asset?.processing_error || null,
      audioTracks: state.audioTracks.map((track) => ({
        languageCode: track.language_code,
        label: track.label,
        isDefault: Boolean(track.is_default),
        url: absoluteUrl(request, track.hls_playlist_url || null)
      })),
      subtitles: state.subtitles.map((subtitle) => ({
        languageCode: subtitle.language_code,
        label: subtitle.label,
        url: absoluteUrl(request, subtitle.file_url || null)
      }))
    };
  }

  return {
    upload,
    ingest,
    startProcessing,
    loadState,
    serializeState,
    cancel
  };
}

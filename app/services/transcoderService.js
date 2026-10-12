import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildHlsMasterPlaylist, hlsRenditionProfiles } from "../lib/hlsProfiles.js";

export function createTranscoderService({ config, contentMovies, spawnProcess = spawn }) {
  const runningJobs = new Map();
  const queuedJobs = new Set();
  // A busy server (several transcodes at once) can take well over 5 s to
  // open a long video; a timeout here leaves the title without a duration.
  const probeTimeoutMs = 30000;

  function hlsDirectory(movieId) {
    return path.resolve(config.mediaRoot, "hls", movieId);
  }

  function hlsPlaylistPath(movieId) {
    return path.join(hlsDirectory(movieId), "master.m3u8");
  }

  function hlsUrl(movieId) {
    return `/media/hls/${movieId}/master.m3u8`;
  }

  function renditionDirectory(movieId, profile) {
    return path.join(hlsDirectory(movieId), profile.directory);
  }

  function renditionPlaylistPath(movieId, profile) {
    return path.join(renditionDirectory(movieId, profile), "index.m3u8");
  }

  function renditionPlaylistUrl(movieId, profile) {
    return `/media/hls/${movieId}/${profile.directory}/index.m3u8`;
  }

  function hlsRenditions(movieId) {
    return hlsRenditionProfiles.map((profile) => ({
      quality: profile.quality,
      label: profile.label,
      directory: profile.directory,
      width: profile.width,
      height: profile.height,
      bitrate: profile.videoBitrate,
      bandwidth: profile.bandwidth,
      averageBandwidth: profile.averageBandwidth,
      playlistPath: renditionPlaylistPath(movieId, profile),
      playlistUrl: renditionPlaylistUrl(movieId, profile),
      playlistFile: `${profile.directory}/index.m3u8`
    }));
  }

  function updateTranscode(movieId, transcode) {
    return contentMovies.update(movieId, {
      transcode: {
        ...transcode,
        updatedAt: new Date().toISOString()
      }
    });
  }

  function markUnavailable(movie) {
    return updateTranscode(movie.id, {
      status: "unavailable",
      error: "ffmpeg is not available on this machine",
      hlsPath: null,
      hlsUrl: null,
      renditions: []
    });
  }

  // Writes transcode.progress (0–99 while running) at most every 2% or 5 s,
  // so the app and admin can show how far along the video is.
  function progressReporter(movieId) {
    let lastValue = -1;
    let lastAt = 0;
    return (value) => {
      const progress = Math.max(0, Math.min(99, Math.floor(value)));
      const now = Date.now();
      if (progress === lastValue || (progress - lastValue < 2 && now - lastAt < 5000)) return;
      lastValue = progress;
      lastAt = now;
      const current = contentMovies.findById(movieId);
      if (current?.transcode?.status !== "processing") return;
      contentMovies.update(movieId, { transcode: { ...current.transcode, progress, updatedAt: new Date().toISOString() } });
    };
  }

  // onSeconds gets how many seconds of the video ffmpeg has written so far.
  function runFfmpeg(job, args, onSeconds = null) {
    return new Promise((resolve, reject) => {
      let childProcess;

      try {
        childProcess = spawnProcess(config.ffmpegPath, onSeconds ? ["-progress", "pipe:1", "-nostats", ...args] : args, {
          stdio: onSeconds ? ["ignore", "pipe", "ignore"] : "ignore"
        });
      } catch (error) {
        reject(error);
        return;
      }

      job.process = childProcess;
      let settled = false;

      if (onSeconds && childProcess.stdout) {
        let buffer = "";
        childProcess.stdout.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const match = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
            if (match) onSeconds(Number(match[1]) / 1e6);
          }
        });
      }

      childProcess.on("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error);
      });

      childProcess.on("close", (code) => {
        if (settled) {
          return;
        }

        settled = true;

        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
  }

  function parsedDurationSeconds(output) {
    try {
      const data = JSON.parse(output);
      const duration = Number(data?.format?.duration);

      return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
    } catch {
      return null;
    }
  }

  function probeVideoDuration(sourcePath) {
    if (!sourcePath) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      let childProcess;
      let output = "";
      let settled = false;

      function settle(durationSeconds) {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(durationSeconds);
      }

      const timeout = setTimeout(() => {
        if (childProcess?.kill) {
          childProcess.kill("SIGTERM");
        }

        settle(null);
      }, probeTimeoutMs);

      try {
        childProcess = spawnProcess(config.ffprobePath || "ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "json",
          sourcePath
        ], {
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch {
        settle(null);
        return;
      }

      if (childProcess.stdout) {
        childProcess.stdout.setEncoding?.("utf8");
        childProcess.stdout.on("data", (chunk) => {
          output += chunk;
        });
      }

      childProcess.on("error", () => {
        settle(null);
      });

      childProcess.on("close", (code) => {
        settle(code === 0 ? parsedDurationSeconds(output) : null);
      });
    });
  }

  function transcodeArgs(sourcePath, rendition) {
    const profile = hlsRenditionProfiles.find((item) => item.quality === rendition.quality);

    return [
      "-y",
      "-i",
      sourcePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      `scale=-2:${rendition.height}`,
      "-c:v",
      "h264",
      // 2–3× faster than the default "medium" at the same bitrate.
      "-preset",
      "veryfast",
      "-b:v",
      String(profile.videoBitrate),
      "-maxrate",
      String(profile.maxrate),
      "-bufsize",
      String(profile.bufsize),
      "-c:a",
      "aac",
      "-b:a",
      String(profile.audioBitrate),
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-hls_segment_filename",
      path.join(path.dirname(rendition.playlistPath), "segment_%03d.ts"),
      rendition.playlistPath
    ];
  }

  async function transcodeMovie(movie, sourcePath, playlistPath, renditions, job) {
    try {
      const duration = Number(movie.duration_sec) || await probeVideoDuration(sourcePath);
      // The upload's probe may have timed out: fill the duration in now.
      if (duration && !Number(movie.duration_sec)) contentMovies.update(movie.id, { duration_sec: duration });
      const report = progressReporter(movie.id);
      for (const [index, rendition] of renditions.entries()) {
        if (job.cancelled) {
          return;
        }

        fs.mkdirSync(path.dirname(rendition.playlistPath), { recursive: true });
        const onSeconds = duration
          ? (seconds) => report(((index + Math.min(1, seconds / duration)) / renditions.length) * 100)
          : null;
        await runFfmpeg(job, transcodeArgs(sourcePath, rendition), onSeconds);
      }

      if (job.cancelled) {
        return;
      }

      fs.writeFileSync(playlistPath, buildHlsMasterPlaylist(renditions));

      updateTranscode(movie.id, {
        status: "ready",
        error: null,
        hlsPath: playlistPath,
        hlsUrl: hlsUrl(movie.id),
        renditions
      });
    } catch (error) {
      if (job.cancelled) {
        return;
      }

      if (error.code === "ENOENT") {
        markUnavailable(movie);
        return;
      }

      // Half-written segments are useless; don't leave them on the disk.
      fs.rmSync(hlsDirectory(movie.id), { recursive: true, force: true });
      updateTranscode(movie.id, {
        status: "failed",
        error: error.message,
        hlsPath: null,
        hlsUrl: null,
        renditions: []
      });
    } finally {
      if (runningJobs.get(movie.id) === job) {
        runningJobs.delete(movie.id);
      }
    }
  }

  function ensureMovieTranscoded(movie) {
    if (!config.transcoderEnabled) {
      return updateTranscode(movie.id, {
        status: "disabled",
        error: null,
        hlsPath: null,
        hlsUrl: null,
        renditions: []
      });
    }

    if (!movie.source?.path) {
      return movie;
    }

    if (movie.transcode?.status === "ready") {
      return movie;
    }

    if (runningJobs.has(movie.id)) {
      return movie;
    }

    const sourcePath = path.resolve(movie.source.path);

    if (!fs.existsSync(sourcePath)) {
      return updateTranscode(movie.id, {
        status: "failed",
        error: "source file was not found",
        hlsPath: null,
        hlsUrl: null,
        renditions: []
      });
    }

    const outputDir = hlsDirectory(movie.id);
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const playlistPath = hlsPlaylistPath(movie.id);
    const renditions = hlsRenditions(movie.id);
    updateTranscode(movie.id, {
      status: "processing",
      progress: 0,
      startedAt: new Date().toISOString(),
      error: null,
      hlsPath: playlistPath,
      hlsUrl: hlsUrl(movie.id),
      renditions
    });

    const job = {
      cancelled: false,
      process: null
    };
    runningJobs.set(movie.id, job);
    transcodeMovie(movie, sourcePath, playlistPath, renditions, job);

    return contentMovies.findById(movie.id);
  }

  function queueMovieTranscode(movie) {
    if (!config.transcoderEnabled || !movie.source?.path) {
      return null;
    }

    if (runningJobs.has(movie.id) || queuedJobs.has(movie.id)) {
      return {
        id: movie.id,
        movieId: movie.id,
        sourcePath: movie.source.path
      };
    }

    queuedJobs.add(movie.id);

    setImmediate(() => {
      queuedJobs.delete(movie.id);

      const currentMovie = contentMovies.findById(movie.id);

      if (currentMovie) {
        try {
          ensureMovieTranscoded(currentMovie);
        } catch (error) {
          updateTranscode(currentMovie.id, {
            status: "failed",
            error: error.message,
            hlsPath: null,
            hlsUrl: null,
            renditions: []
          });
        }
      }
    });

    return {
      id: movie.id,
      movieId: movie.id,
      sourcePath: movie.source.path
    };
  }

  function removeMovieFiles(movie) {
    const runningJob = movie.id ? runningJobs.get(movie.id) : null;

    if (runningJob) {
      runningJob.cancelled = true;

      if (runningJob.process) {
        runningJob.process.kill("SIGTERM");
      }

      runningJobs.delete(movie.id);
    }

    if (movie.id) {
      queuedJobs.delete(movie.id);
    }

    if (movie.source?.path) {
      fs.rmSync(path.resolve(movie.source.path), { force: true });
    }

    if (movie.id) {
      fs.rmSync(hlsDirectory(movie.id), { recursive: true, force: true });
    }
  }

  // After a restart: titles left "processing"/"queued" had their ffmpeg
  // killed with the server, so start them again instead of leaving them stuck.
  function resumeInterrupted() {
    const stuck = (contentMovies.list ? contentMovies.list() : [])
      .filter((movie) => ["processing", "queued"].includes(movie.transcode?.status) && !runningJobs.has(movie.id));
    for (const movie of stuck) queueMovieTranscode(movie);
    return stuck.length;
  }

  // HLS folders nothing will use: their title was deleted, or its transcode
  // failed. (An unfinished one is cleared when it is transcoded again.)
  function cleanupOrphanOutputs() {
    const root = path.join(config.mediaRoot, "hls");
    if (!fs.existsSync(root)) return 0;
    let removed = 0;
    for (const id of fs.readdirSync(root)) {
      if (runningJobs.has(id) || queuedJobs.has(id)) continue;
      const movie = contentMovies.findById(id);
      if (movie && !["failed", "unavailable", "disabled"].includes(movie.transcode?.status)) continue;
      fs.rmSync(path.join(root, id), { recursive: true, force: true });
      removed += 1;
    }
    return removed;
  }

  // Every uploaded title whose duration was never read (probe timed out).
  async function backfillDurations() {
    const missing = (contentMovies.list ? contentMovies.list() : [])
      .filter((movie) => movie.source?.path && !Number(movie.duration_sec) && fs.existsSync(path.resolve(movie.source.path)));
    let filled = 0;
    for (const movie of missing) {
      const duration = await probeVideoDuration(path.resolve(movie.source.path));
      if (duration) {
        contentMovies.update(movie.id, { duration_sec: duration });
        filled += 1;
      }
    }
    return filled;
  }

  return {
    backfillDurations,
    cleanupOrphanOutputs,
    ensureMovieTranscoded,
    resumeInterrupted,
    hlsUrl,
    probeVideoDuration,
    queueMovieTranscode,
    removeMovieFiles
  };
}

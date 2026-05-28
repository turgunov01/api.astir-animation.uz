import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function createTranscoderService({ config, contentMovies }) {
  const runningJobs = new Map();

  function hlsDirectory(movieId) {
    return path.resolve(config.mediaRoot, "hls", movieId);
  }

  function hlsPlaylistPath(movieId) {
    return path.join(hlsDirectory(movieId), "master.m3u8");
  }

  function hlsUrl(movieId) {
    return `/media/hls/${movieId}/master.m3u8`;
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
      hlsUrl: null
    });
  }

  function ensureMovieTranscoded(movie) {
    if (!config.transcoderEnabled) {
      return updateTranscode(movie.id, {
        status: "disabled",
        error: null,
        hlsPath: null,
        hlsUrl: null
      });
    }

    if (!movie.source?.path) {
      return movie;
    }

    if (movie.transcode?.status === "ready" || movie.transcode?.status === "processing") {
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
        hlsUrl: null
      });
    }

    const outputDir = hlsDirectory(movie.id);
    fs.mkdirSync(outputDir, { recursive: true });

    const playlistPath = hlsPlaylistPath(movie.id);
    updateTranscode(movie.id, {
      status: "processing",
      error: null,
      hlsPath: playlistPath,
      hlsUrl: hlsUrl(movie.id)
    });

    let process;

    try {
      process = spawn(config.ffmpegPath, [
        "-y",
        "-i",
        sourcePath,
        "-vf",
        "scale=-2:720",
        "-c:v",
        "h264",
        "-c:a",
        "aac",
        "-f",
        "hls",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(outputDir, "segment_%03d.ts"),
        playlistPath
      ], {
        stdio: "ignore"
      });
    } catch (error) {
      return markUnavailable(movie);
    }

    runningJobs.set(movie.id, process);

    process.on("error", () => {
      runningJobs.delete(movie.id);
      markUnavailable(movie);
    });

    process.on("close", (code) => {
      runningJobs.delete(movie.id);

      if (code === 0 && fs.existsSync(playlistPath)) {
        updateTranscode(movie.id, {
          status: "ready",
          error: null,
          hlsPath: playlistPath,
          hlsUrl: hlsUrl(movie.id)
        });
        return;
      }

      updateTranscode(movie.id, {
        status: "failed",
        error: `ffmpeg exited with code ${code}`,
        hlsPath: playlistPath,
        hlsUrl: null
      });
    });

    return contentMovies.findById(movie.id);
  }

  function removeMovieFiles(movie) {
    const runningJob = runningJobs.get(movie.id);

    if (runningJob) {
      runningJob.kill("SIGTERM");
      runningJobs.delete(movie.id);
    }

    if (movie.source?.path) {
      fs.rmSync(path.resolve(movie.source.path), { force: true });
    }

    fs.rmSync(hlsDirectory(movie.id), { recursive: true, force: true });
  }

  return {
    ensureMovieTranscoded,
    hlsUrl,
    removeMovieFiles
  };
}

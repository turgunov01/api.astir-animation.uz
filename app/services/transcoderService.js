import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildHlsMasterPlaylist, hlsRenditionProfiles } from "../lib/hlsProfiles.js";

export function createTranscoderService({ config, contentMovies, spawnProcess = spawn }) {
  const runningJobs = new Map();
  const queuedJobs = new Set();

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

  function runFfmpeg(job, args) {
    return new Promise((resolve, reject) => {
      let childProcess;

      try {
        childProcess = spawnProcess(config.ffmpegPath, args, {
          stdio: "ignore"
        });
      } catch (error) {
        reject(error);
        return;
      }

      job.process = childProcess;
      let settled = false;

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
      for (const rendition of renditions) {
        if (job.cancelled) {
          return;
        }

        fs.mkdirSync(path.dirname(rendition.playlistPath), { recursive: true });
        await runFfmpeg(job, transcodeArgs(sourcePath, rendition));
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

      updateTranscode(movie.id, {
        status: "failed",
        error: error.message,
        hlsPath: playlistPath,
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

  return {
    ensureMovieTranscoded,
    hlsUrl,
    queueMovieTranscode,
    removeMovieFiles
  };
}

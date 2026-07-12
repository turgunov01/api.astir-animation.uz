-- Persist the video rendition ladder (480p/720p/1080p …) on movie_assets so the
-- content API (/v1/content/movies/*) can surface playback.qualities /
-- playback.renditions without parsing the HLS master manifest.
-- Runs inside a single transaction via scripts/db-migrate.js.

ALTER TABLE movie_assets
  ADD COLUMN IF NOT EXISTS renditions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Source video path the current renditions were built from. Lets the pipeline
-- skip re-encoding the video ladder when only audio/subtitles change (the source
-- video is unchanged), instead of re-transcoding the whole video every upload.
ALTER TABLE movie_assets
  ADD COLUMN IF NOT EXISTS rendered_video_path text;

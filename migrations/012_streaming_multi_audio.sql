-- Multi-audio HLS streaming assets.
-- Keyed to content(id) (this platform has no `movies` table; content holds movies and episodes).
-- Runs inside a single transaction via scripts/db-migrate.js.

CREATE TABLE IF NOT EXISTS movie_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  source_video_path text,
  hls_master_path text,
  hls_master_url text,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
  processing_error text,
  duration_seconds integer,
  default_audio_language varchar(10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS movie_assets_content_id_key ON movie_assets(content_id);
CREATE INDEX IF NOT EXISTS movie_assets_status_idx ON movie_assets(status);

CREATE TABLE IF NOT EXISTS movie_audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  language_code varchar(10) NOT NULL,
  label text NOT NULL,
  source_audio_path text,
  hls_playlist_path text,
  hls_playlist_url text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS movie_audio_tracks_content_lang_key
  ON movie_audio_tracks(content_id, language_code);

CREATE TABLE IF NOT EXISTS movie_subtitles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  language_code varchar(10) NOT NULL,
  label text NOT NULL,
  file_path text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS movie_subtitles_content_lang_key
  ON movie_subtitles(content_id, language_code);

-- Reuse the shared set_updated_at() trigger function defined in 001_legacy_api.sql.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['movie_assets', 'movie_audio_tracks', 'movie_subtitles']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', target_table || '_set_updated_at', target_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', target_table || '_set_updated_at', target_table);
  END LOOP;
END $$;

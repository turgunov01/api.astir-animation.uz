CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS v1_content_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS v1_content_tags_name_lower_idx
  ON v1_content_tags (lower(name));

CREATE TABLE IF NOT EXISTS v1_content_movie_tags (
  movie_id text NOT NULL,
  tag_id uuid NOT NULL REFERENCES v1_content_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (movie_id, tag_id)
);

CREATE INDEX IF NOT EXISTS v1_content_movie_tags_movie_id_idx
  ON v1_content_movie_tags(movie_id);

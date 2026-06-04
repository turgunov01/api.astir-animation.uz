ALTER TABLE likes
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'content',
  ADD COLUMN IF NOT EXISTS target_id uuid;

UPDATE likes
SET
  target_type = COALESCE(target_type, 'content'),
  target_id = COALESCE(target_id, content_id)
WHERE target_id IS NULL OR target_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'likes'::regclass
      AND conname = 'likes_target_type_check'
  ) THEN
    ALTER TABLE likes
      ADD CONSTRAINT likes_target_type_check CHECK (target_type IN ('content', 'series'));
  END IF;
END $$;

ALTER TABLE likes
  ALTER COLUMN target_type SET NOT NULL,
  ALTER COLUMN target_id SET NOT NULL;

DO $$
DECLARE
  primary_key_name text;
  primary_key_columns text[];
BEGIN
  SELECT c.conname, array_agg(a.attname ORDER BY keys.ordinality)
  INTO primary_key_name, primary_key_columns
  FROM pg_constraint c
  JOIN unnest(c.conkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = keys.attnum
  WHERE c.conrelid = 'likes'::regclass
    AND c.contype = 'p'
  GROUP BY c.conname;

  IF primary_key_columns IS DISTINCT FROM ARRAY['user_id', 'target_type', 'target_id']::text[] THEN
    IF primary_key_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE likes DROP CONSTRAINT %I', primary_key_name);
    END IF;

    ALTER TABLE likes
      ADD CONSTRAINT likes_pkey PRIMARY KEY (user_id, target_type, target_id);
  END IF;
END $$;

ALTER TABLE likes
  ALTER COLUMN content_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS likes_target_idx
  ON likes(target_type, target_id);

CREATE OR REPLACE FUNCTION validate_like_target()
RETURNS trigger AS $$
BEGIN
  IF NEW.target_type = 'content' THEN
    NEW.content_id = NEW.target_id;

    PERFORM 1 FROM content WHERE id = NEW.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'like target content not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.target_type = 'series' THEN
    NEW.content_id = NULL;

    PERFORM 1 FROM series WHERE id = NEW.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'like target series not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid like target type'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS likes_validate_target ON likes;
CREATE TRIGGER likes_validate_target
  BEFORE INSERT OR UPDATE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION validate_like_target();

CREATE OR REPLACE FUNCTION delete_content_likes()
RETURNS trigger AS $$
BEGIN
  DELETE FROM likes WHERE target_type = 'content' AND target_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_delete_likes ON content;
CREATE TRIGGER content_delete_likes
  AFTER DELETE ON content
  FOR EACH ROW
  EXECUTE FUNCTION delete_content_likes();

CREATE OR REPLACE FUNCTION delete_series_likes()
RETURNS trigger AS $$
BEGIN
  DELETE FROM likes WHERE target_type = 'series' AND target_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS series_delete_likes ON series;
CREATE TRIGGER series_delete_likes
  AFTER DELETE ON series
  FOR EACH ROW
  EXECUTE FUNCTION delete_series_likes();

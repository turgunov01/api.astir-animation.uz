CREATE TABLE IF NOT EXISTS dislikes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  target_type text NOT NULL DEFAULT 'content',
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'dislikes'::regclass
      AND conname = 'dislikes_target_type_check'
  ) THEN
    ALTER TABLE dislikes
      ADD CONSTRAINT dislikes_target_type_check CHECK (target_type IN ('content', 'series'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dislikes_target_idx
  ON dislikes(target_type, target_id);

CREATE OR REPLACE FUNCTION validate_dislike_target()
RETURNS trigger AS $$
BEGIN
  IF NEW.target_type = 'content' THEN
    NEW.content_id = NEW.target_id;

    PERFORM 1 FROM content WHERE id = NEW.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dislike target content not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.target_type = 'series' THEN
    NEW.content_id = NULL;

    PERFORM 1 FROM series WHERE id = NEW.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dislike target series not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid dislike target type'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dislikes_validate_target ON dislikes;
CREATE TRIGGER dislikes_validate_target
  BEFORE INSERT OR UPDATE ON dislikes
  FOR EACH ROW
  EXECUTE FUNCTION validate_dislike_target();

CREATE OR REPLACE FUNCTION remove_dislike_for_like()
RETURNS trigger AS $$
BEGIN
  DELETE FROM dislikes
  WHERE user_id = NEW.user_id
    AND target_type = NEW.target_type
    AND target_id = NEW.target_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS likes_remove_matching_dislike ON likes;
CREATE TRIGGER likes_remove_matching_dislike
  BEFORE INSERT OR UPDATE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION remove_dislike_for_like();

CREATE OR REPLACE FUNCTION remove_like_for_dislike()
RETURNS trigger AS $$
BEGIN
  DELETE FROM likes
  WHERE user_id = NEW.user_id
    AND target_type = NEW.target_type
    AND target_id = NEW.target_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dislikes_remove_matching_like ON dislikes;
CREATE TRIGGER dislikes_remove_matching_like
  BEFORE INSERT OR UPDATE ON dislikes
  FOR EACH ROW
  EXECUTE FUNCTION remove_like_for_dislike();

CREATE OR REPLACE FUNCTION delete_content_dislikes()
RETURNS trigger AS $$
BEGIN
  DELETE FROM dislikes WHERE target_type = 'content' AND target_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_delete_dislikes ON content;
CREATE TRIGGER content_delete_dislikes
  AFTER DELETE ON content
  FOR EACH ROW
  EXECUTE FUNCTION delete_content_dislikes();

CREATE OR REPLACE FUNCTION delete_series_dislikes()
RETURNS trigger AS $$
BEGIN
  DELETE FROM dislikes WHERE target_type = 'series' AND target_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS series_delete_dislikes ON series;
CREATE TRIGGER series_delete_dislikes
  AFTER DELETE ON series
  FOR EACH ROW
  EXECUTE FUNCTION delete_series_dislikes();

CREATE TABLE IF NOT EXISTS content_reactions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  target_type text NOT NULL DEFAULT 'content',
  target_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'content_reactions'::regclass
      AND conname = 'content_reactions_target_type_check'
  ) THEN
    ALTER TABLE content_reactions
      ADD CONSTRAINT content_reactions_target_type_check CHECK (target_type IN ('content', 'series'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS content_reactions_target_idx
  ON content_reactions(target_type, target_id, reaction);

CREATE OR REPLACE FUNCTION validate_content_reaction_target()
RETURNS trigger AS $$
BEGIN
  IF NEW.target_type = 'content' THEN
    NEW.content_id = NEW.target_id;

    PERFORM 1 FROM content WHERE id = NEW.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reaction target content not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.target_type = 'series' THEN
    NEW.content_id = NULL;

    PERFORM 1 FROM series WHERE id = NEW.target_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reaction target series not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid reaction target type'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_reactions_validate_target ON content_reactions;
CREATE TRIGGER content_reactions_validate_target
  BEFORE INSERT OR UPDATE ON content_reactions
  FOR EACH ROW
  EXECUTE FUNCTION validate_content_reaction_target();

CREATE OR REPLACE FUNCTION delete_content_reactions()
RETURNS trigger AS $$
BEGIN
  DELETE FROM content_reactions WHERE target_type = 'content' AND target_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_delete_reactions ON content;
CREATE TRIGGER content_delete_reactions
  AFTER DELETE ON content
  FOR EACH ROW
  EXECUTE FUNCTION delete_content_reactions();

CREATE OR REPLACE FUNCTION delete_series_reactions()
RETURNS trigger AS $$
BEGIN
  DELETE FROM content_reactions WHERE target_type = 'series' AND target_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS series_delete_reactions ON series;
CREATE TRIGGER series_delete_reactions
  AFTER DELETE ON series
  FOR EACH ROW
  EXECUTE FUNCTION delete_series_reactions();

INSERT INTO content_reactions (user_id, content_id, target_type, target_id, reaction, created_at, updated_at)
SELECT user_id, content_id, target_type, target_id, 'dislike', created_at, created_at
FROM dislikes
ON CONFLICT (user_id, target_type, target_id) DO NOTHING;

-- likes is now used for favourites only. Reactions live in content_reactions.
DROP TRIGGER IF EXISTS likes_remove_matching_dislike ON likes;
DROP TRIGGER IF EXISTS dislikes_remove_matching_like ON dislikes;
DROP FUNCTION IF EXISTS remove_dislike_for_like();
DROP FUNCTION IF EXISTS remove_like_for_dislike();

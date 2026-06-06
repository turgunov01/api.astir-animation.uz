ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'content',
  ADD COLUMN IF NOT EXISTS target_id text;

UPDATE comments
SET target_id = content_id::text
WHERE target_id IS NULL AND content_id IS NOT NULL;

ALTER TABLE comments
  ALTER COLUMN target_id SET NOT NULL,
  ALTER COLUMN content_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comments_target_type_check'
      AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_target_type_check
      CHECK (target_type = 'content');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS comments_target_idx
  ON comments(target_type, target_id);

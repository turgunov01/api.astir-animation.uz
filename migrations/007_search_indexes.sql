CREATE INDEX IF NOT EXISTS content_search_title_trgm_idx
  ON content USING gin (
    (
      lower(
        COALESCE(title->>'en', '') || ' ' ||
        COALESCE(title->>'ru', '') || ' ' ||
        COALESCE(title->>'uz', '')
      )
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS content_search_description_trgm_idx
  ON content USING gin (
    (
      lower(
        COALESCE(description->>'en', '') || ' ' ||
        COALESCE(description->>'ru', '') || ' ' ||
        COALESCE(description->>'uz', '')
      )
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS series_search_title_trgm_idx
  ON series USING gin (
    (
      lower(
        COALESCE(title->>'en', '') || ' ' ||
        COALESCE(title->>'ru', '') || ' ' ||
        COALESCE(title->>'uz', '')
      )
    ) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS series_search_description_trgm_idx
  ON series USING gin (
    (
      lower(
        COALESCE(description->>'en', '') || ' ' ||
        COALESCE(description->>'ru', '') || ' ' ||
        COALESCE(description->>'uz', '')
      )
    ) gin_trgm_ops
  );

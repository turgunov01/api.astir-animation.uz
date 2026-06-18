function localizedSearchExpression(alias, field) {
  return `lower(
    COALESCE(${alias}.${field}->>'en', '') || ' ' ||
    COALESCE(${alias}.${field}->>'ru', '') || ' ' ||
    COALESCE(${alias}.${field}->>'uz', '')
  )`;
}

function posterUrl(row) {
  if (!row.poster_path) {
    return row.poster_url || null;
  }

  const route = row.item_type === "series" ? "series" : "content";

  return `/api/v1/${route}/${encodeURIComponent(String(row.id))}/poster`;
}

function searchResult(row) {
  const itemType = row.item_type === "series" ? "series" : "movie";

  return {
    movie: {
      id: row.id,
      title: row.title || {},
      description: row.description || {},
      slug: row.slug || null,
      category_id: row.category_id || null,
      content_type: itemType === "series" ? "series" : "movie",
      poster_url: posterUrl(row),
      transcode: {
        status: itemType === "series" ? "missing_source" : row.status || "missing_source",
        error: null
      },
      age_rating: row.age_rating || 0,
      duration_sec: row.duration_sec || 0
    },
    resultType: itemType === "series" ? "series" : "movies",
    targetType: itemType === "series" ? "series" : "content"
  };
}

function escapedLikePattern(value) {
  return `%${String(value || "").trim().toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}

function normalizedFilterValues(values = []) {
  return [...new Set(
    values
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  )];
}

export function createPostgresContentSearchRepository(db) {
  const contentTitle = localizedSearchExpression("c", "title");
  const contentDescription = localizedSearchExpression("c", "description");
  const seriesTitle = localizedSearchExpression("s", "title");
  const seriesDescription = localizedSearchExpression("s", "description");

  return {
    async search(query, {
      includeUnpublished = false,
      ownerId = null,
      childId = null
    } = {}) {
      const rows = await db.many(
        `
          WITH series_metrics AS (
            SELECT
              c.series_id,
              COALESCE(MAX(c.age_rating), 0)::integer AS age_rating,
              COALESCE(SUM(c.duration_sec), 0)::integer AS duration_sec
            FROM content c
            WHERE c.series_id IS NOT NULL
              AND ($2::boolean OR c.published = true)
            GROUP BY c.series_id
          ),
          search_results AS (
            SELECT
              c.id,
              c.title,
              c.description,
              c.slug,
              c.category_id,
              c.poster_path,
              c.poster_url,
              c.status,
              c.age_rating,
              c.duration_sec,
              'movie'::text AS item_type,
              CASE
                WHEN ${contentTitle} LIKE $5 ESCAPE E'\\\\' THEN 0
                WHEN ${contentDescription} LIKE $5 ESCAPE E'\\\\' THEN 1
                ELSE 2
              END AS sort_rank
            FROM content c
            WHERE c.series_id IS NULL
              AND ($2::boolean OR c.published = true)
              AND (
                ${contentTitle} LIKE $5 ESCAPE E'\\\\'
                OR ${contentDescription} LIKE $5 ESCAPE E'\\\\'
                OR similarity(${contentTitle}, lower($1)) > 0.25
              )
              AND (
                $3::uuid IS NULL
                OR NOT EXISTS (
                  SELECT 1
                  FROM blocks b
                  WHERE b.user_id = $3
                    AND b.content_id = c.id
                )
              )
              AND (
                $4::uuid IS NULL
                OR NOT EXISTS (
                  SELECT 1
                  FROM child_permissions p
                  WHERE p.child_id = $4
                    AND p.mode = 'deny'
                    AND (
                      p.content_id = c.id
                      OR (p.series_id IS NOT NULL AND p.series_id = c.series_id)
                      OR (p.category_id IS NOT NULL AND p.category_id = c.category_id)
                    )
                )
              )

            UNION ALL

            SELECT
              s.id,
              s.title,
              s.description,
              s.slug,
              s.category_id,
              s.poster_path,
              s.poster_url,
              NULL::text AS status,
              COALESCE(sm.age_rating, 0) AS age_rating,
              COALESCE(sm.duration_sec, 0) AS duration_sec,
              'series'::text AS item_type,
              CASE
                WHEN ${seriesTitle} LIKE $5 ESCAPE E'\\\\' THEN 0
                WHEN ${seriesDescription} LIKE $5 ESCAPE E'\\\\' THEN 1
                ELSE 2
              END AS sort_rank
            FROM series s
            LEFT JOIN series_metrics sm ON sm.series_id = s.id
            WHERE ($2::boolean OR s.active = true)
              AND (
                ${seriesTitle} LIKE $5 ESCAPE E'\\\\'
                OR ${seriesDescription} LIKE $5 ESCAPE E'\\\\'
                OR similarity(${seriesTitle}, lower($1)) > 0.25
                OR EXISTS (
                  SELECT 1
                  FROM content c
                  WHERE c.series_id = s.id
                    AND ($2::boolean OR c.published = true)
                    AND (
                      ${contentTitle} LIKE $5 ESCAPE E'\\\\'
                      OR ${contentDescription} LIKE $5 ESCAPE E'\\\\'
                      OR similarity(${contentTitle}, lower($1)) > 0.25
                    )
                )
              )
              AND (
                $4::uuid IS NULL
                OR NOT EXISTS (
                  SELECT 1
                  FROM child_permissions p
                  WHERE p.child_id = $4
                    AND p.mode = 'deny'
                    AND (
                      (p.category_id IS NOT NULL AND p.category_id = s.category_id)
                      OR (p.series_id IS NOT NULL AND p.series_id = s.id)
                    )
                )
              )
          )
          SELECT *
          FROM search_results
          ORDER BY
            sort_rank,
            lower(COALESCE(title->>'ru', title->>'en', title->>'uz', '')),
            item_type
        `,
        [
          String(query || "").trim(),
          Boolean(includeUnpublished),
          ownerId,
          childId,
          escapedLikePattern(query)
        ]
      );

      return rows.map(searchResult);
    },

    async filter({
      categoryIds = [],
      tagIds = [],
      includeUnpublished = false,
      ownerId = null,
      childId = null
    } = {}) {
      const categoryValues = normalizedFilterValues(categoryIds);
      const tagValues = normalizedFilterValues(tagIds);

      if (categoryValues.length === 0 && tagValues.length === 0) {
        return [];
      }

      const rows = await db.many(
        `
          WITH series_metrics AS (
            SELECT
              c.series_id,
              COALESCE(MAX(c.age_rating), 0)::integer AS age_rating,
              COALESCE(SUM(c.duration_sec), 0)::integer AS duration_sec
            FROM content c
            WHERE c.series_id IS NOT NULL
              AND ($1::boolean OR c.published = true)
            GROUP BY c.series_id
          ),
          filter_results AS (
            SELECT
              c.id,
              c.title,
              c.description,
              c.slug,
              c.category_id,
              c.poster_path,
              c.poster_url,
              c.status,
              c.age_rating,
              c.duration_sec,
              'movie'::text AS item_type
            FROM content c
            LEFT JOIN categories cat ON cat.id = c.category_id
            WHERE c.series_id IS NULL
              AND ($1::boolean OR c.published = true)
              AND (
                cardinality($4::text[]) = 0
                OR lower(c.category_id::text) = ANY($4::text[])
                OR lower(cat.slug) = ANY($4::text[])
                OR lower(cat.name->>'en') = ANY($4::text[])
                OR lower(cat.name->>'ru') = ANY($4::text[])
                OR lower(cat.name->>'uz') = ANY($4::text[])
              )
              AND (
                cardinality($5::text[]) = 0
                OR EXISTS (
                  SELECT 1
                  FROM content_tags ct
                  JOIN tags t ON t.id = ct.tag_id
                  WHERE ct.content_id = c.id
                    AND (
                      lower(ct.tag_id::text) = ANY($5::text[])
                      OR lower(t.slug) = ANY($5::text[])
                      OR lower(t.name->>'en') = ANY($5::text[])
                      OR lower(t.name->>'ru') = ANY($5::text[])
                      OR lower(t.name->>'uz') = ANY($5::text[])
                    )
                )
              )
              AND (
                $2::uuid IS NULL
                OR NOT EXISTS (
                  SELECT 1
                  FROM blocks b
                  WHERE b.user_id = $2
                    AND b.content_id = c.id
                )
              )
              AND (
                $3::uuid IS NULL
                OR NOT EXISTS (
                  SELECT 1
                  FROM child_permissions p
                  WHERE p.child_id = $3
                    AND p.mode = 'deny'
                    AND (
                      p.content_id = c.id
                      OR (p.series_id IS NOT NULL AND p.series_id = c.series_id)
                      OR (p.category_id IS NOT NULL AND p.category_id = c.category_id)
                    )
                )
              )

            UNION ALL

            SELECT
              s.id,
              s.title,
              s.description,
              s.slug,
              s.category_id,
              s.poster_path,
              s.poster_url,
              NULL::text AS status,
              COALESCE(sm.age_rating, 0) AS age_rating,
              COALESCE(sm.duration_sec, 0) AS duration_sec,
              'series'::text AS item_type
            FROM series s
            LEFT JOIN categories cat ON cat.id = s.category_id
            LEFT JOIN series_metrics sm ON sm.series_id = s.id
            WHERE ($1::boolean OR s.active = true)
              AND (
                cardinality($4::text[]) = 0
                OR lower(s.category_id::text) = ANY($4::text[])
                OR lower(cat.slug) = ANY($4::text[])
                OR lower(cat.name->>'en') = ANY($4::text[])
                OR lower(cat.name->>'ru') = ANY($4::text[])
                OR lower(cat.name->>'uz') = ANY($4::text[])
                OR EXISTS (
                  SELECT 1
                  FROM content ec
                  LEFT JOIN categories ecat ON ecat.id = ec.category_id
                  WHERE ec.series_id = s.id
                    AND ($1::boolean OR ec.published = true)
                    AND (
                      lower(ec.category_id::text) = ANY($4::text[])
                      OR lower(ecat.slug) = ANY($4::text[])
                      OR lower(ecat.name->>'en') = ANY($4::text[])
                      OR lower(ecat.name->>'ru') = ANY($4::text[])
                      OR lower(ecat.name->>'uz') = ANY($4::text[])
                    )
                )
              )
              AND (
                cardinality($5::text[]) = 0
                OR EXISTS (
                  SELECT 1
                  FROM content ec
                  JOIN content_tags ct ON ct.content_id = ec.id
                  JOIN tags t ON t.id = ct.tag_id
                  WHERE ec.series_id = s.id
                    AND ($1::boolean OR ec.published = true)
                    AND (
                      lower(ct.tag_id::text) = ANY($5::text[])
                      OR lower(t.slug) = ANY($5::text[])
                      OR lower(t.name->>'en') = ANY($5::text[])
                      OR lower(t.name->>'ru') = ANY($5::text[])
                      OR lower(t.name->>'uz') = ANY($5::text[])
                    )
                )
              )
              AND (
                $3::uuid IS NULL
                OR NOT EXISTS (
                  SELECT 1
                  FROM child_permissions p
                  WHERE p.child_id = $3
                    AND p.mode = 'deny'
                    AND (
                      (p.category_id IS NOT NULL AND p.category_id = s.category_id)
                      OR (p.series_id IS NOT NULL AND p.series_id = s.id)
                    )
                )
              )
          )
          SELECT *
          FROM filter_results
          ORDER BY
            lower(COALESCE(title->>'ru', title->>'en', title->>'uz', '')),
            item_type
        `,
        [
          Boolean(includeUnpublished),
          ownerId,
          childId,
          categoryValues,
          tagValues
        ]
      );

      return rows.map(searchResult);
    }
  };
}

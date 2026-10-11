// Admin "Комментарии" page: every top-level comment across the catalog with
// its author, the cartoon it belongs to and its replies — filterable by
// content, reply status and text, newest or oldest first.

const SORTS = { new: "c.created_at DESC", old: "c.created_at ASC" };
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function fullName(row) {
  return [row.user_name, row.user_last_name].filter(Boolean).join(" ").trim();
}

function serialize(row) {
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    content_id: row.target_id || row.content_id || null,
    parent_id: row.parent_id || null,
    author: {
      id: row.user_id,
      name: fullName(row) || row.user_email || "Пользователь",
      avatar_url: row.user_avatar_url || "",
      is_admin: ADMIN_ROLES.has(row.user_role)
    }
  };
}

const SELECT_COMMENT = `
  SELECT c.*, u.name AS user_name, u.last_name AS user_last_name, u.email AS user_email,
    u.avatar_url AS user_avatar_url, u.role AS user_role
  FROM comments c
  JOIN users u ON u.id = c.user_id
`;

// Titles and posters for the content ids comments point at: catalog movies
// first, then legacy episodes; anything else was deleted.
async function describeContent(db, contentMovies, ids) {
  const map = new Map();
  const missing = [];

  for (const id of ids) {
    const movie = contentMovies?.findById?.(id);
    if (movie) {
      map.set(id, {
        id,
        title: movie.title || null,
        poster_url: movie.poster?.url || "",
        content_type: movie.content_type || "movie",
        exists: true
      });
    } else {
      missing.push(id);
    }
  }

  const uuids = missing.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (uuids.length) {
    const rows = await db.many("SELECT id::text, title, poster_url FROM content WHERE id = ANY($1::uuid[])", [uuids]);
    for (const row of rows) {
      map.set(row.id, { id: row.id, title: row.title, poster_url: row.poster_url || "", content_type: "episode", exists: true });
    }
  }

  for (const id of ids) {
    if (!map.has(id)) map.set(id, { id, title: null, poster_url: "", content_type: "deleted", exists: false });
  }

  return map;
}

export async function listAdminComments(db, contentMovies, query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const sort = SORTS[query.sort] || SORTS.new;
  const where = ["c.parent_id IS NULL"];
  const params = [];

  if (query.content_id) {
    params.push(String(query.content_id));
    where.push(`COALESCE(c.target_id, c.content_id::text) = $${params.length}`);
  }

  if (query.q) {
    params.push(`%${String(query.q).trim()}%`);
    where.push(`(c.body ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.last_name ILIKE $${params.length})`);
  }

  if (query.status === "unanswered" || query.status === "answered") {
    where.push(`${query.status === "answered" ? "" : "NOT "}EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id)`);
  }

  const filter = `WHERE ${where.join(" AND ")}`;
  const [totalRow, rows, contentRows] = await Promise.all([
    db.one(`SELECT count(*)::int AS count FROM comments c JOIN users u ON u.id = c.user_id ${filter}`, params),
    db.many(`${SELECT_COMMENT} ${filter} ORDER BY ${sort} LIMIT ${limit} OFFSET ${offset}`, params),
    db.many(`
      SELECT COALESCE(target_id, content_id::text) AS id, count(*)::int AS count
      FROM comments WHERE parent_id IS NULL GROUP BY 1 ORDER BY 2 DESC
    `)
  ]);

  const replies = rows.length
    ? await db.many(`${SELECT_COMMENT} WHERE c.parent_id = ANY($1::uuid[]) ORDER BY c.created_at ASC`, [rows.map((row) => row.id)])
    : [];

  const contentIds = [...new Set([...rows.map((row) => row.target_id || row.content_id), ...contentRows.map((row) => row.id)].filter(Boolean))];
  const contents = await describeContent(db, contentMovies, contentIds);

  return {
    items: rows.map((row) => {
      const own = replies.filter((reply) => reply.parent_id === row.id).map(serialize);
      const comment = serialize(row);
      return { ...comment, content: contents.get(comment.content_id) || null, replies: own, replies_count: own.length };
    }),
    total: totalRow?.count || 0,
    contents: contentRows.map((row) => ({ ...contents.get(row.id), comments_count: row.count }))
  };
}

export async function replyToComment(db, adminUser, commentId, body) {
  const parent = await db.one("SELECT * FROM comments WHERE id = $1", [commentId]);
  if (!parent) return null;

  // Replies stay one level deep: answering a reply answers its thread.
  const rootId = parent.parent_id || parent.id;
  const row = await db.one(
    `INSERT INTO comments (user_id, content_id, target_type, target_id, body, parent_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [adminUser.id, parent.content_id, parent.target_type, parent.target_id, body, rootId]
  );

  return serialize({
    ...row,
    user_name: adminUser.name,
    user_last_name: adminUser.last_name,
    user_email: adminUser.email,
    user_avatar_url: adminUser.avatar_url,
    user_role: adminUser.role
  });
}

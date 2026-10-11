import { isOnline } from "../services/presence.js";

// Support chat in the spirit of Telegram: paged history, per-message read
// state, replies, a shared-media panel and the user's profile with
// online / last-seen status.

const MESSAGE_COLUMNS = `
  m.*,
  r.id AS reply_id, r.body AS reply_body, r.sender_role AS reply_sender_role,
  r.attachment_name AS reply_attachment_name, r.attachment_type AS reply_attachment_type
`;
const LINK_PATTERN = /https?:\/\/[^\s<>"')]+/gi;

export function serializeSupportMessage(row) {
  const { reply_id, reply_body, reply_sender_role, reply_attachment_name, reply_attachment_type, ...message } = row;
  return {
    ...message,
    reply_to: reply_id
      ? { id: reply_id, body: reply_body, sender_role: reply_sender_role, attachment_name: reply_attachment_name, attachment_type: reply_attachment_type }
      : null
  };
}

// Newest first (the order the app already expects). `before` / `after` are
// message timestamps for paging back through history or fetching new ones.
export async function listSupportMessages(db, chatId, { before, after, limit } = {}) {
  const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const where = ["m.chat_id = $1"];
  const params = [chatId];
  if (before) {
    params.push(new Date(before).toISOString());
    where.push(`m.created_at < $${params.length}`);
  }
  if (after) {
    params.push(new Date(after).toISOString());
    where.push(`m.created_at > $${params.length}`);
  }
  params.push(size + 1);
  const rows = await db.many(
    `SELECT ${MESSAGE_COLUMNS} FROM support_messages m
     LEFT JOIN support_messages r ON r.id = m.reply_to_id
     WHERE ${where.join(" AND ")}
     ORDER BY m.created_at DESC LIMIT $${params.length}`,
    params
  );
  return { data: rows.slice(0, size).map(serializeSupportMessage), has_more: rows.length > size };
}

export async function findSupportMessage(db, id) {
  const row = await db.one(
    `SELECT ${MESSAGE_COLUMNS} FROM support_messages m LEFT JOIN support_messages r ON r.id = m.reply_to_id WHERE m.id = $1`,
    [id]
  );
  return row ? serializeSupportMessage(row) : null;
}

// The reader saw everything the other side sent.
export async function markSupportChatRead(db, chatId, reader) {
  const fromOtherSide = reader === "admin" ? "m.sender_role = 'user'" : "m.sender_role <> 'user'";
  await db.query(`UPDATE support_messages m SET read_at = now() WHERE m.chat_id = $1 AND m.read_at IS NULL AND ${fromOtherSide}`, [chatId]);
  await db.query(`UPDATE support_chats SET ${reader === "admin" ? "admin_unread_count" : "user_unread_count"} = 0 WHERE id = $1`, [chatId]);
}

export async function listAdminSupportChats(db, { q = "", limit = 50, offset = 0 } = {}) {
  const params = [];
  let filter = "";
  if (String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    filter = `WHERE (u.name ILIKE $1 OR u.last_name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1
      OR EXISTS (SELECT 1 FROM support_messages s WHERE s.chat_id = sc.id AND s.body ILIKE $1))`;
  }
  params.push(Math.min(Number(limit) || 50, 200), Math.max(Number(offset) || 0, 0));
  const rows = await db.many(
    `SELECT sc.*, u.id AS user_id, u.name, u.last_name, u.email, u.phone, u.avatar_url, u.last_seen_at,
       lm.sender_role AS last_sender_role, lm.read_at AS last_read_at, lm.attachment_type AS last_attachment_type,
       lm.attachment_name AS last_attachment_name, lm.body AS last_body
     FROM support_chats sc
     JOIN users u ON u.id = sc.user_id
     LEFT JOIN LATERAL (SELECT * FROM support_messages x WHERE x.chat_id = sc.id ORDER BY x.created_at DESC LIMIT 1) lm ON true
     ${filter}
     ORDER BY sc.last_message_at DESC NULLS LAST, sc.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    unread: row.admin_unread_count || 0,
    last_message_at: row.last_message_at,
    last_message: row.last_sender_role
      ? {
          body: row.last_body || "",
          sender_role: row.last_sender_role,
          read: Boolean(row.last_read_at),
          attachment_type: row.last_attachment_type,
          attachment_name: row.last_attachment_name
        }
      : null,
    user: {
      id: row.user_id,
      name: [row.name, row.last_name].filter(Boolean).join(" ").trim() || row.email || row.phone || "Пользователь",
      email: row.email,
      phone: row.phone,
      avatar_url: row.avatar_url,
      last_seen_at: row.last_seen_at,
      online: isOnline(row.last_seen_at)
    }
  }));
}

// Everything shared in the chat, for the "Медиа / Файлы / Ссылки" panel.
export async function supportChatMedia(db, chatId) {
  const rows = await db.many(
    `SELECT id, body, sender_role, created_at, attachment_url, attachment_name, attachment_type, attachment_size
     FROM support_messages WHERE chat_id = $1 ORDER BY created_at DESC`,
    [chatId]
  );
  const media = [];
  const files = [];
  const links = [];
  for (const row of rows) {
    if (row.attachment_url) {
      const item = { id: row.id, url: row.attachment_url, name: row.attachment_name, type: row.attachment_type, size: row.attachment_size, created_at: row.created_at, sender_role: row.sender_role };
      (/^(image|video)\//.test(String(row.attachment_type || "")) ? media : files).push(item);
    }
    for (const url of String(row.body || "").match(LINK_PATTERN) || []) {
      links.push({ id: `${row.id}:${links.length}`, message_id: row.id, url, created_at: row.created_at, sender_role: row.sender_role });
    }
  }
  return { media, files, links };
}

export async function supportChatProfile(db, chatId) {
  const user = await db.one(
    `SELECT u.id, u.name, u.last_name, u.email, u.phone, u.avatar_url, u.created_at, u.last_seen_at, u.auth_provider
     FROM support_chats sc JOIN users u ON u.id = sc.user_id WHERE sc.id = $1`,
    [chatId]
  );
  if (!user) return null;
  const [children, subscription, counts] = await Promise.all([
    db.many("SELECT id, name, age FROM children WHERE parent_id = $1 ORDER BY created_at", [user.id]),
    db.one(`
      SELECT 'v1' AS source, s.tariff_id AS plan, s.status, s.expires_at FROM v1_subscriptions s WHERE s.parent_id = $1 AND s.expires_at > now()
      UNION ALL
      SELECT 'legacy', p.name::text, s.status, s.ends_at FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.user_id = $1 AND s.status = 'active' AND s.ends_at > now()
      ORDER BY expires_at DESC LIMIT 1
    `, [user.id]),
    db.one(`SELECT count(*)::int AS messages, count(*) FILTER (WHERE attachment_url IS NOT NULL)::int AS files FROM support_messages WHERE chat_id = $1`, [chatId])
  ]);
  return {
    ...user,
    full_name: [user.name, user.last_name].filter(Boolean).join(" ").trim() || user.email || "Пользователь",
    online: isOnline(user.last_seen_at),
    children,
    subscription,
    counts
  };
}

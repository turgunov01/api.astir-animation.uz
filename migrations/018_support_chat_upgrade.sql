-- Telegram-style support chat: online / last seen, per-message read state
-- (one tick sent, two ticks read) and replies to a message.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES support_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS support_messages_chat_created_idx ON support_messages (chat_id, created_at DESC);

-- Existing history: everything but the still-unread tail counts as read.
UPDATE support_messages m SET read_at = m.created_at
WHERE m.read_at IS NULL AND m.id NOT IN (
  SELECT u.id FROM support_chats c
  CROSS JOIN LATERAL (
    SELECT id FROM support_messages x
    WHERE x.chat_id = c.id AND x.sender_role = 'user'
    ORDER BY x.created_at DESC LIMIT GREATEST(c.admin_unread_count, 0)
  ) u
  UNION
  SELECT a.id FROM support_chats c
  CROSS JOIN LATERAL (
    SELECT id FROM support_messages x
    WHERE x.chat_id = c.id AND x.sender_role <> 'user'
    ORDER BY x.created_at DESC LIMIT GREATEST(c.user_unread_count, 0)
  ) a
);

-- Seed "last seen" from the latest login or session refresh.
UPDATE users u SET last_seen_at = GREATEST(u.last_login_at, (SELECT max(created_at) FROM refresh_tokens r WHERE r.user_id = u.id))
WHERE u.last_seen_at IS NULL;

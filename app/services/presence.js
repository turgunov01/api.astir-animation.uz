// "Online" / "last seen" for users: every authenticated request from the app
// marks the user as seen (at most once per 30 s per user), so a parent who
// has the app open shows as online in the support chat.
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const WRITE_EVERY_MS = 30 * 1000;

export function createPresence({ db = null } = {}) {
  const lastWrite = new Map();

  return {
    touch(userId) {
      if (!db || !userId) return;
      const now = Date.now();
      if (now - (lastWrite.get(userId) || 0) < WRITE_EVERY_MS) return;
      lastWrite.set(userId, now);
      db.query("UPDATE users SET last_seen_at = now() WHERE id = $1", [userId]).catch(() => {
        lastWrite.delete(userId);
      });
    },

    // Express middleware: after the response, mark whoever was authenticated.
    middleware() {
      return (request, response, next) => {
        response.on("finish", () => {
          if (response.statusCode >= 400) return;
          this.touch(request.legacyUser?.id || request.parent?.id || null);
        });
        next();
      };
    }
  };
}

export function isOnline(lastSeenAt, now = Date.now()) {
  return Boolean(lastSeenAt) && now - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

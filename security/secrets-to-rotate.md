# Secrets to Rotate (Exposed via committed `.env`)

Because `.env` is tracked in git, **every secret below must be treated as compromised**
and rotated — even after the file is removed, the values remain in git history until the
history is rewritten. Values are masked here; see the actual `.env` for specifics.

| Secret (env var) | What it protects | Why it's exposed | Action |
|------------------|------------------|------------------|--------|
| `DATABASE_URL` (user `astir_user`, host `95.46.96.48`) | PostgreSQL database (all app + children data) | Full connection string incl. password committed; DB on a **public IP** | Change the DB password; restrict the DB to private network / IP allow-list; consider a new DB user |
| `SUPER_ADMIN_PASSWORD` | Super-admin account login | Plaintext in `.env` | Reset the super-admin password; review admin audit logs |
| `JWT_SECRET` | Signing key for **all** JWTs (parent/device/TV/refresh/admin) | Committed **and** weak/guessable | Generate a new high-entropy secret; this invalidates all existing tokens (expected) |
| `MEDIA_SIGNING_SECRET` | HMAC for signed media URLs | Committed; value is a guessable placeholder | Generate a new random secret |
| `SMTP_PASS` (Gmail app password, `AstirAnimationStudio@gmail.com`) | Outbound mail / OTP delivery | Committed app password | Revoke the Google app password and issue a new one |
| `CLICK_SECRET_KEY` | CLICK payment merchant signature | Committed merchant secret | Rotate via CLICK merchant dashboard; review recent transactions for fraud |
| `FIREBASE_SERVICE_ACCOUNT_PATH` → service-account key file | Firebase Cloud Messaging (push) | Path is committed; the **file** is in `secrets/` (git-ignored, not tracked) | Verify the key file was never committed elsewhere; rotate the service-account key if any doubt |
| `GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS` | OAuth audience validation | Committed | Public identifiers (not secret) — no rotation needed, but confirm they are correct |

## Recommended process

1. **Rotate** each secret above at its source (DB, Google account, CLICK dashboard, Firebase console).
2. **Stop tracking** the file: `git rm --cached .env`, then add a bare `.env` line to `.gitignore`
   (currently only `.env.*` is ignored, which misses `.env`).
3. **Purge history**: rewrite git history with `git filter-repo` (or BFG) to remove `.env`
   from all past commits, then force-push and have all clones re-clone.
4. **Move secrets** to a proper secret store / deployment-time env injection (not a repo file).
5. **Add a guard**: fail app startup if any secret is missing or equals a known default
   (ties into Finding 12).

> ⚠️ Rotating `JWT_SECRET` logs out every existing session/device (they must re-authenticate).
> Plan the cutover, but do not skip it — the old key is compromised.
</content>

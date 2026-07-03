# Astir — Detailed Security Findings

Read-only audit. Line numbers reflect the state of the repo at review time. Secret
values are **masked** here on purpose so this document does not itself re-leak them.

---

## 1. 🔴 CRITICAL — Live production secrets committed to git (`.env`)

**Evidence:** `git ls-files` lists `.env` as tracked. `.gitignore` ignores `.env.*`
(with a `!.env.example` exception) but the pattern `.env.*` does **not** match the base
filename `.env`, so the real secrets file slipped into version control.

`.env` contains real, production-looking secrets, including:

- `DATABASE_URL` — Postgres user + password pointed at a **public IP** (`…@95.46.96.48:5432/astir_test_db`).
- `SUPER_ADMIN_PASSWORD` — plaintext super-admin password.
- `SMTP_PASS` — a Gmail **app password** for `AstirAnimationStudio@gmail.com`.
- `CLICK_SECRET_KEY` — the CLICK payment **merchant secret** (payment fraud / signature forgery risk).
- `MEDIA_SIGNING_SECRET` — HMAC key for media URLs (a guessable placeholder string).
- `JWT_SECRET` — token signing key (see Finding 2).

**Impact:** Anyone with repo access (current/former devs, a leaked clone, a mirror, CI
logs) has direct database credentials, admin login, the mail account, and the payment
merchant key. The DB is reachable on a public IP, so DB creds alone are remotely usable.

**Root cause:** `.gitignore` line `.env.*` should also include a bare `.env` entry.

**Remediation direction (not yet applied):**
1. Rotate **every** secret — see `secrets-to-rotate.md`.
2. `git rm --cached .env`, add `.env` to `.gitignore`, and purge it from history
   (`git filter-repo` / BFG) since history retains the old values.
3. Restrict the database to private networking / IP allow-list instead of a public IP.

---

## 2. 🔴 CRITICAL — Weak, shared, hardcoded-fallback `JWT_SECRET`

**Evidence:**
- `.env:4` → `JWT_SECRET=astir-development-secret` (a guessable dictionary-style string).
- `app/config.js:26` → `process.env.JWT_SECRET || "astir-local-development-secret"`.
- `app/legacy/auth.js:17` → `process.env.JWT_SECRET || "astir-local-development-secret"`.

The same key signs **parent, device, TV, refresh, and legacy user/super-admin** tokens
(`app/lib/tokens.js`, `app/legacy/auth.js`). If the env var is missing, the app silently
falls back to a public hardcoded string rather than failing.

**Impact:** With a known/guessable signing key, an attacker can forge **any** token —
including an arbitrary `parent`, `device`, or (see Finding 3) `super_admin` token —
without touching the database. This is a full authentication bypass.

**Remediation direction:** Generate a high-entropy random secret, load only from env,
and refuse to boot if it is absent or matches a known default. Consider key rotation
support (`kid`) and short-lived tokens.

---

## 3. 🔴 CRITICAL — Super-admin privilege escalation via unverified role claim

**Evidence:** `app/middleware/auth.js`:
- `isLegacySuperAdminPayload()` (`:30-32`) trusts a token where `kind === "user"` and
  `role === "super_admin"`.
- `legacySuperAdminParent()` (`:34-43`) then **fabricates** a parent object
  (`role: super_admin`, `tariff: "premium"`, `active: true`) **directly from the token
  payload — with no database lookup** to confirm the user exists or is really an admin.
- Both `requireParent` (`:222-226`) and `requireActor` (`:323-330`) honor this path.

**Impact:** Every other identity path in this file re-checks the subject against the DB
(`parents.findById(...)`), but the super-admin path does not. Combined with Finding 2
(guessable signing key), an attacker forges `{ kind:"user", role:"super_admin", sub:"…" }`
and is granted full admin + premium with zero server-side verification. Even without a
leaked key, trusting an authorization claim straight from the token is unsafe design.

> Note: the **legacy** `app/legacy/auth.js` `requireSuperAdmin` (`:412-421`) *does* load
> the user from the DB and check `active = true`. The `app/middleware/auth.js` path is the
> weaker one and should be brought in line with it.

**Remediation direction:** Resolve the super-admin from the database and verify the
persisted role/active flag before granting privileges; never derive authorization solely
from token claims.

---

## 4. 🟠 HIGH — `/media` served as unsigned static, bypassing the signed-URL scheme

**Evidence:**
- `app/legacy/media.js` implements HMAC-signed, time-limited URLs
  (`publicUrl` → `…?expires=…&signature=…`, `verify()` checks signature + expiry).
- But `app/server.js:54` mounts `app.use("/media", express.static(path.resolve(config.mediaRoot)))`,
  which serves the **entire media root directly, with no signature or expiry check**.

**Impact:** The signing mechanism is effectively decorative — any client that knows or
guesses a stored path can `GET /media/<path>` and download uploaded content (children's
videos, posters, HLS segments, avatars) without a valid signature. Directory structure is
somewhat predictable (`hls/<movieId>/…`, `legacy/<kind>/…`).

**Remediation direction:** Serve media through an authenticated/signature-verifying
handler instead of a blanket static mount, or move signed content out of the static root.

---

## 5. 🟠 HIGH — Database TLS accepts any certificate

**Evidence:** `.env:15-16` sets `DATABASE_SSL=true` **and**
`DATABASE_SSL_REJECT_UNAUTHORIZED=false`. `app/legacy/db.js:53-57` passes that straight
into the `pg` pool as `ssl.rejectUnauthorized = false`.

**Impact:** TLS is enabled but certificate validation is disabled, so a
man-in-the-middle on the path to `95.46.96.48:5432` can present any cert and intercept /
modify all database traffic (including credentials and personal data of children).

**Remediation direction:** Use `verify-full` with the server's CA certificate; only
disable verification for local development against a self-signed cert, never in prod.

---

## 6. 🟠 HIGH — Wide-open CORS on an authenticated API

**Evidence:** `app/server.js:28` → `app.use(cors())` with no options, which emits
`Access-Control-Allow-Origin: *` for every route.

**Impact:** Any website can call the API from a victim's browser. Because auth uses
`Authorization: Bearer` (not cookies) the classic credentialed-CORS escalation is
limited, but the wildcard still exposes all endpoints to arbitrary origins and makes it
easy to build hostile web clients against the production API. No allow-list, no method
restrictions.

**Remediation direction:** Restrict `origin` to known first-party app/domains, limit
methods/headers, and disable credentials unless explicitly required.

---

## 7. 🟠 HIGH — No rate limiting / brute-force protection

**Evidence:** No `express-rate-limit`/`helmet`/throttle dependency in `package.json`; no
limiter middleware in `app/server.js` or the route modules.

**Impact (attack surfaces):**
- **OTP verify** (`app/legacy/auth.js:223-243`) — a 6-digit code with no attempt cap is
  brute-forceable.
- **OTP request** (`createOtp`, `:187-221`) — unlimited requests let an attacker spam the
  Gmail account (cost/abuse, deliverability, account lock).
- **Login / OAuth / refresh** — credential stuffing and token-guessing unthrottled.
- **Payment callbacks** — unthrottled.

**Remediation direction:** Add per-IP + per-account rate limits on auth/OTP/payment
routes and a max-attempts lock on OTP verification.

---

## 8. 🟠 HIGH — `REQUIRE_AUTH=false` global auth kill-switch

**Evidence:** `app/config.js:25` reads `REQUIRE_AUTH` (default `true`).
`app/middleware/auth.js:210-216`: when `config.requireAuth` is false, `requireParent` /
`requireDevice` / `requireActor` are replaced with `attachLocal*`, which auto-inject a
synthetic local parent/child/device (`getLocalContext`, `:108-156`) for any request that
lacks an `Authorization` header.

**Impact:** A single env flip turns the entire API unauthenticated, treating every
anonymous caller as an owning parent. `.env` currently sets `REQUIRE_AUTH=true`, but this
is a high-blast-radius foot-gun: a misconfigured deploy silently exposes all data. The
hardcoded local creds (`password123`, PIN `1234`) also ship in code (`:117-119`).

**Remediation direction:** Gate this strictly to `NODE_ENV !== "production"` and refuse to
start if auth is disabled in a production environment.

---

## 9. 🟡 MEDIUM — OTP weaknesses (brute-force + debug-code bypass)

**Evidence:**
- 6-digit numeric code (`randomCode(6)`, `app/lib/security.js:33-37`) with no verify
  throttle (see Finding 7); `verifyOtp` checks the last 5 unexpired codes.
- `app/config.js:39-40` exposes `otpDefaultCode` (`OTP_DEFAULT_CODE`) and `otpDebug`
  (`OTP_DEBUG`); `app/legacy/auth.js:219` returns `debug_code` when
  `LEGACY_OTP_DEBUG === "true"`.

**Impact:** If any debug/default-code toggle is enabled in production, OTP is trivially
bypassable; even without it, an unthrottled 6-digit code is brute-forceable.

**Remediation direction:** Remove debug/default-code paths from production builds, cap
verification attempts, and expire codes aggressively.

---

## 10. 🟡 MEDIUM — OAuth account linking trusts client-supplied email

**Evidence:** `app/legacy/auth.js`:
- `verifyGoogleToken` / `verifyAppleToken` fall back to a **body-supplied** email when the
  verified token lacks one: `email: payload.email || firstBodyString(body, "email")`
  (`:478`, `:506`).
- `findOrCreateOAuthUser` (`:512-546`) links by `auth_subject`, and when not found, looks
  up an existing user **by email** and rebinds that account's `auth_provider`/`auth_subject`
  to the incoming profile.

**Impact:** Apple in particular only returns email on first consent; the body value is
attacker-controlled. A crafted request can associate an OAuth identity with another
user's email-matched account, enabling account takeover / linking.

**Remediation direction:** Only trust email from the verified token (or a verified-email
claim); never link accounts based on an unverified, client-provided email.

---

## 11. 🟡 MEDIUM — Missing security headers

**Evidence:** `app/server.js` sets only `app.disable("x-powered-by")`. No `helmet` or
equivalent → no HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`,
`Referrer-Policy`, or CSP. Swagger UIs (`/api-docs`, `/legacy-api-docs`, per-scope docs)
are served publicly and expose the full API shape.

**Impact:** Increases exposure to clickjacking, MIME-sniffing, and downgrade attacks; the
open API docs aid reconnaissance.

**Remediation direction:** Add `helmet` with a sane baseline; gate Swagger UIs behind auth
or disable them in production.

---

## 12. 🟡 MEDIUM — Insecure silent fallbacks; no secret validation at startup

**Evidence:** `app/config.js` supplies working defaults for security-critical values
(`jwtSecret`, ssl behavior, etc.) and never asserts that required secrets are present or
non-default. The app boots "successfully" in an insecure state.

**Impact:** Misconfiguration fails open rather than loud. A deploy missing `JWT_SECRET`
runs with a public key; missing DB SSL settings degrade silently.

**Remediation direction:** Add a startup validation step (fail-fast) for all required
secrets, rejecting known default/placeholder values, especially when `NODE_ENV=production`.

---

## 13. ⚪ LOW / INFORMATIONAL

- **Upload MIME trust** (`app/middleware/upload.js:31-48`) — `fileFilter` accepts files
  based on the client-declared `file.mimetype` only, with no magic-byte/content
  verification. Filenames are randomized (good), but a mislabeled file can pass. The
  general upload size cap (`MAX_VIDEO_UPLOAD_MB=2048`) also applies to image fields.
- **ffmpeg spawn** (`app/legacy/routes.js:1665`, `app/services/transcoderService.js`) —
  uses `spawn(ffmpegPath, args, …)` with **array args (no shell)**, so classic shell
  injection does not apply. Inputs are server-generated paths; still worth confirming no
  user-controlled value can reach ffmpeg's `-i` in a way that enables ffmpeg protocol
  abuse (e.g. reading local files/URLs).
- **Synchronous scrypt** (`app/lib/security.js:5-27`) — `scryptSync` blocks the event
  loop on every hash/verify; under load this is a mild DoS lever. Prefer the async
  variant.
- **Repo hygiene** — `body.json` and `app/legacy/legacy-doc.raw.json` are committed and
  look like scratch/artifact files; confirm they contain no sensitive request data.
- **Good news / not issues:** SQL access uses parameterized queries throughout
  (e.g. `app/repositories/postgresContentSearchRepository.js`, `app/legacy/auth.js`) — no
  SQL injection observed. The error handler (`app/middleware/errorHandler.js`) does not
  leak stack traces in production. Media path resolution in `app/legacy/media.js`
  (`absoluteStoredPath`) guards against `..` path traversal. Password/OTP hashing uses
  scrypt with per-value salt and `timingSafeEqual`. The `secrets/firebase-service-account.json`
  file is correctly git-ignored (not tracked).

---

## Suggested fix order

1. **Rotate all secrets** (`secrets-to-rotate.md`) and purge `.env` from git history — Findings 1, 2.
2. **Close the super-admin escalation** and require DB verification of roles — Finding 3.
3. **Fix media serving** so signed URLs are actually enforced — Finding 4.
4. **Lock down DB TLS, CORS, add rate limiting, gate the auth kill-switch** — Findings 5–8.
5. **Harden OTP/OAuth, add headers + startup secret validation** — Findings 9–12.
6. **Address the low-severity hardening items** — Finding 13.
</content>

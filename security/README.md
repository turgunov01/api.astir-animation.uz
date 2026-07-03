# Astir — Security Review (Read-Only Audit)

> Status: **Analysis only.** No application code was modified. This folder documents
> problems found while reading the codebase so they can be triaged and fixed later.
>
> Reviewer pass date: 2026-07-03 · Scope: `app/`, `app/legacy/`, config, repo hygiene.

## What Astir is

A Node.js **Express 5** API for a children's video-streaming / parental-control product
(Uzbekistan market). It manages parents, children, devices, pairing, watch sessions &
limits, content/series, tariffs, billing (CLICK payments), OTP email login, Google/Apple
sign-in, HLS transcoding (ffmpeg), and Firebase Cloud Messaging push. Storage is
PostgreSQL (with a JSON-store fallback). There is a "modern" API surface (`app/…`) and a
parallel **legacy** surface (`app/legacy/…`) mounted on the same server.

## Severity summary

| # | Severity | Finding | Where |
|---|----------|---------|-------|
| 1 | 🔴 CRITICAL | Live production secrets committed to git in `.env` | `.env`, `.gitignore` |
| 2 | 🔴 CRITICAL | Weak, shared, hardcoded-fallback `JWT_SECRET` | `.env:4`, `app/config.js:26`, `app/legacy/auth.js:17` |
| 3 | 🔴 CRITICAL | Super-admin privilege escalation via unverified role claim | `app/middleware/auth.js:30-43,222-226,323-330` |
| 4 | 🟠 HIGH | `/media` served as **unsigned** static, bypassing signed-URL scheme | `app/server.js:54` vs `app/legacy/media.js` |
| 5 | 🟠 HIGH | DB TLS accepts any certificate (`rejectUnauthorized:false`) | `.env:15-16`, `app/legacy/db.js:53-57` |
| 6 | 🟠 HIGH | Wide-open CORS (`*`) on an authenticated API | `app/server.js:28` |
| 7 | 🟠 HIGH | No rate limiting on login / OTP / payment endpoints | app-wide |
| 8 | 🟠 HIGH | `REQUIRE_AUTH=false` global auth kill-switch | `app/config.js:25`, `app/middleware/auth.js:210-216` |
| 9 | 🟡 MEDIUM | OTP brute-force + debug-code bypass | `app/legacy/auth.js:187-243`, `app/config.js:39-40` |
| 10 | 🟡 MEDIUM | OAuth account linking trusts client-supplied email | `app/legacy/auth.js:456-546` |
| 11 | 🟡 MEDIUM | No security headers (no `helmet`) | `app/server.js` |
| 12 | 🟡 MEDIUM | Insecure silent fallbacks; no secret validation at startup | `app/config.js` |
| 13 | ⚪ LOW | Upload filter trusts client MIME only; ffmpeg arg exposure; sync scrypt | `app/middleware/upload.js`, `app/legacy/routes.js`, `app/lib/security.js` |

## Files in this folder

- **[findings.md](findings.md)** — full detail, impact, and evidence per finding.
- **[secrets-to-rotate.md](secrets-to-rotate.md)** — every credential that was exposed and must be rotated.

## The one-line takeaway

The single most urgent issue is that `.env` — containing a **real database password on a
public IP, the super-admin password, a Gmail SMTP app password, and the CLICK payment
merchant secret** — is committed to git history. Because the JWT signing key is in that
same file (and is a weak, guessable string), anyone with repo access can mint a
`super_admin` token and take over the platform. **Rotate every secret in
[secrets-to-rotate.md](secrets-to-rotate.md) first**, then address findings 3–8.
</content>

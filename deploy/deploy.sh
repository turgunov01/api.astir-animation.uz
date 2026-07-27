#!/usr/bin/env bash
# Deploy astir backend changes (security hardening + content pagination + media
# thumbnails). Run this ON the production server, from the astir repo root.
#
# Notes:
# - The hardened config fails fast in production on a weak/default JWT_SECRET,
#   so this script rotates it if needed (this logs out all existing sessions).
# - No database migration is required for these changes.
set -euo pipefail

echo "==> [1/5] git pull"
git pull --ff-only

echo "==> [2/5] Ensure a strong JWT_SECRET (backend refuses to boot on a weak one)"
if grep -qiE '^JWT_SECRET=(astir-development-secret|astir-local-development-secret|change-this-secret|changeme|secret)$' .env \
   || ! grep -qE '^JWT_SECRET=.{32,}$' .env; then
  cp .env ".env.bak.$(date +%s)"
  NEW_SECRET="$(openssl rand -hex 32)"
  if grep -qE '^JWT_SECRET=' .env; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_SECRET}|" .env
  else
    printf '\nJWT_SECRET=%s\n' "${NEW_SECRET}" >> .env
  fi
  echo "    -> Generated a new strong JWT_SECRET (all sessions/devices are logged out)."
else
  echo "    -> JWT_SECRET already strong."
fi

echo "==> [3/5] Install backend deps (helmet, express-rate-limit added)"
npm install --omit=dev

echo "==> [4/5] Reload backend via PM2 (no DB migration needed)"
pm2 reload ecosystem.config.cjs --update-env || pm2 restart ecosystem.config.cjs --update-env

echo "==> [5/5] Verify"
curl -s http://127.0.0.1:2048/health; echo
echo "Thumbnail check: curl -sI 'https://test-api.astir-animation.uz/media-thumb/<poster-path>?w=320'"
echo "Done."

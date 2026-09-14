#!/bin/bash
# Setup script for a Claude Code cloud environment ("Add cloud environment" → Setup script).
# Runs once per environment as root on Ubuntu 24.04 and is cached for about a week. Every line is
# guarded with "|| true" so an install failure never blocks the session.
#
# What it installs and why:
#   pnpm 11.19.0     the version pinned by this repository
#   wrangler         Cloudflare Workers/Pages/DNS via the API (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
#   @railway/cli     Railway deploys (needs RAILWAY_TOKEN), binary ships through npm so no GitHub download
#
# Deliberately not installed here:
#   cloudflared / supabase CLI / flyctl download their binaries from GitHub Releases, which the cloud
#   session's GitHub proxy blocks for repositories that are not attached to the session (HTTP 403).
#   Supabase and Render are driven through their REST APIs with curl instead (api.supabase.com,
#   api.render.com), which works with an environment API credential or a token in an environment variable.
#   Cloudflare quick tunnels need a raw TCP/QUIC connection (port 7844) that the sandbox proxy does not
#   carry; run scripts/tunnel.ts on a PC for that path.
set -u
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" && nvm install 24 >/dev/null 2>&1 && nvm alias default 24 >/dev/null 2>&1 || true; fi
npm install -g pnpm@11.19.0 || true
npm install -g wrangler @railway/cli || true
# Playwright's Chromium for E2E and the UI gallery (skipped silently when the download host is not allowed).
( cd "$(dirname "$0")/.." 2>/dev/null && pnpm install --frozen-lockfile >/dev/null 2>&1 && pnpm exec playwright install chromium >/dev/null 2>&1 ) || true
echo "cloud-setup: done (pnpm $(pnpm --version 2>/dev/null || echo missing), wrangler $(wrangler --version 2>/dev/null | head -1 || echo missing), railway $(railway --version 2>/dev/null || echo missing))"

#!/bin/bash
set -e

echo "[post-merge] Installing root npm dependencies..."
npm install --no-audit --no-fund --silent

if [ -f web/package.json ]; then
  echo "[post-merge] Installing web/ npm dependencies..."
  (cd web && npm install --no-audit --no-fund --silent)
fi

if [ -n "$DATABASE_URL" ]; then
  echo "[post-merge] Syncing database schema (drizzle-kit push --force)..."
  npm run db:push -- --force
else
  echo "[post-merge] DATABASE_URL not set; skipping db:push"
fi

echo "[post-merge] Building web/ for production fallback..."
npx vite build --config web/vite.config.ts

echo "[post-merge] Done."

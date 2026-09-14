#!/bin/zsh
# Full data refresh: scrape everything, layer on the supplements (CVC online,
# C-ID, UC transferability), rebuild the organized folders, push to Supabase.
# Order matters: supplements run AFTER scrape because a scrape rewrites `meta`.
set -e
cd "$(dirname "$0")/.."

echo "=== 1/6 scrape (all colleges) ==="
npm run scrape

echo "=== 2/6 CVC online supplement ==="
npm run cvc:supplement

echo "=== 3/6 C-ID fetch + supplement ==="
npm run cid:fetch
npm run cid:supplement

echo "=== 4/6 UC transferability (ASSIST) ==="
npm run uc:supplement

echo "=== 5/6 organize ==="
npm run organize

echo "=== 6/6 push to Supabase ==="
node --env-file=web/.env.local src/migrateToSupabase.js

echo "=== refresh complete ==="

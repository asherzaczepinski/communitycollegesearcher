#!/bin/zsh
# Local data refresh — run this whenever you want FRESH course data.
#
#   1. rebuild the DB from committed sources (so ASSIST re-fetch has colleges)
#   2. re-fetch ASSIST from ASSIST.org  -> updates src/data/assist/*.json
#   3. re-export the CVC + colleges snapshots (keeps committed data in sync)
#   4. rebuild with the fresh data
#   5. push to Supabase (crash-safe staging swap)
#   6. email a summary to asherzac2020@gmail.com
#
# Needs web/.env.local to hold PGPASSWORD + RESEND_API_KEY + EMAIL_FROM.
# After it finishes, commit the refreshed data so the cloud job stays in sync:
#   git add src/data/assist src/data/*-snapshot.json.gz && git commit -m "refresh data" && git push
set -e
cd "$(dirname "$0")/.."

echo "=== 1/5 rebuild from committed sources ==="
node scripts/buildFromAssist.js

echo "=== 2/5 re-fetch ASSIST (updates src/data/assist/*.json) ==="
node --env-file=web/.env.local src/ucSupplement.js || echo "  ASSIST fetch failed — keeping committed files"

echo "=== 3/5 re-export snapshots ==="
node scripts/exportSnapshots.mjs

echo "=== 4/5 rebuild with fresh data ==="
node scripts/buildFromAssist.js

echo "=== 5/5 push to Supabase (safe swap) + email ==="
node --env-file=web/.env.local src/migrateToSupabase.js
node --env-file=web/.env.local scripts/notify.mjs "Local refresh"

echo "=== done. Commit refreshed data so the daily cloud job stays in sync: ==="
echo "    git add src/data/assist src/data/*-snapshot.json.gz && git commit -m 'refresh data' && git push"

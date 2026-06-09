// CVC backfill: give every not-yet-live college that exists on the CVC Exchange
// real (online-only) course data, instead of leaving it on sample/empty.
//
// Walks our colleges, skips ones that already have a real non-CVC source with
// courses (we don't want to overwrite a full in-person catalog with online-only
// data), and runs the normal scrape pipeline for the rest — which now falls back
// to the CVC adapter (src/scraper/adapters/cvc.js).
//
// Usage:
//   node src/cvcBackfill.js            # backfill all eligible colleges
//   node src/cvcBackfill.js --force    # also re-run colleges already on type 'cvc'
//   node src/cvcBackfill.js <slug...>  # only these slugs
import { db, getColleges } from './db.js';
import { scrapeCollege } from './scraper/index.js';
import { CVC_IDS } from './scraper/cvc.js';

// Sources whose data is our own (not CVC). A substantial result from any of
// these means the college is already covered — don't override it with CVC.
const REAL = ['html', 'auto', 'browser', 'college'];
const SUBSTANTIAL = 25; // matches the orchestrator's per-college "wins outright" bar

async function run() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = new Set(args.filter((a) => !a.startsWith('--')));

  const colleges = getColleges().filter((c) => {
    if (!CVC_IDS[c.slug]) return false;          // not on CVC
    if (only.size) return only.has(c.slug);
    // Already substantial from one of our own sources — leave it alone. Thin
    // results (< SUBSTANTIAL) are unfinished scaffolds and stay eligible so CVC
    // can supersede them.
    if (REAL.includes(c.scrape_type) && c.course_count >= SUBSTANTIAL) return false;
    if (c.scrape_type === 'cvc' && c.course_count > 0 && !force) return false; // already CVC-backfilled
    return true;
  });

  console.log(`CVC backfill — ${colleges.length} eligible college(s)\n`);
  let live = 0, empty = 0, failed = 0, total = 0;
  for (const c of colleges) {
    const r = await scrapeCollege(c, { allowSample: false }); // no sample — CVC or nothing
    if (r.ok && r.type === 'cvc' && r.count > 0) { live++; total += r.count; console.log(`  ✓ ${c.slug.padEnd(38)} ${r.count} online courses`); }
    else if (r.ok && r.count === 0) { empty++; console.log(`  · ${c.slug.padEnd(38)} no CVC courses`); }
    else { failed++; console.log(`  ✗ ${c.slug.padEnd(38)} ${r.error || r.type}`); }
  }
  console.log(`\nDone: ${live} backfilled (${total} courses), ${empty} empty on CVC, ${failed} failed.`);
}

run().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.close?.());

// CVC supplement: top up every real (non-CVC) college that's also on the CVC
// Exchange with CVC's ONLINE sections — additively, without touching the existing
// site catalog. This fills in online coverage for colleges whose own scrape is
// light on (or missing) online classes, so nothing looks artificially thin.
//
// Rows added are tagged source='cvc' and only inserted when not already present
// as an online course (matched on normalized code+title). Idempotent.
//
// Usage:
//   node src/cvcSupplement.js            # all eligible colleges
//   node src/cvcSupplement.js <slug...>  # only these
import { db, getColleges, addCourses } from './db.js';
import { fetchCvcCourses } from './scraper/cvc.js';
import { CVC_IDS } from './scraper/cvc.js';

const onlineKey = (c) =>
  `${(c.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}|${(c.title || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

async function run() {
  const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
  const colleges = getColleges().filter((c) => {
    if (!CVC_IDS[c.slug]) return false;
    if (only.size) return only.has(c.slug);
    // Skip CVC-only colleges (already all CVC) and unconfigured ones.
    return !['cvc', 'sample', 'none'].includes(c.scrape_type) && c.course_count > 0;
  });

  console.log(`CVC supplement — ${colleges.length} college(s)\n`);
  let added = 0, touched = 0;
  for (const c of colleges) {
    let cvc = [];
    try { cvc = await fetchCvcCourses(c.slug, { withDetails: true }); }
    catch (e) { console.log(`  ✗ ${c.slug.padEnd(34)} ${e.message}`); continue; }
    if (!cvc.length) { console.log(`  · ${c.slug.padEnd(34)} no CVC online courses`); continue; }

    // Idempotent refresh: drop our previously-added CVC rows so re-running picks
    // up the latest CVC data (incl. the structured `meta`) without piling up dupes.
    db.prepare(`DELETE FROM courses WHERE college_id=? AND source='cvc'`).run(c.id);

    // What online courses do we already have from the college's OWN source?
    const existing = new Set(
      db.prepare(`SELECT code, title FROM courses WHERE college_id=? AND modality='online'`)
        .all(c.id).map(onlineKey),
    );
    const fresh = [];
    const seen = new Set(existing);
    for (const course of cvc) {
      const k = onlineKey(course);
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push({ ...course, source: 'cvc' });
    }
    if (!fresh.length) { console.log(`  = ${c.slug.padEnd(34)} already covers all ${cvc.length} CVC online`); continue; }
    addCourses(c.id, fresh);
    added += fresh.length; touched++;
    console.log(`  ✓ ${c.slug.padEnd(34)} +${fresh.length} CVC online (had ${existing.size})`);
  }
  console.log(`\nDone: added ${added} CVC online courses across ${touched} colleges.`);
}

run().catch((e) => { console.error(e); process.exit(1); });

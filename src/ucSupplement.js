// Tag every course that appears on its college's UC Transfer Course Agreement
// (the official "transfers to UC for credit" list, from ASSIST.org).
//
// Run AFTER a scrape (a scrape rewrites each course's `meta`, which would drop
// these tags — same rule as cid:supplement). Adds to each matched course's meta:
//   ucTransferable  true   — UC accepts this course for transfer credit
//   csuTransferable true   — CSU flag carried on the same ASSIST record
//
//   node src/ucSupplement.js             # tag all colleges
//   node src/ucSupplement.js <slug>...   # tag specific colleges
//   node src/ucSupplement.js --year 2026 # pin the academic year (fall year)
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, getColleges, slugify } from './db.js';
import { getInstitutions, getAcademicYearId, getUcTransferableCourses, institutionName } from './assist.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, 'data', 'assist');
mkdirSync(CACHE_DIR, { recursive: true });

// Our slug -> ASSIST institution name, for the 4 whose names don't slug-match
// colleges.json exactly. (Not on ASSIST at all, expected: calbright-college,
// north-orange-continuing-education, san-diego-college-of-continuing-education.)
const ALIASES = {
  'coastline-college': 'Coastline Community College',
  'lassen-college': 'Lassen Community College',
  'los-angeles-trade-tech-college': 'Los Angeles Trade Technical College',
  'mt-san-antonio-college': 'Mount San Antonio College',
};

const norm = (code) => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Some districts carry a campus letter between the subject prefix and the number
// in their local codes (Foothill–De Anza: "ANTH D001") that ASSIST strips
// ("ANTH 1"). Drop a single interior letter right before the first digit so
// those still match. Used only as a fallback after an exact-normalized miss.
const deLetter = (code) => {
  const m = norm(code).match(/^([A-Z]+)([A-Z])(\d.*)$/);
  return m ? m[1] + m[3] : null;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const slugs = new Set(args.filter((a) => !a.startsWith('--')));
  const yi = args.indexOf('--year');
  const fallYear = yi >= 0 ? Number(args[yi + 1]) : new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0);
  return { slugs, fallYear };
}

async function run() {
  const { slugs, fallYear } = parseArgs();

  console.log(`ASSIST UC transferability — academic year starting Fall ${fallYear}`);
  const yearId = await getAcademicYearId(fallYear);
  const prevYearId = await getAcademicYearId(fallYear - 1);
  if (!yearId) { console.error(`! ASSIST has no academic year for Fall ${fallYear}.`); process.exit(1); }

  // Map ASSIST community-college institutions onto our slugs by name.
  const institutions = (await getInstitutions()).filter((i) => i.isCommunityCollege);
  const bySlug = new Map();
  for (const inst of institutions) {
    for (const n of inst.names || []) bySlug.set(slugify(n.name), inst.id);
  }
  for (const [slug, name] of Object.entries(ALIASES)) {
    const id = bySlug.get(slugify(name));
    if (id) bySlug.set(slug, id);
  }

  const colleges = getColleges().filter((c) => (!slugs.size || slugs.has(c.slug)) && c.course_count > 0);
  const unmatched = colleges.filter((c) => !bySlug.get(c.slug)).map((c) => c.slug);
  if (unmatched.length) console.log(`  (no ASSIST match for: ${unmatched.join(', ')})`);

  const selectCourses = db.prepare('SELECT id, code, meta FROM courses WHERE college_id = ?');
  const updateMeta = db.prepare('UPDATE courses SET meta = ? WHERE id = ?');

  let totalTagged = 0, totalScanned = 0, collegesWith = 0;
  for (const college of colleges) {
    const instId = bySlug.get(college.slug);
    if (!instId) continue;

    // Pull the UC TCA; fall back one academic year if the current one is empty
    // (colleges publish the new year's list on their own schedule).
    let tca = null, usedYear = fallYear;
    try {
      tca = await getUcTransferableCourses(instId, yearId);
      if ((!tca || !tca.courseInformationList.length) && prevYearId) {
        tca = await getUcTransferableCourses(instId, prevYearId);
        usedYear = fallYear - 1;
      }
    } catch (e) {
      console.log(`  ✗ ${college.slug.padEnd(34)} ${e.message}`);
      continue;
    }
    const list = tca ? tca.courseInformationList : [];
    if (!list.length) { console.log(`  · ${college.slug.padEnd(34)} no UC TCA on ASSIST`); continue; }
    writeFileSync(join(CACHE_DIR, `${college.slug}.json`), JSON.stringify(tca, null, 1));

    // normalized "PREFIX NUMBER" -> record. identifier is e.g. "PSYC 5".
    const byCode = new Map();
    for (const rec of list) {
      byCode.set(norm(rec.identifier || `${rec.prefixCode} ${rec.courseNumber}`), rec);
    }

    const rows = selectCourses.all(college.id);
    let tagged = 0, cleared = 0;
    db.prepare('BEGIN').run();
    try {
      for (const row of rows) {
        totalScanned++;
        const v = deLetter(row.code);
        const hit = byCode.get(norm(row.code)) || (v && byCode.get(v));
        let meta = {};
        if (row.meta) { try { meta = JSON.parse(row.meta); } catch { meta = {}; } }
        if (hit) {
          if (meta.ucTransferable && meta.csuTransferable === !!hit.isCsuTransferable) continue;
          meta.ucTransferable = true;
          meta.csuTransferable = !!hit.isCsuTransferable;
          updateMeta.run(JSON.stringify(meta), row.id);
          tagged++;
        } else if (meta.ucTransferable) {
          // No longer on the TCA — clear the stale tag so re-runs stay truthful.
          delete meta.ucTransferable;
          delete meta.csuTransferable;
          updateMeta.run(Object.keys(meta).length ? JSON.stringify(meta) : null, row.id);
          cleared++;
        }
      }
      db.prepare('COMMIT').run();
    } catch (err) {
      db.prepare('ROLLBACK').run();
      console.error(`  ✗ ${college.slug}: ${err.message}`);
      continue;
    }
    if (tagged || cleared) {
      collegesWith++;
      console.log(`  ✓ ${college.slug.padEnd(34)} ${tagged} UC-transferable (TCA ${usedYear}-${usedYear + 1}: ${list.length} courses${cleared ? `, cleared ${cleared}` : ''})`);
    }
    totalTagged += tagged;
    await new Promise((r) => setTimeout(r, 300)); // be polite to assist.org
  }
  console.log(`\nDone. Tagged ${totalTagged} courses UC-transferable across ${collegesWith} colleges (scanned ${totalScanned}).`);
}

run().catch((e) => { console.error(e); process.exit(1); });

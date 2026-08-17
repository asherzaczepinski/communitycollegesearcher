// Tag every course in the DB that has a statewide C-ID designation.
//
// Run AFTER a scrape (a scrape rewrites each college's rows and their `meta`,
// which would drop C-ID tags). Adds to each matched course's `meta`:
//   cId        e.g. "MATH 110"        — the common-course number
//   cIdTitle   e.g. "Introduction to Statistics"
//   cIdApproved true                  — this course is transfer/articulation-approved
//
//   node src/cidSupplement.js            # tag all colleges
//   node src/cidSupplement.js <slug>...  # tag specific colleges
import { db, getColleges } from './db.js';
import { loadCid, cIdFor } from './cid.js';

const data = loadCid();
if (!data) {
  console.error('! C-ID CSVs not found. Run `npm run cid:fetch` first.');
  process.exit(1);
}
console.log(`C-ID index: ${data.stats.courses} approved courses across ${data.stats.colleges} colleges.`);

const onlySlugs = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
const colleges = getColleges().filter((c) => !onlySlugs.size || onlySlugs.has(c.slug));

const selectCourses = db.prepare('SELECT id, code, description, meta FROM courses WHERE college_id = ?');
const updateMeta = db.prepare('UPDATE courses SET meta = ? WHERE id = ?');
const updateBoth = db.prepare('UPDATE courses SET meta = ?, description = ? WHERE id = ?');

let totalMatched = 0, totalCourses = 0, collegesWith = 0, filledDesc = 0;
for (const college of colleges) {
  const rows = selectCourses.all(college.id);
  if (!rows.length) continue;
  let matched = 0;
  db.prepare('BEGIN').run();
  try {
    for (const row of rows) {
      totalCourses++;
      const hit = cIdFor(college.slug, row.code);
      if (!hit) continue;
      let meta = {};
      if (row.meta) { try { meta = JSON.parse(row.meta); } catch { meta = {}; } }
      const alreadyTagged = meta.cId === hit.cId && meta.cIdApproved;
      // Backfill a description from the C-ID common-course descriptor when the
      // course has none of its own (mostly catalog-sourced 'site' rows).
      const needsDesc = (!row.description || !row.description.trim()) && hit.cIdDescription;
      if (alreadyTagged && !needsDesc) continue;
      meta.cId = hit.cId;
      meta.cIdTitle = hit.cIdTitle;
      meta.cIdApproved = true;
      if (needsDesc) {
        meta.descriptionSource = 'c-id';
        updateBoth.run(JSON.stringify(meta), hit.cIdDescription, row.id);
        filledDesc++;
      } else {
        updateMeta.run(JSON.stringify(meta), row.id);
      }
      if (!alreadyTagged) matched++;
    }
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    console.error(`  ✗ ${college.slug}: ${err.message}`);
    continue;
  }
  if (matched) { collegesWith++; console.log(`  ✓ ${college.slug}: ${matched} C-ID courses`); }
  totalMatched += matched;
}
console.log(`Done. Tagged ${totalMatched} courses with a C-ID across ${collegesWith} colleges (scanned ${totalCourses}).`);
console.log(`  Backfilled ${filledDesc} missing descriptions from C-ID descriptors.`);

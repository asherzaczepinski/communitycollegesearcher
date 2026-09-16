// Rebuild every college's catalog from ASSIST — the official statewide
// transferable-course database — replacing the unreliable per-site scrapes that
// grabbed wrong pages (Wikipedia, "new courses", term schedules, PDF viewers).
//
// Trust model after this runs, every course row comes from one of two sources:
//   • 'cvc'    — search.cvc.edu (online courses, each with a real class-page URL)
//   • 'assist' — ASSIST courseInformationList (authoritative transferable catalog)
// All broken scrape sources (site/auto/browser/colleague) are deleted.
//
// URL strategy: a course links to its CVC class page when that course also
// exists online in CVC (a real, specific class page). Otherwise there is no
// per-course page, so we point at a Google search for the college + course
// ("Santa Monica College RUSS 1 Elementary Russian I") — clicking lands the user
// on that course's own catalog/schedule page. Never assist.org.
//
// Idempotent: safe to re-run. Operates on the LOCAL sqlite DB; push to Supabase
// with `node src/migrateToSupabase.js` afterwards.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSIST_DIR = path.join(ROOT, 'src/data/assist');
const DB_PATH = process.env.CCS_DB || path.join(ROOT, 'src/data/courses.db');
const NOW = new Date().toISOString();

const db = new DatabaseSync(DB_PATH);

const colleges = db.prepare('SELECT id, slug, name, url FROM colleges').all();
const bySlug = new Map(colleges.map((c) => [c.slug, c]));

// Normalize a course code for matching ASSIST against CVC. Beyond spaces/case,
// strip leading zeros inside each number group so ASSIST's zero-padded numbers
// ("RUSSIAN 002") match CVC's ("RUSSIAN2") and don't show as duplicates.
const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/\d+/g, (n) => String(parseInt(n, 10)));

// CVC courses already carry a real class-page URL — index them so ASSIST rows
// can (a) reuse that URL and (b) skip re-adding a course CVC already covers.
const cvcMap = new Map();
for (const r of db.prepare("SELECT c.slug, co.code FROM courses co JOIN colleges c ON c.id = co.college_id WHERE co.source = 'cvc'").all()) {
  cvcMap.set(`${r.slug}|${norm(r.code)}`, true);
}

const unitsStr = (min, max) => {
  if (min == null && max == null) return null;
  if (max == null || min === max) return `${min}`;
  return `${min}-${max}`;
};

// ASSIST records what courses exist and transfer, but NOT how they're taught.
// So modality is 'unknown' (not a fabricated 'in_person'); the UI shows these as
// "modality varies — check schedule". Only CVC courses are verified online.
const insert = db.prepare(`
  INSERT INTO courses (college_id, code, title, modality, term, units, instructor, section, description, url, source, meta, updated_at)
  VALUES (?, ?, ?, 'unknown', NULL, ?, NULL, NULL, NULL, ?, 'assist', ?, ?)
  ON CONFLICT(college_id, code, title, modality, term, section) DO UPDATE SET
    units = excluded.units, url = excluded.url, source = excluded.source,
    meta = excluded.meta, updated_at = excluded.updated_at
`);
const delGarbageForCollege = db.prepare("DELETE FROM courses WHERE college_id = ? AND source NOT IN ('cvc')");
const markCollege = db.prepare("UPDATE colleges SET scrape_type = 'assist', last_scraped = ?, last_status = 'ok' WHERE id = ?");

const files = fs.readdirSync(ASSIST_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
let addedAssist = 0, collegesDone = 0;
const missingCollege = [];

db.exec('BEGIN');
for (const f of files) {
  const slug = f.replace(/\.json$/, '');
  const col = bySlug.get(slug);
  if (!col) { missingCollege.push(slug); continue; }

  const data = JSON.parse(fs.readFileSync(path.join(ASSIST_DIR, f), 'utf8'));
  const list = Array.isArray(data.courseInformationList) ? data.courseInformationList : [];

  delGarbageForCollege.run(col.id); // wipe broken scrapes + any prior assist rows; keep cvc
  const seen = new Set();
  for (const c of list) {
    const code = `${(c.prefixCode || '').trim()} ${(c.courseNumber || '').trim()}`.trim();
    const nc = norm(code);
    if (!nc || seen.has(nc)) continue;
    seen.add(nc);
    if (cvcMap.has(`${slug}|${nc}`)) continue; // CVC already lists it (with a class-page URL)
    const title = (c.courseTitle || '').trim();
    if (title.replace(/[^A-Za-z]/g, '').length < 2) continue; // real title only

    const meta = { ucTransferable: true };
    if (c.isCsuTransferable) meta.csuTransferable = true;
    if (Array.isArray(c.transferAreas) && c.transferAreas.length) meta.transferAreas = c.transferAreas;

    // No specific course page → a Google search for "<college> <code> <title>".
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${col.name} ${code} ${title}`)}`;
    insert.run(col.id, code, title, unitsStr(c.minUnits, c.maxUnits), searchUrl, JSON.stringify(meta), NOW);
    addedAssist++;
  }
  markCollege.run(NOW, col.id);
  collegesDone++;
}
// Global sweep: nuke any garbage left on colleges that had no ASSIST file.
const swept = db.prepare("DELETE FROM courses WHERE source NOT IN ('cvc','assist')").run().changes;
db.exec('COMMIT');

console.log(JSON.stringify({ addedAssist, collegesDone, sweptGarbage: swept, missingCollege }, null, 2));

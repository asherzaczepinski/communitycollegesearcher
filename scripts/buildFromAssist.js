// Rebuild the ENTIRE course dataset from committed source files — no live
// scraping, fully reproducible in CI. Sources:
//   • src/data/colleges-snapshot.json.gz — colleges (ids + geocoded lat/lng)
//   • src/data/cvc-snapshot.json.gz       — CVC online courses (real class URLs)
//   • src/data/assist/*.json              — ASSIST transferable catalog per college
//
// This replaces the old per-site scrapes that grabbed wrong pages (Wikipedia,
// "new courses", schedules, PDF viewers). Every row ends up from a trusted
// source ('cvc' or 'assist'), with a real title and a clickable URL.
//
// URL strategy: CVC courses keep their exact search.cvc.edu class page. ASSIST
// courses have no per-course page, so they link to a Google search for
// "<college> <code> <title>" (lands on that course's own catalog/schedule page).
//
// Modality: CVC = 'online' (verified). ASSIST records no modality, so those are
// 'unknown' ("modality varies") — never a fabricated 'in person'.
//
// Idempotent + deterministic: DROPs and rebuilds every time. Operates on the
// LOCAL sqlite DB; push to Supabase with `node src/migrateToSupabase.js`.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'src/data');
const ASSIST_DIR = path.join(DATA, 'assist');
const DB_PATH = process.env.CCS_DB || path.join(DATA, 'courses.db');
const NOW = new Date().toISOString();

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS colleges (
    id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL,
    scrape_type TEXT NOT NULL DEFAULT 'none', scrape_config TEXT, last_scraped TEXT, last_status TEXT,
    lat REAL, lng REAL
  );
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY,
    college_id INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    code TEXT, title TEXT NOT NULL, modality TEXT NOT NULL, term TEXT, units TEXT,
    instructor TEXT, section TEXT, description TEXT, url TEXT, source TEXT, meta TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(college_id, code, title, modality, term, section)
  );
  CREATE INDEX IF NOT EXISTS idx_courses_college ON courses(college_id);
  CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);
`);

const readGz = (f) => JSON.parse(gunzipSync(fs.readFileSync(path.join(DATA, f))).toString('utf8'));
const collegesSnap = readGz('colleges-snapshot.json.gz');
const cvcSnap = readGz('cvc-snapshot.json.gz');

// Match ASSIST ("RUSSIAN 002") against CVC ("RUSSIAN2"): drop spaces, upcase,
// strip leading zeros in number groups so zero-padding differences collapse.
const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').replace(/\d+/g, (n) => String(parseInt(n, 10)));
const unitsStr = (min, max) => (min == null && max == null ? null : (max == null || min === max ? `${min}` : `${min}-${max}`));

const insCollege = db.prepare(`INSERT INTO colleges (id, slug, name, url, scrape_type, last_scraped, last_status, lat, lng)
  VALUES (@id, @slug, @name, @url, @scrape_type, @last_scraped, @last_status, @lat, @lng)`);
const insCourse = db.prepare(`INSERT INTO courses (college_id, code, title, modality, term, units, instructor, section, description, url, source, meta, updated_at)
  VALUES (@college_id, @code, @title, @modality, @term, @units, @instructor, @section, @description, @url, @source, @meta, @updated_at)
  ON CONFLICT(college_id, code, title, modality, term, section) DO NOTHING`);

db.exec('BEGIN');
db.exec('DELETE FROM courses');
db.exec('DELETE FROM colleges');

// 1) Colleges (preserve ids + geocoding).
for (const c of collegesSnap) {
  insCollege.run({ id: c.id, slug: c.slug, name: c.name, url: c.url || '',
    scrape_type: c.scrape_type || 'none', last_scraped: c.last_scraped || null,
    last_status: c.last_status || null, lat: c.lat ?? null, lng: c.lng ?? null });
}
const bySlug = new Map(collegesSnap.map((c) => [c.slug, c]));
const idToSlug = new Map(collegesSnap.map((c) => [c.id, c.slug]));

// 2) CVC courses (verified online, real class URLs) + index them for dedup.
const cvcKeys = new Set();
for (const r of cvcSnap) {
  insCourse.run({ college_id: r.college_id, code: r.code, title: r.title, modality: r.modality || 'online',
    term: r.term || null, units: r.units || null, instructor: r.instructor || null, section: r.section || null,
    description: r.description || null, url: r.url || null, source: 'cvc', meta: r.meta || null, updated_at: r.updated_at || NOW });
  const slug = idToSlug.get(r.college_id);
  if (slug) cvcKeys.add(`${slug}|${norm(r.code)}`);
}

// 3) ASSIST courses (transferable catalog), skipping any CVC already covers.
let addedAssist = 0, collegesDone = 0;
const missingCollege = [];
const files = fs.readdirSync(ASSIST_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
for (const f of files) {
  const slug = f.replace(/\.json$/, '');
  const col = bySlug.get(slug);
  if (!col) { missingCollege.push(slug); continue; }
  const data = JSON.parse(fs.readFileSync(path.join(ASSIST_DIR, f), 'utf8'));
  const list = Array.isArray(data && data.courseInformationList) ? data.courseInformationList : [];
  const seen = new Set();
  for (const c of list) {
    const code = `${(c.prefixCode || '').trim()} ${(c.courseNumber || '').trim()}`.trim();
    const nc = norm(code);
    if (!nc || seen.has(nc)) continue;
    seen.add(nc);
    if (cvcKeys.has(`${slug}|${nc}`)) continue;
    const title = (c.courseTitle || '').trim();
    if (title.replace(/[^A-Za-z]/g, '').length < 2) continue;
    const meta = { ucTransferable: true };
    if (c.isCsuTransferable) meta.csuTransferable = true;
    if (Array.isArray(c.transferAreas) && c.transferAreas.length) meta.transferAreas = c.transferAreas;
    const url = `https://www.google.com/search?q=${encodeURIComponent(`${col.name} ${code} ${title}`)}`;
    insCourse.run({ college_id: col.id, code, title, modality: 'unknown', term: null,
      units: unitsStr(c.minUnits, c.maxUnits), instructor: null, section: null, description: null,
      url, source: 'assist', meta: JSON.stringify(meta), updated_at: NOW });
    addedAssist++;
  }
  collegesDone++;
}

// Stamp today's date on every college that has courses (the "last updated" badge).
db.exec(`UPDATE colleges SET last_scraped = '${NOW}', last_status = 'ok'
         WHERE id IN (SELECT DISTINCT college_id FROM courses)`);
db.exec('COMMIT');

const total = db.prepare('SELECT COUNT(*) n FROM courses').get().n;
console.log(JSON.stringify({ colleges: collegesSnap.length, cvc: cvcSnap.length, addedAssist, collegesDone, total, missingCollege }, null, 2));

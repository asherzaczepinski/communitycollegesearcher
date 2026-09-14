// Local SQLite database layer.
// Uses Node's built-in node:sqlite (Node >=22.5) so there are no native deps to compile.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = process.env.CCS_DB || join(DATA_DIR, 'courses.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS colleges (
    id            INTEGER PRIMARY KEY,
    slug          TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    url           TEXT NOT NULL,
    -- How to pull courses for this college. 'sample' = seeded demo data,
    -- 'html' = generic HTML scrape driven by scrape_config, 'none' = not configured yet.
    scrape_type   TEXT NOT NULL DEFAULT 'none',
    -- JSON blob the scraper "remembers" about how to extract courses from this site
    -- (catalog/schedule URL, CSS selectors, platform hints, etc.).
    scrape_config TEXT,
    last_scraped  TEXT,
    last_status   TEXT
  );

  CREATE TABLE IF NOT EXISTS courses (
    id          INTEGER PRIMARY KEY,
    college_id  INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    code        TEXT,                 -- e.g. "CIS 101"
    title       TEXT NOT NULL,        -- e.g. "Introduction to Computer Science"
    modality    TEXT NOT NULL,        -- 'in_person' | 'online' | 'hybrid'
    term        TEXT,                 -- e.g. "Fall 2026"
    units       TEXT,
    instructor  TEXT,
    section     TEXT,
    description TEXT,
    url         TEXT,
    updated_at  TEXT NOT NULL,
    UNIQUE(college_id, code, title, modality, term, section)
  );

  CREATE INDEX IF NOT EXISTS idx_courses_college  ON courses(college_id);
  CREATE INDEX IF NOT EXISTS idx_courses_modality ON courses(modality);
  CREATE INDEX IF NOT EXISTS idx_courses_title    ON courses(title);
  CREATE INDEX IF NOT EXISTS idx_courses_code     ON courses(code);
`);

// Migration: per-course provenance — where this row came from ('site', 'cvc',
// 'colleague', …). Lets the UI show "X from the college site, Y from CVC".
// Added after the fact, so guard against re-adding on an already-migrated DB.
if (!db.prepare(`PRAGMA table_info(courses)`).all().some((c) => c.name === 'source')) {
  db.exec(`ALTER TABLE courses ADD COLUMN source TEXT`);
}

// Migration: structured per-course metadata as a JSON string — transferability
// (IGETC/Cal-GETC/CSU BREADTH), tuition, Zero-Textbook-Cost / Quality-Reviewed
// badges, dates, CVC ids, etc. Held as JSON so new fields don't need a migration.
if (!db.prepare(`PRAGMA table_info(courses)`).all().some((c) => c.name === 'meta')) {
  db.exec(`ALTER TABLE courses ADD COLUMN meta TEXT`);
}

export function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents (Cañada -> canada)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// --- Colleges -------------------------------------------------------------

const upsertCollegeStmt = db.prepare(`
  INSERT INTO colleges (slug, name, url)
  VALUES (?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET name = excluded.name, url = excluded.url
`);

export function upsertCollege({ name, url }) {
  upsertCollegeStmt.run(slugify(name), name, url);
}

// A college is "live" when it has a real scrape source AND actually has rows.
// 'sample'/'none' are placeholder/unconfigured and never count as live.
const LIVE_SQL = `c.scrape_type NOT IN ('sample', 'none')
                  AND (SELECT COUNT(*) FROM courses WHERE college_id = c.id) > 0`;

export function getColleges() {
  const cc = (where) => `(SELECT COUNT(*) FROM courses WHERE college_id = c.id AND (${where}))`;
  return db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM courses WHERE college_id = c.id) AS course_count,
           ${cc("modality = 'online'")}    AS online_count,
           ${cc("modality = 'hybrid'")}    AS hybrid_count,
           ${cc("modality = 'in_person'")} AS in_person_count,
           ${cc("source = 'cvc'")}         AS cvc_count,
           ${cc("source IS NULL OR source <> 'cvc'")} AS site_count,
           (CASE WHEN ${LIVE_SQL} THEN 1 ELSE 0 END) AS live
    FROM colleges c
    ORDER BY c.name
  `).all();
}

export function getCollegeBySlug(slug) {
  return db.prepare('SELECT * FROM colleges WHERE slug = ?').get(slug);
}

export function setScrapeConfig(slug, scrapeType, config) {
  db.prepare('UPDATE colleges SET scrape_type = ?, scrape_config = ? WHERE slug = ?')
    .run(scrapeType, config ? JSON.stringify(config) : null, slug);
}

export function markScraped(collegeId, status) {
  db.prepare('UPDATE colleges SET last_scraped = ?, last_status = ? WHERE id = ?')
    .run(new Date().toISOString(), status, collegeId);
}

// --- Courses --------------------------------------------------------------

// Some sources (Banner's JSON API especially) return text HTML-encoded, e.g.
// "Business Organization &amp; Mgmt". Decode entities once, centrally, so no
// adapter can leak them into the DB. `&amp;` is decoded last so a literal
// "&amp;#39;" can't double-decode.
const NAMED_ENTITIES = {
  lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
};
export function decodeEntities(s) {
  if (s == null) return s;
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED_ENTITIES[n] ?? NAMED_ENTITIES[n.toLowerCase()] ?? m)
    .replace(/&amp;/gi, '&');
}

const insertCourseStmt = db.prepare(`
  INSERT INTO courses (college_id, code, title, modality, term, units, instructor, section, description, url, source, meta, updated_at)
  VALUES (@college_id, @code, @title, @modality, @term, @units, @instructor, @section, @description, @url, @source, @meta, @updated_at)
  ON CONFLICT(college_id, code, title, modality, term, section) DO UPDATE SET
    units = excluded.units,
    instructor = excluded.instructor,
    description = excluded.description,
    url = excluded.url,
    source = excluded.source,
    meta = excluded.meta,
    updated_at = excluded.updated_at
`);

// Some catalogs jam registration notes into the course title ("Academic Reading
// and Writing-NOTE: Some sections require…"). Pull the note out into meta.note
// so the UI can show it on its own line. Titles that are ONLY a note (linked-
// section stubs with no real title in front) are left alone.
export function splitTitleNote(title, meta) {
  const m = title && title.match(/^(.*?)[\s.–—-]*\bNOTE\s*:\s*(.+)$/i);
  if (!m) return { title, meta };
  const clean = m[1].trim();
  if (!/[A-Za-z]{2}/.test(clean)) return { title, meta };
  return { title: clean, meta: { ...(meta || {}), note: m[2].trim() } };
}

// Normalize one course object into the insert statement's bind params.
function courseRow(college_id, c, now) {
  const { title, meta } = splitTitleNote(decodeEntities(c.title), c.meta);
  return {
    college_id,
    code: decodeEntities(c.code) || null,
    title,
    modality: c.modality,
    term: c.term || null,
    units: c.units || null,
    instructor: decodeEntities(c.instructor) || null,
    section: c.section || null,
    description: decodeEntities(c.description) || null,
    url: c.url || null,
    source: c.source || null,
    meta: meta && Object.keys(meta).length ? JSON.stringify(meta) : null,
    updated_at: now,
  };
}

// Replace all courses for a college in a single transaction (idempotent re-scrape).
export function replaceCourses(collegeId, courses) {
  const tx = db.prepare('DELETE FROM courses WHERE college_id = ?');
  const run = db.prepare('BEGIN');
  run.run();
  try {
    tx.run(collegeId);
    const now = new Date().toISOString();
    for (const c of courses) insertCourseStmt.run(courseRow(collegeId, c, now));
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
  return courses.length;
}

// Additively insert courses for a college WITHOUT clearing existing rows. Used
// to supplement a real catalog with extra sections (e.g. CVC online listings).
// Duplicates collapse via the ON CONFLICT in insertCourseStmt. Returns inserted
// count attempted.
export function addCourses(collegeId, courses) {
  const now = new Date().toISOString();
  db.prepare('BEGIN').run();
  try {
    for (const c of courses) insertCourseStmt.run(courseRow(collegeId, c, now));
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
  return courses.length;
}

// --- Search ---------------------------------------------------------------

export function searchCourses({ q = '', modality = null, collegeSlug = null, limit = 500, transfer = null, ztc = false, quality = false }) {
  // Only ever surface REAL scraped data. Sample/placeholder rows are never searchable.
  const where = ["colleges.scrape_type NOT IN ('sample', 'none')"];
  const params = {};

  if (q && q.trim()) {
    where.push('(courses.title LIKE @q OR courses.code LIKE @q OR courses.description LIKE @q)');
    params.q = `%${q.trim()}%`;
  }
  if (modality && modality !== 'all') {
    where.push('courses.modality = @modality');
    params.modality = modality;
  }
  // Transferability + badge filters read the structured `meta` JSON.
  const TRANSFER_KEY = { igetc: 'igetc', 'cal-getc': 'calGetc', calgetc: 'calGetc', csu: 'csuBreadth', uc: 'ucTransferable' };
  const tk = transfer && TRANSFER_KEY[String(transfer).toLowerCase()];
  if (tk) where.push(`json_extract(courses.meta, '$.${tk}') = 1`);
  if (ztc) where.push(`json_extract(courses.meta, '$.zeroTextbookCost') = 1`);
  if (quality) where.push(`json_extract(courses.meta, '$.qualityReviewed') = 1`);
  if (collegeSlug && collegeSlug !== 'all') {
    where.push('colleges.slug = @slug');
    params.slug = collegeSlug;
  }

  params.limit = limit;
  const sql = `
    SELECT courses.*, colleges.name AS college_name, colleges.slug AS college_slug,
           colleges.url AS college_url,
           COALESCE(courses.source, colleges.scrape_type) AS source
    FROM courses
    JOIN colleges ON colleges.id = courses.college_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY colleges.name, courses.code, courses.title
    LIMIT @limit
  `;
  // Parse the JSON `meta` blob into an object so the frontend gets structured
  // transferability / tuition / badge fields directly.
  return db.prepare(sql).all(params).map((row) => {
    let meta = null;
    if (row.meta) { try { meta = JSON.parse(row.meta); } catch { /* leave null */ } }
    return { ...row, meta };
  });
}

export function stats() {
  // Course/modality numbers count REAL data only — sample rows don't exist for users.
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM colleges) AS colleges,
      (SELECT COUNT(*) FROM colleges c WHERE ${LIVE_SQL}) AS liveColleges,
      (SELECT COUNT(*) FROM courses cr
         JOIN colleges c ON c.id = cr.college_id
         WHERE c.scrape_type NOT IN ('sample','none')) AS courses
  `).get();
  const byModality = db.prepare(`
    SELECT modality, COUNT(*) AS n
    FROM courses cr JOIN colleges c ON c.id = cr.college_id
    WHERE c.scrape_type NOT IN ('sample','none')
    GROUP BY modality
  `).all();
  return { ...totals, byModality };
}

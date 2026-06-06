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
  return db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM courses WHERE college_id = c.id) AS course_count,
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

const insertCourseStmt = db.prepare(`
  INSERT INTO courses (college_id, code, title, modality, term, units, instructor, section, description, url, updated_at)
  VALUES (@college_id, @code, @title, @modality, @term, @units, @instructor, @section, @description, @url, @updated_at)
  ON CONFLICT(college_id, code, title, modality, term, section) DO UPDATE SET
    units = excluded.units,
    instructor = excluded.instructor,
    description = excluded.description,
    url = excluded.url,
    updated_at = excluded.updated_at
`);

// Replace all courses for a college in a single transaction (idempotent re-scrape).
export function replaceCourses(collegeId, courses) {
  const tx = db.prepare('DELETE FROM courses WHERE college_id = ?');
  const run = db.prepare('BEGIN');
  run.run();
  try {
    tx.run(collegeId);
    const now = new Date().toISOString();
    for (const c of courses) {
      insertCourseStmt.run({
        college_id: collegeId,
        code: c.code || null,
        title: c.title,
        modality: c.modality,
        term: c.term || null,
        units: c.units || null,
        instructor: c.instructor || null,
        section: c.section || null,
        description: c.description || null,
        url: c.url || null,
        updated_at: now,
      });
    }
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
  return courses.length;
}

// --- Search ---------------------------------------------------------------

export function searchCourses({ q = '', modality = null, collegeSlug = null, limit = 500 }) {
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
  if (collegeSlug && collegeSlug !== 'all') {
    where.push('colleges.slug = @slug');
    params.slug = collegeSlug;
  }

  params.limit = limit;
  const sql = `
    SELECT courses.*, colleges.name AS college_name, colleges.slug AS college_slug,
           colleges.url AS college_url, colleges.scrape_type AS source
    FROM courses
    JOIN colleges ON colleges.id = courses.college_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY colleges.name, courses.code, courses.title
    LIMIT @limit
  `;
  return db.prepare(sql).all(params);
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

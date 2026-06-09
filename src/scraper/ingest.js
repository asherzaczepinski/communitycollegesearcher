// Shared course-ingest: push extracted courses into the searchable SQLite DB and
// flip the college live. Kept in its own module so both the standard runner
// (autoscrape.js) and the smart solver (solve.js) use the exact same path without
// importing each other.
import { replaceCourses, setScrapeConfig, markScraped } from '../db.js';

export function ingestCourses(college, courses, { method = 'auto', recipe = null, tag = 'auto-learned' } = {}) {
  if (!courses || !courses.length) return 0;
  const type = method === 'browser' ? 'browser' : 'auto';
  const n = replaceCourses(college.id, courses);
  setScrapeConfig(college.slug, type, recipe);
  markScraped(college.id, `ok: ${n} courses via ${type} (${tag})`);
  return n;
}

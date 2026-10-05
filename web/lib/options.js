// Filter options for the searcher: colleges with displayable courses (with
// counts), the GE areas present per system, and the "data last updated" stamp.
// Read from the course_search view, so the dropdown counts always match results.
//
// The data only changes on the daily refresh, so the payload is memoized on the
// global object for an hour (the promise is cached so concurrent cold requests
// share one query). Used by /api/options and the server-rendered page.
import { query } from './db';
import { SUBJECTS } from './subjects';

const TTL_MS = 60 * 60 * 1000;
const g = globalThis;

async function compute() {
  const areas = (key) => query(
    `SELECT DISTINCT a AS area FROM course_search, jsonb_array_elements_text(ge_areas->'${key}') a ORDER BY a`,
  ).then((r) => r.rows.map((x) => x.area));

  const [colleges, csu, igetc, calGetc] = await Promise.all([
    query(
      `SELECT college_slug AS slug, college AS name, max(last_scraped) AS last_scraped, count(*)::int AS course_count
       FROM course_search GROUP BY college_slug, college ORDER BY college`,
    ).then((r) => r.rows),
    areas('csu'), areas('igetc'), areas('calGetc'),
  ]);

  const lastUpdated = colleges.reduce(
    (max, c) => (c.last_scraped && c.last_scraped > max ? c.last_scraped : max), '');

  return {
    colleges,
    lastUpdated,
    totalCourses: colleges.reduce((n, c) => n + c.course_count, 0),
    subjects: SUBJECTS.map((s) => s.label),
    geAreas: { csu, igetc, calGetc },
  };
}

export function getOptions() {
  const cached = g.__cccOptions;
  if (!cached || Date.now() - cached.ts >= TTL_MS) {
    const p = compute().catch((e) => { g.__cccOptions = null; throw e; });
    g.__cccOptions = { ts: Date.now(), data: p };
  }
  return g.__cccOptions.data;
}

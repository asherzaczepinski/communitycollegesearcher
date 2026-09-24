// Filter options for the searcher: the list of colleges with data, and the GE /
// A–G areas that actually appear in the dataset (grouped by system).
import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { SUBJECTS } from '../../../lib/subjects';
import { CONFIDENT_COURSE_SQL, VALID_COURSE_SQL } from '../../../lib/confident';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // runs per-request (no DB call at build time)

// The filter lists (colleges, GE areas, "last updated") only change when the daily
// refresh runs, so re-scanning the whole table on every page load is wasted work.
// We memoize the computed payload on the global object for an hour: the first
// request after a cold start (or after the TTL) pays for the scan; everyone else
// gets it instantly. The Cache-Control header additionally lets Vercel's edge
// serve it without even hitting the function.
const TTL_MS = 60 * 60 * 1000;
const g = globalThis;

async function compute() {
  // Only colleges that actually have confident, displayable courses — and the
  // count shown is the count of THOSE courses, so the dropdown never promises a
  // catalog the results can't deliver. Same gates as /api/search.
  const colleges = await query(
    `SELECT c.slug, c.name, c.last_scraped, COUNT(*)::int AS course_count
     FROM courses co JOIN colleges c ON c.id = co.college_id
     WHERE c.scrape_type NOT IN ('sample','none')
       AND ${VALID_COURSE_SQL} AND ${CONFIDENT_COURSE_SQL}
     GROUP BY c.id, c.slug, c.name, c.last_scraped
     ORDER BY c.name`,
  );
  // Newest scrape timestamp across the shown colleges → "data last updated" badge.
  const lastUpdated = colleges.rows.reduce(
    (max, c) => (c.last_scraped && c.last_scraped > max ? c.last_scraped : max), '');

  // Distinct GE areas present, per system.
  const areaQuery = (key) => query(
    `SELECT DISTINCT a AS area
     FROM courses, jsonb_array_elements_text(meta->'geAreas'->'${key}') AS a
     WHERE meta->'geAreas' IS NOT NULL
     ORDER BY a`,
  );
  const [csu, igetc, calGetc] = await Promise.all([areaQuery('csu'), areaQuery('igetc'), areaQuery('calGetc')]);

  return {
    colleges: colleges.rows,
    lastUpdated,
    subjects: SUBJECTS.map((s) => s.label),
    geAreas: {
      csu: csu.rows.map((r) => r.area),
      igetc: igetc.rows.map((r) => r.area),
      calGetc: calGetc.rows.map((r) => r.area),
    },
  };
}

export async function GET() {
  const cached = g.__cccOptions;
  if (!cached || Date.now() - cached.ts >= TTL_MS) {
    // Cache the promise (not just the value) so concurrent cold requests share one
    // scan instead of all stampeding the DB. On failure, drop it so we retry.
    const p = compute().catch((e) => { g.__cccOptions = null; throw e; });
    g.__cccOptions = { ts: Date.now(), data: p };
  }

  const data = await g.__cccOptions.data;
  return NextResponse.json(data, {
    // Edge-cache for an hour, and keep serving the last good copy for a day while
    // a fresh one is fetched in the background — so a page load never blocks on this.
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}

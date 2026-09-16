// Filter options for the searcher: the list of colleges with data, and the GE /
// A–G areas that actually appear in the dataset (grouped by system).
import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { SUBJECTS } from '../../../lib/subjects';
import { CONFIDENT_COURSE_SQL, VALID_COURSE_SQL } from '../../../lib/confident';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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

  return NextResponse.json({
    colleges: colleges.rows,
    lastUpdated,
    subjects: SUBJECTS.map((s) => s.label),
    geAreas: {
      csu: csu.rows.map((r) => r.area),
      igetc: igetc.rows.map((r) => r.area),
      calGetc: calGetc.rows.map((r) => r.area),
    },
  });
}

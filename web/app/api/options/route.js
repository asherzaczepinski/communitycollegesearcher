// Filter options for the searcher: the list of colleges with data, and the GE /
// A–G areas that actually appear in the dataset (grouped by system).
import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';
import { SUBJECTS } from '../../../lib/subjects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const colleges = await query(
    `SELECT slug, name, course_count
     FROM colleges
     WHERE scrape_type NOT IN ('sample','none') AND course_count > 0
     ORDER BY name`,
  );

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
    subjects: SUBJECTS.map((s) => s.label),
    geAreas: {
      csu: csu.rows.map((r) => r.area),
      igetc: igetc.rows.map((r) => r.area),
      calGetc: calGetc.rows.map((r) => r.area),
    },
  });
}

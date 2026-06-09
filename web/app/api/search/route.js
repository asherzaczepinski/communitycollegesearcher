// Course search API. Supports every filter the data carries — keyword, college,
// modality, transferability, specific GE/A–G area, Zero-Textbook-Cost, Quality
// Reviewed, online format (sync/async), units range — plus sorting + paging.
//
// Provenance is intentionally stripped: callers never learn where a row came
// from (no `source`, no CVC ids/urls). The frontend is just a clean searcher.
import { NextResponse } from 'next/server';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const where = ["c.scrape_type NOT IN ('sample','none')"];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  const q = (sp.get('q') || '').trim();
  if (q) {
    const like = p(`%${q}%`);
    where.push(`(co.title ILIKE ${like} OR co.code ILIKE ${like} OR co.description ILIKE ${like})`);
  }
  const college = sp.get('college');
  if (college && college !== 'all') where.push(`c.slug = ${p(college)}`);

  const modality = sp.get('modality');
  if (modality && modality !== 'all') where.push(`co.modality = ${p(modality)}`);

  // Top-level transferability (boolean flags inside meta).
  const TRANSFER = { igetc: 'igetc', calgetc: 'calGetc', 'cal-getc': 'calGetc', csu: 'csuBreadth' };
  const tk = TRANSFER[(sp.get('transfer') || '').toLowerCase()];
  if (tk) where.push(`(co.meta->>'${tk}')::boolean IS TRUE`);

  // Specific GE / A–G areas: one or more "system|label" params, e.g.
  // "igetc|5B Biological Science". Multiple checked areas are OR'd together.
  const SYSKEY = { csu: 'csu', igetc: 'igetc', calgetc: 'calGetc' };
  const areaOrs = [];
  for (const area of sp.getAll('area')) {
    if (!area.includes('|')) continue;
    const sys = area.slice(0, area.indexOf('|'));
    const label = area.slice(area.indexOf('|') + 1);
    const key = SYSKEY[sys.toLowerCase()];
    if (key) areaOrs.push(`co.meta->'geAreas'->'${key}' @> ${p(JSON.stringify([label]))}::jsonb`);
  }
  if (areaOrs.length) where.push(`(${areaOrs.join(' OR ')})`);

  if (sp.get('ztc') === '1') where.push(`(co.meta->>'zeroTextbookCost')::boolean IS TRUE`);
  if (sp.get('quality') === '1') where.push(`(co.meta->>'qualityReviewed')::boolean IS TRUE`);

  const format = sp.get('format'); // Asynchronous / Synchronous
  if (format) where.push(`co.meta->'formats' @> ${p(JSON.stringify([format]))}::jsonb`);

  // Units range — units is text ("4.0", "3-4"); cast the leading number. Note:
  // a capturing group in substring(... from ...) returns the GROUP, so keep the
  // pattern group-free to get the whole leading number.
  const unitExpr = `NULLIF(substring(co.units from '^[0-9]+\\.?[0-9]*'), '')::numeric`;
  const umin = sp.get('unitsMin'); if (umin) where.push(`${unitExpr} >= ${p(Number(umin))}`);
  const umax = sp.get('unitsMax'); if (umax) where.push(`${unitExpr} <= ${p(Number(umax))}`);

  // User location → distance (miles) to each college via haversine. Lets in-person
  // results be sorted nearest-first and show a distance.
  const whereSql = where.join(' AND ');
  // Run the count first, with only the filter params — before the distance/limit
  // params get appended below (otherwise the count gets too many bind params).
  const countParams = [...params];
  const countRes = await query(`SELECT COUNT(*)::int n FROM courses co JOIN colleges c ON c.id = co.college_id WHERE ${whereSql}`, countParams);

  // User location → distance (miles) via haversine. Appends params after filters.
  const ulat = parseFloat(sp.get('lat'));
  const ulng = parseFloat(sp.get('lng'));
  const hasLoc = Number.isFinite(ulat) && Number.isFinite(ulng);
  // NOTE: LEAST(1, NULL) returns 1 in Postgres (NULLs ignored), which would turn a
  // college with no coordinates into distance 0. Guard with an explicit null check.
  const distExpr = hasLoc
    ? `(CASE WHEN c.lat IS NULL OR c.lng IS NULL THEN NULL ELSE
         3959 * acos(LEAST(1, cos(radians(${p(ulat)})) * cos(radians(c.lat)) * cos(radians(c.lng) - radians(${p(ulng)})) + sin(radians(${p(ulat)})) * sin(radians(c.lat)))) END)`
    : 'NULL';

  const SORTS = {
    relevance: 'c.name, co.code, co.title',
    title: 'co.title, c.name',
    college: 'c.name, co.code',
    units: `${unitExpr} DESC NULLS LAST, c.name`,
    tuition: `(co.meta->>'tuition')::numeric ASC NULLS LAST, c.name`,
    nearest: hasLoc ? `${distExpr} ASC NULLS LAST, c.name` : 'c.name',
  };
  const orderBy = SORTS[sp.get('sort')] || SORTS.relevance;

  const limit = Math.min(Number(sp.get('limit')) || 60, 200);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const rows = await query(
    `SELECT co.code, co.title, co.modality, co.term, co.units, co.instructor, co.description,
            co.meta, c.name AS college, c.url AS college_url, c.slug AS college_slug,
            ${distExpr} AS distance_mi
     FROM courses co JOIN colleges c ON c.id = co.college_id
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${p(limit)} OFFSET ${p(offset)}`,
    params,
  );

  // Strip anything that reveals provenance before returning.
  const results = rows.rows.map((r) => {
    const meta = r.meta || {};
    const { cvcUrl, cvcCourseId, ...cleanMeta } = meta;
    const distance_mi = r.distance_mi != null ? Math.round(r.distance_mi * 10) / 10 : null;
    return { ...r, distance_mi, meta: cleanMeta };
  });

  return NextResponse.json({ total: countRes.rows[0].n, count: results.length, offset, limit, results });
}

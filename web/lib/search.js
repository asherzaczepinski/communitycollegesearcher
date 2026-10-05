// Search over the `course_search` materialized view (built by src/searchIndex.js
// on every data refresh). That view already contains ONLY rows the site may show
// (trusted source, real title, clickable link) with normalized, indexed columns —
// so every query here is an index lookup, never a full-table regex scan.
//
// Shared by /api/search and the server-rendered first page (app/page.js).
// Provenance is intentionally never selected: callers can't learn where a row
// came from (no source, no CVC ids/urls).
import { query } from './db';
import { SUBJECT_BY_LABEL } from './subjects';

export const PAGE = 60;

const TRANSFER = { igetc: 'igetc', calgetc: 'cal_getc', 'cal-getc': 'cal_getc', csu: 'csu', uc: 'uc' };
const GE_SYS = { csu: 'csu', igetc: 'igetc', calgetc: 'calGetc' };
const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&');
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds WHERE + bind params from URLSearchParams. Returns a `bind` helper so the
// caller can append more params (distance, rank, limit) after the filters.
function buildWhere(sp) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  // Keyword — title + course code only, relevance-driven (NOT a dumb substring,
  // which made "ab" match Lab/Database/Algebra). A row matches when:
  //   • its code starts with the query (space-insensitive: "anth101" → ANTH 101), OR
  //   • a WORD in the title starts with it ("bio" → Biology, not symbiosis), OR
  //   • for ≥4-char queries, the title contains it anywhere ("biology" → Microbiology).
  // code_norm has a prefix btree; title_lc has a trigram GIN (serves both).
  const q = (sp.get('q') || '').trim().toLowerCase();
  const qn = q.replace(/\s+/g, '');
  if (q) {
    const ors = [
      `code_norm LIKE ${p(likeEscape(qn) + '%')}`,
      `title_lc ~ ${p('\\m' + reEscape(q))}`,
    ];
    if (qn.length >= 4) ors.push(`title_lc LIKE ${p('%' + likeEscape(q) + '%')}`);
    where.push(`(${ors.join(' OR ')})`);
  }

  // Subject → any of its curated code prefixes.
  const subject = sp.get('subject');
  if (subject && SUBJECT_BY_LABEL[subject]) {
    const ors = SUBJECT_BY_LABEL[subject].map((pre) => `code_norm LIKE ${p(pre.toLowerCase() + '%')}`);
    where.push(`(${ors.join(' OR ')})`);
  }

  const college = sp.get('college');
  if (college && college !== 'all') where.push(`college_slug = ${p(college)}`);

  // 'unknown' (ASSIST "modality varies") is never excluded — a course that might
  // be online still shows under Online. Only a definite mismatch hides.
  const modality = sp.get('modality');
  if (modality && modality !== 'all') where.push(`(modality = ${p(modality)} OR modality = 'unknown')`);

  const tcol = TRANSFER[(sp.get('transfer') || '').toLowerCase()];
  if (tcol) where.push(tcol);

  // Specific GE areas: "system|label" params, OR'd together. Uses the GIN index
  // on ge_areas via top-level containment ({"igetc": ["5B …"]}).
  const areaOrs = [];
  for (const area of sp.getAll('area')) {
    const i = area.indexOf('|');
    const key = i > 0 && GE_SYS[area.slice(0, i).toLowerCase()];
    if (key) areaOrs.push(`ge_areas @> ${p(JSON.stringify({ [key]: [area.slice(i + 1)] }))}::jsonb`);
  }
  if (areaOrs.length) where.push(`(${areaOrs.join(' OR ')})`);

  if (sp.get('ztc') === '1') where.push('ztc');
  if (sp.get('quality') === '1') where.push('quality');
  if (sp.get('cid') === '1') where.push('cid');

  const format = sp.get('format'); // Asynchronous / Synchronous
  if (format) where.push(`formats @> ${p(JSON.stringify([format]))}::jsonb`);

  const umin = sp.get('unitsMin'); if (umin) where.push(`units_num >= ${p(Number(umin))}`);
  const umax = sp.get('unitsMax'); if (umax) where.push(`units_num <= ${p(Number(umax))}`);

  return { whereSql: where.length ? where.join(' AND ') : 'TRUE', params, p, q, qn };
}

export async function countCourses(sp) {
  const { whereSql, params } = buildWhere(sp);
  const r = await query(`SELECT count(*)::int n FROM course_search WHERE ${whereSql}`, params);
  return r.rows[0].n;
}

export async function searchCourses(sp) {
  const { whereSql, params, p, q, qn } = buildWhere(sp);

  // User location → distance in miles (haversine). LEAST(1, NULL) is 1 in
  // Postgres, so guard colleges without coordinates explicitly.
  const lat = parseFloat(sp.get('lat'));
  const lng = parseFloat(sp.get('lng'));
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const distExpr = hasLoc
    ? `(CASE WHEN lat IS NULL OR lng IS NULL THEN NULL ELSE
         3959 * acos(LEAST(1, cos(radians(${p(lat)})) * cos(radians(lat)) * cos(radians(lng) - radians(${p(lng)}))
                      + sin(radians(${p(lat)})) * sin(radians(lat)))) END)`
    : 'NULL';

  // Keyword relevance: 0 exact code/title, 1 code prefix, 2 title prefix,
  // 3 a title word starts with it, 4 anywhere else.
  const relRank = q
    ? `(CASE
         WHEN code_norm = ${p(qn)} OR title_lc = ${p(q)} THEN 0
         WHEN code_norm LIKE ${p(likeEscape(qn) + '%')} THEN 1
         WHEN title_lc LIKE ${p(likeEscape(q) + '%')} THEN 2
         WHEN title_lc ~ ${p('\\m' + reEscape(q))} THEN 3
         ELSE 4 END)`
    : null;

  // `ord` / `ord_title` are precomputed ranks (college, code, title) and
  // (title, college) — indexed, so these sorts stop after LIMIT rows.
  const SORTS = {
    relevance: relRank ? `${relRank}, length(title), ord` : 'ord',
    college: 'ord',
    title: 'ord_title',
    units: 'units_num DESC NULLS LAST, college, ord',
    tuition: 'tuition ASC NULLS LAST, college, ord',
    nearest: hasLoc ? `${distExpr} ASC NULLS LAST, ord` : 'ord',
  };
  const orderBy = SORTS[sp.get('sort')] || SORTS.relevance;
  const limit = Math.min(Number(sp.get('limit')) || PAGE, 200);
  const offset = Math.max(Number(sp.get('offset')) || 0, 0);

  const r = await query(
    `SELECT id, code, title, modality, term, units, instructor, url,
            college, college_url, college_slug, last_scraped, ${distExpr} AS distance_mi,
            tuition, uc, ztc, quality, cid, cid_code, cid_title,
            ge_areas, formats, transferable, note, section_count, has_detail
     FROM course_search
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ${p(limit)} OFFSET ${p(offset)}`,
    params,
  );
  return r.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    tuition: row.tuition != null ? Number(row.tuition) : null,
    distance_mi: row.distance_mi != null ? Math.round(row.distance_mi * 10) / 10 : null,
  }));
}

// One course's heavy fields, fetched only when its row is expanded. Joined to
// course_search so a hidden (untrusted/invalid) row can never be read this way.
// Ids are reassigned on each data rebuild, so the code must match too — a result
// list cached from before a refresh can't pull up a different course's details.
export async function courseDetail(id, code) {
  const r = await query(
    `SELECT co.description, co.meta->>'prerequisites' AS prerequisites,
            CASE WHEN jsonb_typeof(co.meta->'sections') = 'array' THEN co.meta->'sections' ELSE '[]'::jsonb END AS sections
     FROM course_search s JOIN courses co ON co.id = s.id
     WHERE s.id = $1 AND s.code IS NOT DISTINCT FROM $2`,
    [id, code],
  );
  return r.rows[0] || null;
}

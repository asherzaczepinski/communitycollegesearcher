// The site's read model: a slim, pre-filtered, pre-indexed materialized view
// (`course_search`) built from the raw `courses` + `colleges` tables.
//
// Why: every search used to re-run the "is this row displayable/trustworthy"
// regex gates, JSON flag casts and a sort over all ~116k raw rows — 1–2s per
// request, twice per keystroke (page + count). The data only changes when the
// daily refresh runs, so we do all of that work ONCE here, and the API just
// reads indexed columns.
//
//   • Only rows the site may show are in the view (the gates below), so the API
//     needs no WHERE boilerplate and counts always match results.
//   • Heavy fields (description, sections, prerequisites, transferAreas) stay
//     OUT of the view — the list never shows them; /api/course fetches one
//     course's details by id when a row is expanded.
//   • Sort orders are precomputed as integer ranks (`ord`, `ord_title`), so
//     "first 60 rows" is an index range scan, not a sort of the whole table.
//
// Refresh is CONCURRENT: readers keep seeing the old snapshot until the new one
// is complete, so the live site never sees a half-built index.
//
// Run directly to (re)build it against Supabase:
//   node --env-file=web/.env.local src/searchIndex.js

// Bump when the view definition changes — ensureSearchIndex() then drops and
// rebuilds it instead of refreshing a stale shape.
import { pathToFileURL } from 'node:url';

const VERSION = 'course_search v1';

// A course is TRUSTWORTHY only when it comes from an authoritative statewide
// source — never a per-college website scrape (those grabbed wrong pages:
// Wikipedia, "new courses" lists, term schedules, PDF viewers):
//   'assist' — ASSIST.org, the official CA transferable-course database
//   'cvc'    — search.cvc.edu, the official statewide online course exchange.
// A row is DISPLAYABLE when it has a real title AND a real, clickable link —
// filters out scrape artifacts (PDF links, CRNs / modality text as titles).
const GATES = `
  c.scrape_type NOT IN ('sample','none')
  AND co.source IN ('assist','cvc')
  AND co.title ~ '[A-Za-z][A-Za-z]'
  AND lower(trim(co.title)) <> 'pdf'
  AND co.title !~* '^(in.?person|online (a?synchronous)|hybrid,)'
  AND co.url LIKE 'http%'`;

const flag = (k) => `coalesce((co.meta->>'${k}')::boolean, false)`;

const CREATE_VIEW = `
CREATE MATERIALIZED VIEW course_search AS
SELECT
  co.id,
  row_number() OVER (ORDER BY c.name, co.code, co.title, co.id)::int AS ord,
  row_number() OVER (ORDER BY co.title, c.name, co.id)::int          AS ord_title,
  c.slug AS college_slug, c.name AS college, c.url AS college_url,
  c.last_scraped, c.lat, c.lng,
  co.code, co.title, co.modality, co.term, co.units, co.instructor, co.url,
  replace(lower(coalesce(co.code, '')), ' ', '')                      AS code_norm,
  lower(co.title)                                                     AS title_lc,
  NULLIF(substring(co.units from '^[0-9]+\\.?[0-9]*'), '')::numeric   AS units_num,
  CASE WHEN co.meta->>'tuition' ~ '^-?[0-9]+(\\.[0-9]+)?$'
       THEN (co.meta->>'tuition')::numeric END                        AS tuition,
  ${flag('igetc')}            AS igetc,
  ${flag('calGetc')}          AS cal_getc,
  ${flag('csuBreadth')}       AS csu,
  ${flag('ucTransferable')}   AS uc,
  ${flag('zeroTextbookCost')} AS ztc,
  ${flag('qualityReviewed')}  AS quality,
  ${flag('cIdApproved')}      AS cid,
  co.meta->'geAreas'      AS ge_areas,
  co.meta->'formats'      AS formats,
  co.meta->'transferable' AS transferable,
  co.meta->>'cId'         AS cid_code,
  co.meta->>'cIdTitle'    AS cid_title,
  co.meta->>'note'        AS note,
  coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(co.meta->'sections') = 'array'
                                   THEN co.meta->'sections' END), 0)  AS section_count,
  (coalesce(co.description, '') <> '' OR coalesce(co.meta->>'prerequisites', '') <> '') AS has_detail
FROM courses co JOIN colleges c ON c.id = co.college_id
WHERE ${GATES};

CREATE UNIQUE INDEX course_search_id        ON course_search (id);
CREATE INDEX course_search_ord              ON course_search (ord);
CREATE INDEX course_search_ord_title        ON course_search (ord_title);
CREATE INDEX course_search_college          ON course_search (college_slug, ord);
CREATE INDEX course_search_code_norm        ON course_search (code_norm text_pattern_ops);
CREATE INDEX course_search_title_trgm       ON course_search USING gin (title_lc gin_trgm_ops);
CREATE INDEX course_search_ge               ON course_search USING gin (ge_areas jsonb_path_ops);
CREATE INDEX course_search_units            ON course_search (units_num DESC NULLS LAST, college);
CREATE INDEX course_search_tuition          ON course_search (tuition ASC NULLS LAST, college);
CREATE INDEX course_search_online           ON course_search (ord) WHERE modality = 'online';

COMMENT ON MATERIALIZED VIEW course_search IS '${VERSION}';
`;

// Create the view if it's missing or out of date; otherwise refresh it in place.
// `client` is a connected pg.Client (autocommit — must NOT be inside BEGIN, since
// REFRESH CONCURRENTLY and VACUUM can't run in a transaction block).
export async function ensureSearchIndex(client, log = console.log) {
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  const { rows } = await client.query(
    `SELECT obj_description(r, 'pg_class') AS v
     FROM to_regclass('course_search') r WHERE r IS NOT NULL`,
  );
  const t0 = Date.now();
  if (rows[0]?.v === VERSION) {
    log('Refreshing course_search (concurrently — site keeps serving the old copy)…');
    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY course_search');
  } else {
    log(rows.length ? 'course_search definition changed — rebuilding…' : 'Creating course_search…');
    await client.query('BEGIN');
    try {
      await client.query('DROP MATERIALIZED VIEW IF EXISTS course_search');
      await client.query(CREATE_VIEW);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    }
  }
  // Fresh planner stats + visibility map (enables index-only counts).
  await client.query('VACUUM ANALYZE course_search');
  const n = (await client.query('SELECT count(*)::int n FROM course_search')).rows[0].n;
  log(`course_search ready: ${n.toLocaleString()} rows (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return n;
}

// CLI: node --env-file=web/.env.local src/searchIndex.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    host: process.env.PGHOST || 'aws-1-us-east-1.pooler.supabase.com',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres.smypyppfwanhukvejevu',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  try { await ensureSearchIndex(client); } finally { await client.end(); }
}

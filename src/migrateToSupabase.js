// One-shot migration: push the local SQLite dataset (colleges + every scraped
// course) into Supabase Postgres.
//
// Connection: the direct db.<ref>.supabase.co host is IPv6-only and unreachable
// from many networks, so we use the IPv4 session pooler. Host/user/db are not
// secret and are defaulted here; the PASSWORD must come from the env — never
// commit it:
//   PGPASSWORD='…' node src/migrateToSupabase.js
//
// Re-runnable: it DROPs and recreates the two tables, so running it again just
// refreshes Supabase with the current local data.
import pg from 'pg';
import { db, getColleges } from './db.js';

const PG = {
  host: process.env.PGHOST || 'aws-1-us-east-1.pooler.supabase.com',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres.smypyppfwanhukvejevu',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
};

// Load into *_stage tables (indexes and all), then swap them in atomically at
// the very end. This makes the migration crash-safe: if the process dies mid-
// load, the live `colleges`/`courses` tables are untouched — no more half-wiped
// production (which is exactly what an interrupted DROP-then-reload caused).
const STAGE_SCHEMA = `
DROP TABLE IF EXISTS courses_stage CASCADE;
DROP TABLE IF EXISTS colleges_stage CASCADE;

CREATE TABLE colleges_stage (
  id              integer PRIMARY KEY,
  slug            text UNIQUE NOT NULL,
  name            text NOT NULL,
  url             text,
  scrape_type     text,
  last_scraped    text,
  last_status     text,
  course_count    integer DEFAULT 0,
  online_count    integer DEFAULT 0,
  hybrid_count    integer DEFAULT 0,
  in_person_count integer DEFAULT 0,
  site_count      integer DEFAULT 0,
  cvc_count       integer DEFAULT 0,
  lat             double precision,
  lng             double precision,
  live            boolean DEFAULT false
);

CREATE TABLE courses_stage (
  id          bigint PRIMARY KEY,
  college_id  integer NOT NULL,
  code        text,
  title       text NOT NULL,
  modality    text,
  term        text,
  units       text,
  instructor  text,
  section     text,
  description text,
  url         text,
  source      text,
  meta        jsonb,
  updated_at  text
);

CREATE INDEX idx_courses_stage_college  ON courses_stage(college_id);
CREATE INDEX idx_courses_stage_modality ON courses_stage(modality);
CREATE INDEX idx_courses_stage_title    ON courses_stage(title);
CREATE INDEX idx_courses_stage_code     ON courses_stage(code);
CREATE INDEX idx_courses_stage_source   ON courses_stage(source);
CREATE INDEX idx_courses_stage_meta     ON courses_stage USING gin (meta);
`;

// Atomic cutover — old tables dropped and stage tables renamed in one txn.
const SWAP_SQL = `
BEGIN;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS colleges CASCADE;
ALTER TABLE colleges_stage RENAME TO colleges;
ALTER TABLE courses_stage RENAME TO courses;
COMMIT;
`;

// Insert rows in batches of multi-row VALUES. Returns total inserted.
async function bulkInsert(client, table, columns, rows, batchSize = 500) {
  let done = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const params = [];
    const tuples = chunk.map((row) => {
      const ph = columns.map((_, j) => `$${params.length + j + 1}`);
      params.push(...columns.map((c) => row[c]));
      return `(${ph.join(',')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}`,
      params,
    );
    done += chunk.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
  return done;
}

async function run() {
  if (!PG.password) { console.error('Set PGPASSWORD (Supabase DB password) in the env.'); process.exit(1); }

  const colleges = getColleges();
  const courses = db.prepare('SELECT * FROM courses').all();
  console.log(`Local data: ${colleges.length} colleges, ${courses.length.toLocaleString()} courses`);

  const client = new pg.Client(PG);
  await client.connect();
  console.log(`Connected to Supabase (${PG.host}). Loading into staging tables…`);
  await client.query(STAGE_SCHEMA);

  // Colleges (carry the precomputed counts so the remote DB is dashboard-ready).
  const collegeCols = ['id', 'slug', 'name', 'url', 'scrape_type', 'last_scraped', 'last_status',
    'course_count', 'online_count', 'hybrid_count', 'in_person_count', 'site_count', 'cvc_count', 'lat', 'lng', 'live'];
  const collegeRows = colleges.map((c) => ({
    id: c.id, slug: c.slug, name: c.name, url: c.url, scrape_type: c.scrape_type,
    last_scraped: c.last_scraped, last_status: c.last_status, course_count: c.course_count,
    online_count: c.online_count, hybrid_count: c.hybrid_count, in_person_count: c.in_person_count,
    site_count: c.site_count, cvc_count: c.cvc_count, lat: c.lat ?? null, lng: c.lng ?? null, live: !!c.live,
  }));
  await bulkInsert(client, 'colleges_stage', collegeCols, collegeRows);

  // Courses (preserve original ids + the FK by college_id).
  const courseCols = ['id', 'college_id', 'code', 'title', 'modality', 'term', 'units',
    'instructor', 'section', 'description', 'url', 'source', 'meta', 'updated_at'];
  await bulkInsert(client, 'courses_stage', courseCols, courses);

  // Everything loaded — now swap staging into place atomically.
  console.log('Staging load complete. Swapping into production…');
  await client.query(SWAP_SQL);

  // Keep Postgres sequences (if any future inserts) past our max ids — harmless here
  // since we use fixed ids, but verify the load.
  const cc = await client.query('select count(*)::int n from colleges');
  const crc = await client.query('select count(*)::int n from courses');
  const mod = await client.query("select modality, count(*)::int n from courses group by modality order by n desc");
  const src = await client.query("select source, count(*)::int n from courses where source is not null group by source order by n desc");
  console.log(`\nSupabase now has: ${cc.rows[0].n} colleges, ${crc.rows[0].n} courses`);
  console.log('  by modality:', mod.rows.map((r) => `${r.modality}:${r.n}`).join('  '));
  console.log('  by source:  ', src.rows.map((r) => `${r.source}:${r.n}`).join('  '));
  await client.end();
  console.log('\n✅ Migration complete.');
}

run().catch((e) => { console.error('\nMigration failed:', e.message); process.exit(1); });

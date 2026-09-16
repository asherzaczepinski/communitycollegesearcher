// Writes a plain-text status file to the Desktop with the live database health:
// course/college counts, per-source breakdown, and a timestamp. Overwritten each
// run so the Desktop always shows the latest state. (Replaces the email idea.)
//
// Reads Supabase creds from env (web/.env.local locally). Override the output
// path with STATUS_TXT if you don't want it on the Desktop.
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.env.STATUS_TXT || path.join(os.homedir(), 'Desktop', 'College Searcher Status.txt');
const HEALTHY_MIN = 100000; // expect ~116k courses
const label = process.argv[2] || 'update';

const PG = {
  host: process.env.PGHOST || 'aws-1-us-east-1.pooler.supabase.com',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres.smypyppfwanhukvejevu',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
};

function write(lines) {
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  console.log('Wrote', OUT);
}

const stamp = new Date().toString();
try {
  const client = new pg.Client(PG);
  await client.connect();
  const n = (await client.query('SELECT COUNT(*)::int n FROM courses')).rows[0].n;
  const colleges = (await client.query('SELECT COUNT(DISTINCT college_id)::int n FROM courses')).rows[0].n;
  const online = (await client.query("SELECT COUNT(*)::int n FROM courses WHERE modality='online'")).rows[0].n;
  const bySource = (await client.query('SELECT source, COUNT(*)::int n FROM courses GROUP BY source ORDER BY n DESC')).rows;
  await client.end();

  const healthy = n >= HEALTHY_MIN;
  write([
    `COMMUNITY COLLEGE SEARCHER — STATUS`,
    `${healthy ? 'OK — database healthy' : 'WARNING — course count is LOW, check the last update'}`,
    ``,
    `Last ${label}:  ${stamp}`,
    ``,
    `Courses:   ${n.toLocaleString()}`,
    `Colleges:  ${colleges}`,
    `Online (CVC-verified): ${online.toLocaleString()}`,
    `By source: ${bySource.map((r) => `${r.source}=${r.n.toLocaleString()}`).join('   ')}`,
    ``,
    `Site: https://collegesearcher.vercel.app`,
  ]);
  if (!healthy) process.exitCode = 1;
} catch (e) {
  write([
    `COMMUNITY COLLEGE SEARCHER — STATUS`,
    `ERROR — could not reach the database`,
    ``,
    `Last attempt: ${stamp}`,
    `Error: ${e.message}`,
  ]);
  process.exitCode = 1;
}

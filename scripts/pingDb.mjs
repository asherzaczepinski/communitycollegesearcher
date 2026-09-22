// Daily DB keepalive ping.
//
// Supabase pauses free-tier projects after ~7 days of no activity. This script
// opens ONE connection to the Supabase Postgres (IPv4 session pooler) and runs a
// trivial `SELECT now()` — enough to count as activity and keep the project awake.
// It is deliberately lightweight and depends on NO tables, so it keeps working
// even if the schema changes or a rebuild half-fails.
//
// Creds: host/port/user/db are not secret and are defaulted here (same as
// src/migrateToSupabase.js); the PASSWORD must come from the env — never commit it:
//   node --env-file=web/.env.local scripts/pingDb.mjs
// or, from anywhere with the vars exported:
//   PGPASSWORD='…' node scripts/pingDb.mjs
//
// Exit code: 0 on a successful ping, 1 on any failure (so launchd / a monitor
// can tell a real outage from a healthy day).
import pg from 'pg';

const PG = {
  host: process.env.PGHOST || 'aws-1-us-east-1.pooler.supabase.com',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres.smypyppfwanhukvejevu',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
  // Don't let a wedged socket hang the whole job forever.
  query_timeout: 20000,
  statement_timeout: 20000,
};

const stamp = new Date().toISOString();

if (!PG.password) {
  console.error(`[ping ${stamp}] FAIL: PGPASSWORD is not set (pass --env-file=web/.env.local).`);
  process.exit(1);
}

const client = new pg.Client(PG);
const started = Date.now();
try {
  await client.connect();
  const now = (await client.query('SELECT now() AS now')).rows[0].now;
  const ms = Date.now() - started;
  console.log(`[ping ${stamp}] OK: ${PG.host} responded in ${ms}ms (db time ${now.toISOString?.() ?? now}).`);
  process.exitCode = 0;
} catch (err) {
  console.error(`[ping ${stamp}] FAIL: ${err.code ? err.code + ' — ' : ''}${err.message}`);
  process.exitCode = 1;
} finally {
  // end() can reject if the connection never came up; ignore — we already reported.
  await client.end().catch(() => {});
}

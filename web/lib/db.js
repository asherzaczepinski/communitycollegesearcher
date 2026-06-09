// Server-only Postgres pool against Supabase. Cached on the global object so we
// reuse one pool across hot-reloads / requests (Next.js re-imports modules a lot
// in dev). Credentials come from env (.env.local) and never reach the client.
import pg from 'pg';

function makePool() {
  return new pg.Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'postgres',
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30000,
  });
}

const g = globalThis;
export const pool = g.__cccPool || (g.__cccPool = makePool());

export function query(text, params) {
  return pool.query(text, params);
}

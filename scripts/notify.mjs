// Emails a status summary to asherzac2020@gmail.com via Resend (same service as
// racehawks). Connects to Supabase, counts what's actually live, and picks the
// subject from the health of the data — so it works as both an "update" ping and
// a keepalive/health check. No dependency: Resend's HTTP API via fetch.
//
// Reads from env (GitHub secrets in CI, web/.env.local locally):
//   RESEND_API_KEY, EMAIL_FROM, PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
//
//   node scripts/notify.mjs                 # auto subject from health
//   node scripts/notify.mjs "Local refresh" # prefix the subject with a label
import pg from 'pg';

const TO = 'asherzac2020@gmail.com';
const HEALTHY_MIN = 100000; // expect ~116k courses; below this = something's wrong
const label = process.argv[2] ? `${process.argv[2]}: ` : '';

const PG = {
  host: process.env.PGHOST || 'aws-1-us-east-1.pooler.supabase.com',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres.smypyppfwanhukvejevu',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
};

async function readStats() {
  const client = new pg.Client(PG);
  await client.connect();
  try {
    const n = (await client.query('SELECT COUNT(*)::int n FROM courses')).rows[0].n;
    const colleges = (await client.query('SELECT COUNT(DISTINCT college_id)::int n FROM courses')).rows[0].n;
    const bySource = (await client.query("SELECT source, COUNT(*)::int n FROM courses GROUP BY source ORDER BY n DESC")).rows;
    const online = (await client.query("SELECT COUNT(*)::int n FROM courses WHERE modality='online'")).rows[0].n;
    return { n, colleges, bySource, online };
  } finally {
    await client.end();
  }
}

async function sendEmail(subject, text) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  if (!key) { console.warn('RESEND_API_KEY not set — skipping email. Subject was:', subject); return false; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: TO, subject, text }),
  });
  if (!res.ok) { console.error('Resend error', res.status, await res.text()); return false; }
  console.log('Email sent:', subject);
  return true;
}

try {
  const s = await readStats();
  const healthy = s.n >= HEALTHY_MIN;
  const now = new Date().toISOString();
  const subject = `${label}${healthy ? '✅' : '⚠️'} CCC Searcher — ${s.n.toLocaleString()} courses, ${s.colleges} colleges`;
  const text = [
    `${healthy ? 'Database healthy.' : 'WARNING: course count is unexpectedly low — check the last update.'}`,
    ``,
    `Courses:  ${s.n.toLocaleString()}`,
    `Colleges: ${s.colleges}`,
    `Online (CVC-verified): ${s.online.toLocaleString()}`,
    `By source: ${s.bySource.map((r) => `${r.source}=${r.n.toLocaleString()}`).join('  ')}`,
    ``,
    `Site: https://collegesearcher.vercel.app`,
    `Checked: ${now}`,
  ].join('\n');
  await sendEmail(subject, text);
  if (!healthy) process.exitCode = 1;
} catch (e) {
  await sendEmail(`${label}⚠️ CCC Searcher — update/check FAILED`, `The daily job could not read the database.\n\nError: ${e.message}\nAt: ${new Date().toISOString()}`);
  process.exitCode = 1;
}

// One command to refresh the site's data end to end. Used by the admin
// dashboard (scripts/admin.mjs) and runnable directly:
//
//   node scripts/update.mjs          # quick: re-fetch ASSIST, rebuild, publish (~5 min)
//   node scripts/update.mjs --full   # full: ALSO re-sweep every college's online
//                                    # courses on CVC + their GE areas (~1–2 h)
//
// Every step works on the LOCAL SQLite DB / snapshot files; only the final
// publish touches Supabase, and it does so in one transaction followed by a
// concurrent refresh of the course_search view — the live site never sees a
// half-loaded state. A failing fetch step keeps the previous data for that source.
//
// Progress goes to scripts/logs/status.json (read by the dashboard) and the full
// output to scripts/logs/update-<timestamp>.log.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGS = path.join(ROOT, 'scripts/logs');
const STATUS = path.join(LOGS, 'status.json');
const ENV = '--env-file=web/.env.local';
const full = process.argv.includes('--full');

// [label, argv for node | shell command, optional = failure keeps old data and continues]
const node = (...a) => ({ cmd: process.execPath, args: a });
const STEPS = [
  ['Rebuild local DB from saved data', node('scripts/buildFromAssist.js')],
  ...(full ? [
    ['Download C-ID transfer lists', { cmd: 'npm', args: ['run', '-s', 'cid:fetch'] }, { optional: true }],
    ['Fetch GE areas from CVC', node('src/cvcGeAreas.js', '--build'), { optional: true }],
    ['Fetch online courses from CVC (slow)', node('scripts/refreshCvc.mjs'), { optional: true }],
    ['Rebuild with new CVC courses', node('scripts/buildFromAssist.js')],
  ] : []),
  ['Fetch transfer catalogs from ASSIST', node(ENV, 'src/ucSupplement.js'), { optional: true }],
  ['Tag C-ID approved courses', node('src/cidSupplement.js'), { optional: true }],
  ['Save snapshots', node('scripts/exportSnapshots.mjs')],
  ['Final rebuild', node('scripts/buildFromAssist.js')],
  ['Tag C-ID approved courses (all rows)', node('src/cidSupplement.js'), { optional: true }],
  ['Publish to the live site (Supabase)', node(ENV, 'src/migrateToSupabase.js')],
  ['Write Desktop status file', node(ENV, 'scripts/writeStatus.mjs', full ? 'full update' : 'quick update'), { optional: true }],
];

fs.mkdirSync(LOGS, { recursive: true });

// Refuse to run twice at once.
try {
  const prev = JSON.parse(fs.readFileSync(STATUS, 'utf8'));
  if (prev.running && prev.pid !== process.pid) {
    try { process.kill(prev.pid, 0); console.error(`An update is already running (pid ${prev.pid}).`); process.exit(2); } catch { /* stale */ }
  }
} catch { /* no status yet */ }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(LOGS, `update-${stamp}.log`);
const log = fs.createWriteStream(logFile);
const status = {
  running: true, pid: process.pid, mode: full ? 'full' : 'quick',
  startedAt: new Date().toISOString(), finishedAt: null, ok: null, error: null,
  logFile: path.basename(logFile), warnings: [],
  steps: STEPS.map(([label]) => ({ label, state: 'pending' })),
};
const save = () => fs.writeFileSync(STATUS, JSON.stringify(status, null, 2));
const out = (s) => { process.stdout.write(s); log.write(s); };

function run({ cmd, args }) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: process.env });
    p.stdout.on('data', (d) => out(d.toString()));
    p.stderr.on('data', (d) => out(d.toString()));
    p.on('close', (code) => resolve(code));
    p.on('error', (e) => { out(`${e.message}\n`); resolve(1); });
  });
}

// Stop cleanly if the dashboard's Stop button (SIGTERM) or Ctrl-C hits us.
let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    stopping = true;
    Object.assign(status, { running: false, ok: false, error: 'Stopped', finishedAt: new Date().toISOString() });
    save();
    process.exit(1);
  });
}

save();
out(`===== ${full ? 'FULL' : 'QUICK'} update — ${new Date().toString()} =====\n`);
for (let i = 0; i < STEPS.length && !stopping; i++) {
  const [label, command, opts = {}] = STEPS[i];
  status.steps[i].state = 'running'; status.steps[i].startedAt = new Date().toISOString(); save();
  out(`\n── [${i + 1}/${STEPS.length}] ${label}\n`);
  const code = await run(command);
  status.steps[i].finishedAt = new Date().toISOString();
  if (code === 0) {
    status.steps[i].state = 'done';
  } else if (opts.optional) {
    status.steps[i].state = 'warning';
    status.warnings.push(`${label} failed — kept the previous data for it`);
    out(`⚠ ${label} failed (exit ${code}) — keeping previous data and continuing\n`);
  } else {
    status.steps[i].state = 'failed';
    Object.assign(status, { running: false, ok: false, error: `${label} failed (exit ${code})`, finishedAt: new Date().toISOString() });
    save();
    out(`\n✗ ${label} failed — the live site was NOT changed.\n`);
    process.exit(1);
  }
  save();
}
Object.assign(status, { running: false, ok: true, finishedAt: new Date().toISOString() });
save();
out(`\n✓ Update complete${status.warnings.length ? ` with ${status.warnings.length} warning(s)` : ''}.\n`);
log.end();

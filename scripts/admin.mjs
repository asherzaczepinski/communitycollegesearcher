// Local admin dashboard for the course data — run on your Mac:
//
//   npm run admin            → opens http://localhost:4100
//
// Shows what's live on the site (course/college counts, last update), lets you
// start a Quick or Full data update (scripts/update.mjs), watch its progress
// and log live, and stop it. Updates run as their own process, so closing the
// dashboard (or this terminal) doesn't kill an update in progress — reopen the
// dashboard any time to see where it is.
//
// Listens on localhost only. It needs the Supabase creds in web/.env.local.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGS = path.join(ROOT, 'scripts/logs');
const STATUS = path.join(LOGS, 'status.json');
const PORT = Number(process.env.ADMIN_PORT || 4100);
const SITE = 'https://collegesearcher.vercel.app';

// Load web/.env.local (PG creds) into this process and the updates it starts.
try {
  for (const line of fs.readFileSync(path.join(ROOT, 'web/.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { console.warn('! web/.env.local not found — live stats will be unavailable'); }

const pool = new pg.Pool({
  host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 15000,
});

const readStatus = () => { try { return JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function currentStatus() {
  const s = readStatus();
  // A run that died without cleaning up (crash, reboot) shows as interrupted.
  if (s?.running && !alive(s.pid)) Object.assign(s, { running: false, ok: false, error: 'Interrupted (process is gone)' });
  return s;
}

function tail(file, maxBytes = 60000) {
  try {
    const fd = fs.openSync(path.join(LOGS, path.basename(file)), 'r');
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    // Collapse \r progress-bar redraws to their last state.
    return buf.toString('utf8').split('\n').map((l) => l.split('\r').filter(Boolean).pop() || '').join('\n');
  } catch { return ''; }
}

async function live() {
  const q = async (sql) => (await pool.query(sql)).rows[0];
  const [view, src] = await Promise.all([
    q(`SELECT count(*)::int courses, count(DISTINCT college_slug)::int colleges,
              count(*) FILTER (WHERE modality = 'online')::int online, max(last_scraped) last_updated
       FROM course_search`),
    q(`SELECT count(*) FILTER (WHERE source='assist')::int assist, count(*) FILTER (WHERE source='cvc')::int cvc FROM courses`),
  ]);
  return { ...view, ...src };
}

function startUpdate(full) {
  const s = currentStatus();
  if (s?.running) return { error: 'An update is already running.' };
  const child = spawn(process.execPath, ['scripts/update.mjs', ...(full ? ['--full'] : [])], {
    cwd: ROOT, env: process.env, detached: true, stdio: 'ignore',
  });
  child.unref();
  return { ok: true, pid: child.pid };
}

function stopUpdate() {
  const s = currentStatus();
  if (!s?.running) return { error: 'Nothing is running.' };
  // update.mjs is a process-group leader (detached), so this also stops the step it's on.
  try { process.kill(-s.pid, 'SIGTERM'); } catch { try { process.kill(s.pid, 'SIGTERM'); } catch { /* gone */ } }
  return { ok: true };
}

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
    if (url.pathname === '/api/status') {
      const s = currentStatus();
      return json(res, 200, { status: s, log: s ? tail(s.logFile) : '' });
    }
    if (url.pathname === '/api/live') return json(res, 200, await live());
    if (url.pathname === '/api/history') {
      const files = fs.existsSync(LOGS) ? fs.readdirSync(LOGS).filter((f) => f.startsWith('update-')).sort().reverse().slice(0, 15) : [];
      return json(res, 200, files.map((f) => {
        const t = tail(f, 400);
        const mode = /FULL update/.test(fs.readFileSync(path.join(LOGS, f), 'utf8').slice(0, 200)) ? 'full' : 'quick';
        return { file: f, mode, ok: /✓ Update complete/.test(t), failed: /✗ /.test(t) };
      }));
    }
    if (url.pathname === '/api/log') return json(res, 200, { log: tail(url.searchParams.get('file') || '', 400000) });
    if (req.method === 'POST' && url.pathname === '/api/update') return json(res, 200, startUpdate(url.searchParams.get('mode') === 'full'));
    if (req.method === 'POST' && url.pathname === '/api/stop') return json(res, 200, stopUpdate());
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const u = `http://localhost:${PORT}`;
  console.log(`Admin dashboard: ${u}   (Ctrl-C to close — a running update keeps going)`);
  if (!process.argv.includes('--no-open')) exec(`open ${u}`);
});

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Course Data Admin</title>
<style>
  :root { --paper:#f7f4ee; --card:#fff; --ink:#20201d; --soft:#59554c; --line:#e3ddd0; --accent:#1f6a4a; --wash:#e8f0ea; --rust:#a8472a; --warn:#8a6410; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 "Avenir Next", system-ui, -apple-system, sans-serif; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }
  h1 { font-family: Charter, Georgia, serif; font-size: 1.7rem; margin: 0 0 4px; }
  h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--soft); margin: 28px 0 10px; }
  .sub { color: var(--soft); margin: 0 0 20px; } a { color: var(--accent); }
  .stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap:10px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .stat b { display:block; font-size:1.4rem; font-variant-numeric: tabular-nums; }
  .stat span { color:var(--soft); font-size:.82rem; }
  .actions { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .act { text-align:left; background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px; cursor:pointer; font:inherit; color:inherit; }
  .act:hover:not(:disabled) { border-color: var(--accent); }
  .act:disabled { opacity:.5; cursor:not-allowed; }
  .act b { display:block; color:var(--accent); font-size:1.05rem; margin-bottom:2px; }
  .act span { color:var(--soft); font-size:.86rem; }
  .run { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .run-head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
  .pill { font-size:.8rem; font-weight:600; padding:2px 10px; border-radius:999px; background:var(--wash); color:var(--accent); }
  .pill.bad { background:#fbe9e3; color:var(--rust); } .pill.warn { background:#fdf4dc; color:var(--warn); }
  .stop { font:inherit; border:1px solid var(--rust); color:var(--rust); background:#fff; border-radius:6px; padding:6px 12px; cursor:pointer; }
  ol { margin:12px 0 0; padding-left: 0; list-style:none; }
  li { display:flex; gap:10px; padding:4px 0; font-size:.92rem; }
  li .i { width:18px; text-align:center; flex:none; }
  li.pending { color:var(--soft); } li.running { font-weight:600; } li.failed { color:var(--rust); } li.warning { color:var(--warn); }
  li .t { margin-left:auto; color:var(--soft); font-variant-numeric: tabular-nums; font-weight:400; }
  pre { background:#1d1d1b; color:#e9e6df; border-radius:8px; padding:12px; font-size:12px; line-height:1.45; max-height:420px; overflow:auto; white-space:pre-wrap; word-break:break-word; margin:12px 0 0; }
  .hist { background:var(--card); border:1px solid var(--line); border-radius:8px; }
  .hist div { display:flex; gap:10px; padding:8px 14px; border-top:1px solid var(--line); font-size:.9rem; cursor:pointer; }
  .hist div:first-child { border-top:none; } .hist div:hover { background:var(--wash); }
  .muted { color:var(--soft); }
  @media (max-width: 560px) { .actions { grid-template-columns: 1fr; } }
</style></head><body><main>
  <h1>Course data admin</h1>
  <p class="sub">Runs on this Mac. Updates publish straight to <a href="${SITE}" target="_blank">${SITE.replace('https://', '')}</a>.</p>

  <h2>Live on the site</h2>
  <div class="stats" id="stats"><div class="stat"><span>Loading…</span></div></div>

  <h2>Update the data</h2>
  <div class="actions">
    <button class="act" id="quick"><b>Quick update</b><span>Re-fetch the transfer catalogs from ASSIST.org and republish. About 5 minutes.</span></button>
    <button class="act" id="full"><b>Full update</b><span>Everything in Quick, plus re-fetch every college's online classes from CVC. 1–2 hours.</span></button>
  </div>

  <h2>Current / last run</h2>
  <div class="run" id="run"><span class="muted">No updates run yet.</span></div>

  <h2>History</h2>
  <div class="hist" id="hist"><div class="muted">—</div></div>
</main>
<script>
const $ = (id) => document.getElementById(id);
const fmtN = (n) => n == null ? '—' : Number(n).toLocaleString();
const fmtD = (s) => s ? new Date(s).toLocaleString() : '—';
const dur = (a, b) => { if (!a) return ''; const s = Math.round(((b ? new Date(b) : new Date()) - new Date(a)) / 1000); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s/60) + 'm ' + (s%60) + 's' : Math.floor(s/3600) + 'h ' + Math.floor(s%3600/60) + 'm'; };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
let viewing = null; // a history log file being viewed instead of the live run

async function loadLive() {
  try {
    const d = await fetch('/api/live').then((r) => r.json());
    if (d.error) throw new Error(d.error);
    $('stats').innerHTML = [
      [fmtN(d.courses), 'courses shown'], [fmtN(d.colleges), 'colleges'], [fmtN(d.online), 'online (CVC)'],
      [d.last_updated ? new Date(d.last_updated).toLocaleDateString() : '—', 'last updated'],
    ].map(([b, s]) => '<div class="stat"><b>' + b + '</b><span>' + s + '</span></div>').join('');
  } catch (e) { $('stats').innerHTML = '<div class="stat"><span>Couldn\\'t reach the database: ' + esc(e.message) + '</span></div>'; }
}

const ICON = { done: '✓', running: '◐', pending: '·', failed: '✗', warning: '⚠' };
let wasRunning = false;
async function loadStatus() {
  const { status: s, log } = await fetch('/api/status').then((r) => r.json());
  const running = !!s?.running;
  $('quick').disabled = $('full').disabled = running;
  if (wasRunning && !running) { loadLive(); loadHistory(); }
  wasRunning = running;
  if (!s || viewing) return;
  const pill = running ? '<span class="pill">Running</span>'
    : s.ok ? (s.warnings?.length ? '<span class="pill warn">Done with warnings</span>' : '<span class="pill">Done</span>')
    : '<span class="pill bad">' + esc(s.error || 'Failed') + '</span>';
  const pre = $('log'); const stick = !pre || pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
  $('run').innerHTML =
    '<div class="run-head"><div><b>' + (s.mode === 'full' ? 'Full' : 'Quick') + ' update</b> · started ' + fmtD(s.startedAt) +
    ' · ' + dur(s.startedAt, s.finishedAt) + '</div><div>' + pill + (running ? ' <button class="stop" id="stop">Stop</button>' : '') + '</div></div>' +
    (s.warnings?.length ? '<p class="muted" style="margin:8px 0 0">' + s.warnings.map(esc).join('<br>') + '</p>' : '') +
    '<ol>' + s.steps.map((st) => '<li class="' + st.state + '"><span class="i">' + ICON[st.state] + '</span>' + esc(st.label) +
      '<span class="t">' + (st.startedAt ? dur(st.startedAt, st.finishedAt) : '') + '</span></li>').join('') + '</ol>' +
    '<pre id="log">' + esc(log.split('\\n').slice(-300).join('\\n')) + '</pre>';
  const np = $('log'); if (stick) np.scrollTop = np.scrollHeight;
  if ($('stop')) $('stop').onclick = async () => { if (confirm('Stop the update? The live site keeps its current data.')) { await fetch('/api/stop', { method: 'POST' }); loadStatus(); } };
}

async function loadHistory() {
  const h = await fetch('/api/history').then((r) => r.json());
  $('hist').innerHTML = h.length ? h.map((x) => {
    const when = x.file.replace(/^update-|\\.log$/g, '').replace(/T(\\d\\d)-(\\d\\d)-(\\d\\d).*/, ' $1:$2');
    return '<div data-f="' + x.file + '"><span>' + (x.ok ? '✓' : x.failed ? '✗' : '·') + '</span><span>' + when + '</span><span class="muted">' + x.mode + '</span></div>';
  }).join('') : '<div class="muted">No runs yet.</div>';
  for (const el of $('hist').children) if (el.dataset.f) el.onclick = async () => {
    viewing = el.dataset.f;
    const { log } = await fetch('/api/log?file=' + encodeURIComponent(viewing)).then((r) => r.json());
    $('run').innerHTML = '<div class="run-head"><b>' + esc(viewing) + '</b><button class="stop" id="back" style="border-color:var(--line);color:inherit">Back to current run</button></div><pre>' + esc(log) + '</pre>';
    $('back').onclick = () => { viewing = null; loadStatus(); };
  };
}

async function start(mode) {
  const msg = mode === 'full' ? 'Start a FULL update (1–2 hours)?' : 'Start a quick update (~5 minutes)?';
  if (!confirm(msg)) return;
  const r = await fetch('/api/update?mode=' + mode, { method: 'POST' }).then((x) => x.json());
  if (r.error) alert(r.error);
  viewing = null; setTimeout(loadStatus, 500);
}
$('quick').onclick = () => start('quick');
$('full').onclick = () => start('full');
loadLive(); loadStatus(); loadHistory();
setInterval(loadStatus, 2000);
</script></body></html>`;

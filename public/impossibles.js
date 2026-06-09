const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// On this tab we only care about the stuck set (+ the ones we solve). A college is
// "in scope" if it's impossible/error/blocked/running, or live-because-we-solved-it.
const SCOPE = new Set(['impossible', 'error', 'blocked', 'running']);
const STATUS = {
  running:    { label: 'solving',    cls: 'st-running',    order: 0 },
  blocked:    { label: 'blocked',    cls: 'st-blocked',    order: 1 },
  error:      { label: 'error',      cls: 'st-error',      order: 2 },
  impossible: { label: 'impossible', cls: 'st-impossible', order: 3 },
  live:       { label: 'SOLVED ✓',   cls: 'st-live',       order: 4 },
};

const state = { colleges: new Map(), filter: '', maxLog: 1500 };

function inScope(r) {
  return SCOPE.has(r.status) || (r.status === 'live' && (r.strategy || r.source === 'solve'));
}

function merge(r) {
  const prev = state.colleges.get(r.slug) || {};
  state.colleges.set(r.slug, { ...prev, ...r });
}

async function loadInitial() {
  const prog = await fetch('/api/progress').then((r) => r.json());
  for (const r of prog.colleges) if (inScope(r)) merge(r);
  applyRun(prog.run || {});
  render();
}

function counts() {
  const c = { running: 0, impossible: 0, blocked: 0, error: 0, live: 0 };
  for (const r of state.colleges.values()) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}

function renderSummary() {
  const c = counts();
  $('#summary').textContent =
    `${c.live} solved · ${c.impossible} still impossible · ${c.blocked} blocked · ${c.error} error · ${state.colleges.size} in scope`;
  $('#status-tiles').innerHTML = ['live', 'running', 'impossible', 'blocked', 'error']
    .map((k) => `<div class="tile ${STATUS[k].cls}"><span class="tn">${c[k] || 0}</span><span class="tl">${STATUS[k].label}</span></div>`)
    .join('');
}

function row(r) {
  const m = STATUS[r.status] || STATUS.impossible;
  const cc = r.courseCount ? `<span class="rc">${Number(r.courseCount).toLocaleString()} courses</span>` : '';
  const strat = r.status === 'live' && r.strategy ? `<div class="pr-note">✓ via <b>${esc(r.strategy)}</b></div>` : (r.note ? `<div class="pr-note">${esc(r.note)}</div>` : '');
  const link = r.status === 'live' ? `<a class="btn ghost small" href="/search.html?college=${encodeURIComponent(r.slug)}">Search</a>` : '';
  const busy = r.status === 'running';
  return `<div class="prog-row ${m.cls}" data-slug="${esc(r.slug)}">
    <div class="pr-main">
      <div class="pr-name"><span class="pr-dot"></span>${esc(r.name)}
        <span class="pr-badge ${m.cls}">${m.label}</span>
        ${r.attempts ? `<span class="pr-att">·&nbsp;${r.attempts} attempt${r.attempts > 1 ? 's' : ''}</span>` : ''}
        <a class="site" href="${esc(r.url)}" target="_blank" rel="noopener">site ↗</a>
      </div>
      ${strat}
    </div>
    <div class="pr-right">
      ${cc}
      ${link}
      <button class="btn small" data-act="solve" ${busy ? 'disabled' : ''}>${busy ? '…' : 'Solve'}</button>
      <button class="btn ghost small" data-act="log">Log</button>
    </div>
  </div>`;
}

function render() {
  renderSummary();
  const f = state.filter.toLowerCase();
  const rows = [...state.colleges.values()]
    .filter((r) => !f || r.name.toLowerCase().includes(f) || r.slug.includes(f))
    .sort((a, b) => (STATUS[a.status]?.order - STATUS[b.status]?.order) || a.name.localeCompare(b.name));
  $('#grid-count').textContent = `(${rows.length})`;
  $('#grid').innerHTML = rows.map(row).join('') || '<p class="empty small">Nothing here — no impossible colleges. 🎉</p>';
}

// --- live log -------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
function clock(iso) { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function lineClass(msg) {
  if (msg.includes('✅') || msg.includes('✓ "') || msg.includes('SOLVED')) return 'lg-ok';
  if (msg.includes('🔒')) return 'lg-blocked';
  if (msg.includes('🚫')) return 'lg-bad';
  if (msg.includes('⚠') || /error|unreachable/i.test(msg)) return 'lg-warn';
  if (msg.startsWith('▶') || msg.startsWith('── Strategy')) return 'lg-step';
  return '';
}
function appendLog({ name, msg, t }) {
  const con = $('#console');
  const near = con.scrollHeight - con.scrollTop - con.clientHeight < 60;
  const div = document.createElement('div');
  div.className = `lg ${lineClass(msg)}`;
  div.innerHTML = `<span class="lg-t">${clock(t)}</span><span class="lg-n">${esc(name || '')}</span><span class="lg-m">${esc(msg)}</span>`;
  con.appendChild(div);
  while (con.childElementCount > state.maxLog) con.removeChild(con.firstChild);
  if ($('#autoscroll').checked && near) con.scrollTop = con.scrollHeight;
}

// --- run state ------------------------------------------------------------
function applyRun(run) {
  const running = !!run.running;
  $('#solve-all').disabled = running;
  $('#stop').disabled = !running;
  const ind = $('#run-indicator');
  if (running) {
    ind.textContent = run.currentName ? `solving ${run.currentName} (${run.done}/${run.total})` : `solving (${run.done}/${run.total})`;
    ind.className = 'run-indicator on';
    $('#prog-bar-wrap').hidden = false;
    const pct = run.total ? Math.round((run.done / run.total) * 100) : 0;
    $('#prog-bar-fill').style.width = pct + '%';
    $('#prog-bar-label').textContent = `${run.done}/${run.total}`;
  } else {
    ind.textContent = run.stopped ? 'stopped' : (run.finished ? 'done' : 'idle');
    ind.className = 'run-indicator';
    if (run.finished || run.stopped) $('#prog-bar-label').textContent = `${run.done}/${run.total} done`;
  }
}

// --- SSE ------------------------------------------------------------------
function connect() {
  const es = new EventSource('/api/progress/stream');
  es.addEventListener('open', () => ($('#console-meta').textContent = 'live'));
  es.addEventListener('error', () => ($('#console-meta').textContent = 'reconnecting…'));
  es.addEventListener('log', (e) => appendLog(JSON.parse(e.data)));
  es.addEventListener('status', (e) => {
    const ev = JSON.parse(e.data);
    if (ev.record && (inScope(ev.record) || state.colleges.has(ev.slug))) { merge(ev.record); render(); }
  });
  es.addEventListener('run', (e) => applyRun(JSON.parse(e.data)));
}

// --- actions --------------------------------------------------------------
const solve = (slug) => fetch(`/api/impossibles/solve/${encodeURIComponent(slug)}`, { method: 'POST' });
async function loadLog(slug) {
  const { record } = await fetch(`/api/progress/college/${encodeURIComponent(slug)}`).then((r) => r.json());
  $('#console').innerHTML = '';
  if (!record || !record.log?.length) { appendLog({ name: slug, msg: '(no log yet — hit Solve)', t: new Date().toISOString() }); return; }
  for (const l of record.log) appendLog({ name: record.name, msg: l.msg, t: l.t });
}

function init() {
  $('#solve-all').addEventListener('click', () => fetch('/api/impossibles/solve-all', { method: 'POST' }));
  $('#stop').addEventListener('click', () => fetch('/api/progress/stop', { method: 'POST' }));
  $('#clear-log').addEventListener('click', () => ($('#console').innerHTML = ''));
  $('#filter').addEventListener('input', (e) => { state.filter = e.target.value; render(); });
  $('#grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const slug = btn.closest('.prog-row').dataset.slug;
    if (btn.dataset.act === 'solve') solve(slug);
    else loadLog(slug);
  });

  connect();
  loadInitial().then(() => {
    const wanted = new URLSearchParams(location.search).get('college');
    if (wanted && state.colleges.has(wanted)) { state.filter = wanted; $('#filter').value = wanted; render(); solve(wanted); }
  });
}

init();

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// status -> { label, dot color class, order }
const STATUS = {
  running:    { label: 'running',    cls: 'st-running',    order: 0 },
  live:       { label: 'live',       cls: 'st-live',       order: 1 },
  blocked:    { label: 'blocked',    cls: 'st-blocked',    order: 2 },
  impossible: { label: 'impossible', cls: 'st-impossible', order: 3 },
  error:      { label: 'error',      cls: 'st-error',      order: 4 },
  pending:    { label: 'pending',    cls: 'st-pending',    order: 5 },
};

const state = {
  colleges: new Map(), // slug -> merged record
  filter: '',
  run: { running: false, currentSlug: null, done: 0, total: 0 },
  maxLog: 1500,
};

// --- merge sources --------------------------------------------------------
function mergeCollege(c) {
  const prev = state.colleges.get(c.slug) || {};
  state.colleges.set(c.slug, { ...prev, ...c });
}

async function loadInitial() {
  const [colleges, prog] = await Promise.all([
    fetch('/api/colleges').then((r) => r.json()),
    fetch('/api/progress').then((r) => r.json()),
  ]);
  for (const c of colleges.colleges) {
    mergeCollege({
      slug: c.slug, name: c.name, url: c.url,
      status: c.live ? 'live' : 'pending',
      courseCount: c.course_count || 0, attempts: 0, note: c.last_status || '',
    });
  }
  for (const r of prog.colleges) {
    mergeCollege(r); // progress record overrides (real status, attempts, note…)
  }
  applyRun(prog.run || {});
  render();
}

// --- rendering ------------------------------------------------------------
function counts() {
  const c = { running: 0, live: 0, blocked: 0, impossible: 0, error: 0, pending: 0 };
  for (const r of state.colleges.values()) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}

function renderSummary() {
  const c = counts();
  const total = state.colleges.size;
  $('#summary').textContent =
    `${c.live} live · ${c.blocked} blocked · ${c.impossible} impossible · ${c.pending} pending · ${total} colleges`;
  $('#status-tiles').innerHTML = Object.entries(STATUS)
    .map(([k, m]) => `<div class="tile ${m.cls}"><span class="tn">${c[k] || 0}</span><span class="tl">${m.label}</span></div>`)
    .join('');
}

function row(r) {
  const m = STATUS[r.status] || STATUS.pending;
  const cc = r.courseCount ? `<span class="rc">${Number(r.courseCount).toLocaleString()} courses</span>` : '';
  const link = r.status === 'live'
    ? `<a class="btn ghost small" href="/search.html?college=${encodeURIComponent(r.slug)}">Search</a>` : '';
  const note = r.note ? `<div class="pr-note">${esc(r.note)}</div>` : '';
  const busy = r.status === 'running';
  return `<div class="prog-row ${m.cls}" data-slug="${esc(r.slug)}">
    <div class="pr-main">
      <div class="pr-name"><span class="pr-dot"></span>${esc(r.name)}
        <span class="pr-badge ${m.cls}">${m.label}</span>
        ${r.attempts ? `<span class="pr-att">·&nbsp;${r.attempts} attempt${r.attempts > 1 ? 's' : ''}</span>` : ''}
      </div>
      ${note}
    </div>
    <div class="pr-right">
      ${cc}
      ${link}
      <button class="btn small" data-act="run" ${busy ? 'disabled' : ''}>${busy ? '…' : 'Run'}</button>
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
  $('#grid').innerHTML = rows.map(row).join('') || '<p class="empty small">No matching colleges.</p>';
}

// --- live log console -----------------------------------------------------
function pad(n) { return String(n).padStart(2, '0'); }
function clock(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function lineClass(msg) {
  if (msg.includes('✅')) return 'lg-ok';
  if (msg.includes('🔒')) return 'lg-blocked';
  if (msg.includes('🚫')) return 'lg-bad';
  if (msg.includes('⚠') || /error|failed/i.test(msg)) return 'lg-warn';
  if (msg.startsWith('▶') || msg.startsWith('Attempt')) return 'lg-step';
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
  state.run = { ...state.run, ...run };
  const running = !!run.running;
  $('#run-all').disabled = running;
  $('#stop').disabled = !running;
  const ind = $('#run-indicator');
  if (running) {
    ind.textContent = run.currentName
      ? `running ${run.currentName} (${run.done}/${run.total})`
      : `running (${run.done}/${run.total})`;
    ind.className = 'run-indicator on';
    $('#prog-bar-wrap').hidden = false;
    const pct = run.total ? Math.round((run.done / run.total) * 100) : 0;
    $('#prog-bar-fill').style.width = pct + '%';
    $('#prog-bar-label').textContent = `${run.done}/${run.total}`;
  } else {
    ind.textContent = run.stopped ? 'stopped' : (run.finished ? 'done' : 'idle');
    ind.className = 'run-indicator';
    if (run.finished || run.stopped) {
      $('#prog-bar-label').textContent = `${run.done}/${run.total} done`;
    }
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
    if (ev.record) { mergeCollege(ev.record); render(); }
  });
  es.addEventListener('run', (e) => applyRun(JSON.parse(e.data)));
}

// --- actions --------------------------------------------------------------
async function runCollege(slug) {
  await fetch(`/api/progress/run/${encodeURIComponent(slug)}`, { method: 'POST' });
}
async function loadLog(slug) {
  const { record } = await fetch(`/api/progress/college/${encodeURIComponent(slug)}`).then((r) => r.json());
  $('#console').innerHTML = '';
  if (!record || !record.log?.length) { appendLog({ name: slug, msg: '(no log yet — hit Run)', t: new Date().toISOString() }); return; }
  for (const l of record.log) appendLog({ name: record.name, msg: l.msg, t: l.t });
}

function init() {
  $('#run-all').addEventListener('click', () => fetch('/api/progress/run-all', { method: 'POST' }));
  $('#stop').addEventListener('click', () => fetch('/api/progress/stop', { method: 'POST' }));
  $('#clear-log').addEventListener('click', () => ($('#console').innerHTML = ''));
  $('#filter').addEventListener('input', (e) => { state.filter = e.target.value; render(); });
  $('#grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const slug = btn.closest('.prog-row').dataset.slug;
    if (btn.dataset.act === 'run') runCollege(slug);
    else loadLog(slug);
  });

  connect();
  loadInitial().then(() => {
    // /progress.html?college=<slug> — focus + auto-run that college.
    const wanted = new URLSearchParams(location.search).get('college');
    if (wanted && state.colleges.has(wanted)) {
      state.filter = wanted; $('#filter').value = wanted; render();
      runCollege(wanted);
    }
  });
}

init();

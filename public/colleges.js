const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const state = { colleges: [], filter: '', tab: 'all' };

async function loadColleges() {
  const { colleges } = await fetch('/api/colleges').then((r) => r.json());
  state.colleges = colleges;
  render();
}

async function loadStats() {
  const s = await fetch('/api/stats').then((r) => r.json());
  const pending = s.colleges - s.liveColleges;
  $('#stats').textContent =
    `${s.liveColleges} live · ${pending} not live · ${s.courses.toLocaleString()} real courses across ${s.colleges} colleges`;
}

function row(c) {
  const status = c.last_status ? esc(c.last_status) : (c.live ? 'live' : 'no real data yet');
  const count = c.live ? `<span class="rc">${c.course_count.toLocaleString()} courses</span>` : `<span class="rc muted">0 courses</span>`;
  const searchLink = c.live
    ? `<a class="btn ghost" href="/search.html?college=${encodeURIComponent(c.slug)}">Search</a>`
    : '';
  const site = c.url ? `<a class="site" href="${esc(c.url)}" target="_blank" rel="noopener">site ↗</a>` : '';
  return `<div class="college-row ${c.live ? 'is-live' : 'is-pending'}" data-slug="${esc(c.slug)}">
    <div class="cr-main">
      <div class="cr-name"><span class="cr-dot"></span>${esc(c.name)} ${site}</div>
      <div class="cr-status">${status}</div>
    </div>
    <div class="cr-right">
      ${count}
      ${searchLink}
      <button class="btn" data-act="scrape">Scrape</button>
      <button class="btn ghost" data-act="learn">Re-learn</button>
    </div>
  </div>`;
}

function render() {
  const f = state.filter.toLowerCase();
  const match = (c) => !f || c.name.toLowerCase().includes(f) || c.slug.includes(f);

  const live = state.colleges.filter((c) => c.live && match(c)).sort((a, b) => b.course_count - a.course_count);
  const pending = state.colleges.filter((c) => !c.live && match(c)).sort((a, b) => a.name.localeCompare(b.name));

  $('#live-count').textContent = `(${live.length})`;
  $('#pending-count').textContent = `(${pending.length})`;
  $('#list-live').innerHTML = live.map(row).join('') || `<p class="empty small">No matching live colleges.</p>`;
  $('#list-pending').innerHTML = pending.map(row).join('') || `<p class="empty small">No matching colleges.</p>`;

  $('#group-live').style.display = state.tab === 'pending' ? 'none' : '';
  $('#group-pending').style.display = state.tab === 'live' ? 'none' : '';
}

async function runAction(slug, act, btn) {
  const rowEl = btn.closest('.college-row');
  const buttons = rowEl.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  const statusEl = rowEl.querySelector('.cr-status');
  const original = statusEl.textContent;
  statusEl.textContent = act === 'scrape' ? 'scraping…' : 're-learning…';
  rowEl.classList.add('busy');

  try {
    const url = act === 'scrape' ? `/api/update/${encodeURIComponent(slug)}` : `/api/learn/${encodeURIComponent(slug)}`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();

    if (act === 'scrape') {
      if (data.ok) {
        statusEl.textContent = `ok: ${data.count} courses via ${data.type}`;
      } else {
        statusEl.textContent = `error: ${data.error || 'failed'}`;
      }
    } else {
      const r = data.recipe || {};
      statusEl.textContent = r.sampleCount > 0
        ? `learned: ${r.sampleCount} courses found ← ${r.extractUrl || ''}`
        : `learned: no server-rendered courses (${(r.candidates || []).length} links)`;
    }
    // Refresh truth from the server so live/pending grouping + counts update.
    await loadColleges();
    await loadStats();
  } catch (err) {
    statusEl.textContent = `error: ${err.message}`;
    rowEl.classList.remove('busy');
    buttons.forEach((b) => (b.disabled = false));
  }
}

function init() {
  $('#filter').addEventListener('input', (e) => { state.filter = e.target.value; render(); });
  $('#seg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    document.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const slug = btn.closest('.college-row').dataset.slug;
    runAction(slug, btn.dataset.act, btn);
  });

  loadColleges();
  loadStats();
}

init();

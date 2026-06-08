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
      <button class="btn ghost" data-act="learn-search" title="Search the web for this college's class schedule, then learn from the results">Search &amp; learn</button>
      <a class="btn ghost" href="/progress.html?college=${encodeURIComponent(c.slug)}" title="Auto-scrape this college (HTTP → web search → headless browser) on the Progress tab, with a live log.">Auto-scrape ↗</a>
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
  // Auto-scrape lives on the Progress tab (/progress.html) — these are the quick in-row actions.
  const ENDPOINTS = {
    scrape: '/api/update/',
    learn: '/api/learn/',
    'learn-search': '/api/learn-search/',
  };
  const BUSY = {
    scrape: 'scraping…',
    learn: 're-learning…',
    'learn-search': 'searching the web…',
  };
  statusEl.textContent = BUSY[act] || 'working…';
  rowEl.classList.add('busy');

  try {
    const url = `${ENDPOINTS[act]}${encodeURIComponent(slug)}`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();

    if (act === 'scrape') {
      if (data.ok) {
        statusEl.textContent = `ok: ${data.count} courses via ${data.type}`;
      } else {
        statusEl.textContent = `error: ${data.error || 'failed'}`;
      }
    } else {
      // All learn flows return { recipe }.
      const r = data.recipe || {};
      const via = act === 'learn-search' ? ` (web search: ${(r.searchResults || []).length} results)` : '';
      if (r.blocked === 'login') {
        statusEl.textContent = `🔒 blocked: sign-in required${via}`;
      } else if (r.sampleCount > 0) {
        const how = r.method === 'browser' ? ' [browser]' : '';
        statusEl.textContent = `learned${how}${via}: ${r.sampleCount} courses found ← ${r.extractUrl || ''}`;
      } else {
        statusEl.textContent = `learned${via}: no courses found (${(r.candidates || []).length} links)`;
      }
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

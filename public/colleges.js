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

// Human label for where this college's data came from.
function sourceLabel(c) {
  const mixed = c.cvc_count > 0 && c.site_count > 0;
  if (mixed) return 'college site + CVC online';
  if (c.scrape_type === 'cvc') return 'CVC Exchange (online only)';
  if (c.scrape_type === 'colleague') return 'college site · Colleague Self-Service';
  if (['html', 'auto', 'browser', 'college'].includes(c.scrape_type)) return 'college website';
  return '—';
}

// Modality breakdown line: "472 in-person · 15 online · 2 hybrid".
function modalityLine(c) {
  const parts = [];
  if (c.in_person_count) parts.push(`${c.in_person_count.toLocaleString()} in-person`);
  if (c.online_count) parts.push(`${c.online_count.toLocaleString()} online`);
  if (c.hybrid_count) parts.push(`${c.hybrid_count.toLocaleString()} hybrid`);
  return parts.join(' · ') || 'no breakdown';
}

function row(c) {
  // A college whose only data is CVC's online subset has an incomplete catalog
  // (no in-person sections) — flag it honestly.
  const onlineOnly = c.live && c.scrape_type === 'cvc';
  const status = c.last_status ? esc(c.last_status) : (c.live ? 'live' : 'no real data yet');
  const count = c.live
    ? `<span class="rc">${c.course_count.toLocaleString()} courses</span>`
    : `<span class="rc muted">0 courses</span>`;
  const searchLink = c.live
    ? `<a class="btn ghost" href="/search.html?college=${encodeURIComponent(c.slug)}">View courses</a>`
    : '';
  const site = c.url ? `<a class="site" href="${esc(c.url)}" target="_blank" rel="noopener">site ↗</a>` : '';
  const incomplete = onlineOnly
    ? `<span class="badge warn" title="We only have CVC's online listings for this college — the full (in-person) catalog isn't sourced yet.">⚠ online only — full catalog pending</span>`
    : '';
  const meta = c.live
    ? `<div class="cr-meta">
         <span class="badge src">from: ${esc(sourceLabel(c))}</span>
         <span class="cr-mods">${esc(modalityLine(c))}</span>
         ${incomplete}
       </div>`
    : '';
  return `<div class="college-row ${c.live ? 'is-live' : 'is-pending'}" data-slug="${esc(c.slug)}">
    <div class="cr-main">
      <div class="cr-name"><span class="cr-dot"></span>${esc(c.name)} ${site}</div>
      <div class="cr-status">${status}</div>
      ${meta}
    </div>
    <div class="cr-right">
      ${count}
      ${searchLink}
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

function init() {
  $('#filter').addEventListener('input', (e) => { state.filter = e.target.value; render(); });
  $('#seg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    document.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });

  loadColleges();
  loadStats();
}

init();

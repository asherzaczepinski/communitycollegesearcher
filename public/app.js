const $ = (sel) => document.querySelector(sel);

const state = { q: '', modality: 'all', college: 'all', transfer: '', ztc: false, quality: false };

const MODALITY_ORDER = ['in_person', 'online', 'hybrid'];
const MODALITY_LABELS = { in_person: 'In Person', online: 'Online', hybrid: 'Hybrid' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadColleges() {
  const res = await fetch('/api/colleges');
  const { colleges } = await res.json();
  const sel = $('#college');
  // Only live colleges (real scraped data) are searchable, so only list those.
  for (const c of colleges.filter((c) => c.live)) {
    const opt = document.createElement('option');
    opt.value = c.slug;
    opt.textContent = `${c.name} (${c.course_count})`;
    sel.appendChild(opt);
  }
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const s = await res.json();
  const byMod = Object.fromEntries(s.byModality.map((m) => [m.modality, m.n]));
  $('#stats').textContent =
    `${s.liveColleges} live colleges · ${s.courses.toLocaleString()} real courses · ` +
    `${byMod.in_person || 0} in person · ${byMod.online || 0} online · ${byMod.hybrid || 0} hybrid`;
}

function card(c) {
  const code = c.code ? `<span class="code">${esc(c.code)}</span> ` : '';
  const meta = [c.units ? `${esc(c.units)} units` : '', c.instructor ? `Prof. ${esc(c.instructor)}` : '', c.section ? `Sec ${esc(c.section)}` : '', c.term ? esc(c.term) : '']
    .filter(Boolean).join(' · ');
  const collegeLink = c.college_url
    ? `<a href="${esc(c.college_url)}" target="_blank" rel="noopener">${esc(c.college_name)}</a>`
    : esc(c.college_name);

  // Rich CVC metadata: transferability areas, tuition, course badges.
  const m = c.meta || {};
  const chips = [];
  (m.transferable || []).forEach((t) => chips.push(`<span class="chip transfer">${esc(t)}</span>`));
  if (m.tuition != null) chips.push(`<span class="chip tuition">$${esc(m.tuition)}</span>`);
  if (m.zeroTextbookCost) chips.push(`<span class="chip ztc" title="Zero Textbook Cost">$0 books</span>`);
  if (m.qualityReviewed) chips.push(`<span class="chip quality" title="Quality Reviewed">★ Quality Reviewed</span>`);
  const chipRow = chips.length ? `<div class="chips-row">${chips.join('')}</div>` : '';

  // Specific GE / A–G areas this course satisfies (e.g. "CSU B2", "IGETC 5B").
  const ga = m.geAreas || {};
  const areaChips = [];
  const SYS = { csu: 'CSU', igetc: 'IGETC', calGetc: 'Cal-GETC' };
  for (const [k, label] of Object.entries(SYS)) {
    (ga[k] || []).forEach((area) => {
      const code = String(area).split(' ')[0]; // "B2 Life Science" -> "B2"
      areaChips.push(`<span class="chip area" title="${esc(label)} ${esc(area)}">${label} ${esc(code)}</span>`);
    });
  }
  const areaRow = areaChips.length
    ? `<div class="chips-row areas"><span class="chips-lab">Satisfies:</span>${areaChips.join('')}</div>` : '';
  // Where this specific course came from.
  const sourceTag = c.source === 'cvc'
    ? `<span class="src cvc" title="From the CVC Exchange — an online course available to CA community college students">● CVC online</span>`
    : c.source === 'colleague'
      ? `<span class="src real" title="Scraped live from the college's Colleague Self-Service catalog">● college site</span>`
      : `<span class="src real" title="Scraped live from the college site">● college site</span>`;
  return `<div class="card">
    <div class="row1">
      <div>${code}<span class="title">${esc(c.title)}</span></div>
      <span class="badge ${c.modality}">${MODALITY_LABELS[c.modality] || c.modality}</span>
    </div>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    ${chipRow}
    ${areaRow}
    <div class="college">${collegeLink} ${sourceTag}</div>
  </div>`;
}

function render(results) {
  const box = $('#results');
  if (!results.length) {
    box.innerHTML = `<p class="empty">No courses found. Try another search term or modality.</p>`;
    return;
  }
  const groups = { in_person: [], online: [], hybrid: [] };
  for (const r of results) (groups[r.modality] || (groups[r.modality] = [])).push(r);

  box.innerHTML = MODALITY_ORDER
    .filter((m) => groups[m] && groups[m].length)
    .map(
      (m) => `<section class="modality-group">
        <h2><span class="dot ${m}"></span>${MODALITY_LABELS[m]} <span class="result-meta">(${groups[m].length})</span></h2>
        ${groups[m].map(card).join('')}
      </section>`
    )
    .join('');
}

let timer;
async function search() {
  const params = new URLSearchParams({ q: state.q, modality: state.modality, college: state.college });
  if (state.transfer) params.set('transfer', state.transfer);
  if (state.ztc) params.set('ztc', '1');
  if (state.quality) params.set('quality', '1');
  $('#result-meta').textContent = 'Searching…';
  const res = await fetch(`/api/search?${params}`);
  const { count, results } = await res.json();
  $('#result-meta').textContent = state.q || state.modality !== 'all' || state.college !== 'all'
    ? `${count} result${count === 1 ? '' : 's'}${count >= 500 ? ' (showing first 500)' : ''}`
    : `Showing ${count} courses — type above to narrow down`;
  render(results);
}

function debouncedSearch() {
  clearTimeout(timer);
  timer = setTimeout(search, 180);
}

function init() {
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); search(); });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; debouncedSearch(); });
  $('#college').addEventListener('change', (e) => { state.college = e.target.value; search(); });
  $('#modality-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-modality]');
    if (!btn) return;
    state.modality = btn.dataset.modality;
    document.querySelectorAll('#modality-filter button').forEach((b) => b.classList.toggle('active', b === btn));
    search();
  });
  $('#transfer-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-transfer]');
    if (!btn) return;
    state.transfer = btn.dataset.transfer;
    document.querySelectorAll('#transfer-filter button').forEach((b) => b.classList.toggle('active', b === btn));
    search();
  });
  $('#ztc').addEventListener('change', (e) => { state.ztc = e.target.checked; search(); });
  $('#quality').addEventListener('change', (e) => { state.quality = e.target.checked; search(); });

  // Honor deep-links from the homepage: /search.html?college=<slug>&q=<term>
  const params = new URLSearchParams(location.search);
  const preCollege = params.get('college');
  const preQ = params.get('q');
  if (preQ) { state.q = preQ; $('#q').value = preQ; }

  loadColleges().then(() => {
    if (preCollege && $(`#college option[value="${CSS.escape(preCollege)}"]`)) {
      state.college = preCollege;
      $('#college').value = preCollege;
    }
    search();
  });
  loadStats();
}

init();

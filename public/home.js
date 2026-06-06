const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function load() {
  const [statsRes, collegesRes] = await Promise.all([
    fetch('/api/stats').then((r) => r.json()),
    fetch('/api/colleges').then((r) => r.json()),
  ]);

  const s = statsRes;
  const live = collegesRes.colleges.filter((c) => c.live);
  const pending = collegesRes.colleges.length - live.length;

  $('#stat-live').textContent = s.liveColleges;
  $('#stat-courses').textContent = (s.courses || 0).toLocaleString();
  $('#stat-pending').textContent = pending;

  const byMod = Object.fromEntries(s.byModality.map((m) => [m.modality, m.n]));
  $('#modline').innerHTML =
    `<span class="dot in_person"></span>${(byMod.in_person || 0).toLocaleString()} in person &nbsp; ` +
    `<span class="dot online"></span>${(byMod.online || 0).toLocaleString()} online &nbsp; ` +
    `<span class="dot hybrid"></span>${(byMod.hybrid || 0).toLocaleString()} hybrid`;

  // Working colleges, biggest first.
  const sorted = [...live].sort((a, b) => b.course_count - a.course_count);
  $('#working-count').textContent = `(${live.length})`;
  $('#working').innerHTML = sorted
    .map(
      (c) => `<a class="chip" href="/search.html?college=${encodeURIComponent(c.slug)}" title="${esc(c.last_status || '')}">
        <span class="chip-dot"></span>${esc(c.name)}<span class="chip-n">${c.course_count.toLocaleString()}</span>
      </a>`
    )
    .join('');
}

load();

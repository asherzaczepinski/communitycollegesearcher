'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MODALITIES = [
  ['all', 'All'], ['in_person', 'In person'], ['online', 'Online'], ['hybrid', 'Hybrid'],
];
const TRANSFERS = [
  ['', 'Any'], ['igetc', 'IGETC'], ['calgetc', 'Cal-GETC'], ['csu', 'CSU Breadth'],
];
const PAGE = 60;

const blank = {
  q: '', college: 'all', modality: 'all', transfer: '', area: '',
  ztc: false, quality: false, format: '', unitsMin: '', unitsMax: '', sort: 'relevance',
};

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Searcher() {
  const [f, setF] = useState(blank);
  const [options, setOptions] = useState({ colleges: [], geAreas: { csu: [], igetc: [], calGetc: [] } });
  const [data, setData] = useState({ results: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); setOffset(0); };
  const debouncedQ = useDebounced(f.q, 250);

  useEffect(() => {
    fetch('/api/options').then((r) => r.json()).then(setOptions).catch(() => {});
  }, []);

  const queryString = useCallback((off) => {
    const sp = new URLSearchParams();
    if (debouncedQ) sp.set('q', debouncedQ);
    if (f.college !== 'all') sp.set('college', f.college);
    if (f.modality !== 'all') sp.set('modality', f.modality);
    if (f.transfer) sp.set('transfer', f.transfer);
    if (f.area) sp.set('area', f.area);
    if (f.ztc) sp.set('ztc', '1');
    if (f.quality) sp.set('quality', '1');
    if (f.format) sp.set('format', f.format);
    if (f.unitsMin) sp.set('unitsMin', f.unitsMin);
    if (f.unitsMax) sp.set('unitsMax', f.unitsMax);
    sp.set('sort', f.sort);
    sp.set('limit', String(PAGE));
    sp.set('offset', String(off));
    return sp.toString();
  }, [debouncedQ, f]);

  // Run search whenever filters change (offset 0).
  useEffect(() => {
    setLoading(true);
    const qs = queryString(0);
    fetch(`/api/search?${qs}`).then((r) => r.json()).then((d) => {
      setData(d); setOffset(0); setLoading(false);
    }).catch(() => setLoading(false));
  }, [queryString]);

  const loadMore = async () => {
    const next = offset + PAGE;
    const d = await fetch(`/api/search?${queryString(next)}`).then((r) => r.json());
    setData((prev) => ({ total: d.total, results: [...prev.results, ...d.results] }));
    setOffset(next);
  };

  const areaOptions = useMemo(() => {
    const out = [];
    const add = (sys, label, list) => list.forEach((a) => out.push([`${sys}|${a}`, `${label} ${a}`]));
    add('csu', 'CSU', options.geAreas.csu);
    add('igetc', 'IGETC', options.geAreas.igetc);
    add('calgetc', 'Cal-GETC', options.geAreas.calGetc);
    return out;
  }, [options]);

  const hasMore = data.results.length < data.total;

  return (
    <>
      <div className="searchbar">
        <input
          type="search" autoFocus value={f.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Search a course — e.g. “general biology”, “calculus”, “BIOL 105”, “nursing”…"
        />
      </div>

      <aside className="filters">
        <div className="fgroup">
          <h3>College</h3>
          <select value={f.college} onChange={(e) => set('college', e.target.value)}>
            <option value="all">All colleges</option>
            {options.colleges.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name} ({c.course_count})</option>
            ))}
          </select>
        </div>

        <div className="fgroup">
          <h3>Format</h3>
          <div className="seg">
            {MODALITIES.map(([v, l]) => (
              <button key={v} className={f.modality === v ? 'on' : ''} onClick={() => set('modality', v)}>{l}</button>
            ))}
          </div>
          <select value={f.format} onChange={(e) => set('format', e.target.value)} style={{ marginTop: 10 }}>
            <option value="">Online: any schedule</option>
            <option value="Asynchronous">Asynchronous (no set times)</option>
            <option value="Synchronous">Synchronous (live online)</option>
          </select>
        </div>

        <div className="fgroup">
          <h3>Transfers to</h3>
          <div className="seg">
            {TRANSFERS.map(([v, l]) => (
              <button key={v} className={f.transfer === v ? 'on' : ''} onClick={() => set('transfer', v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="fgroup">
          <h3>Satisfies GE area</h3>
          <select value={f.area} onChange={(e) => set('area', e.target.value)}>
            <option value="">Any area</option>
            {areaOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="fgroup">
          <h3>Units</h3>
          <div className="units-row">
            <input type="number" min="0" step="0.5" placeholder="min" value={f.unitsMin} onChange={(e) => set('unitsMin', e.target.value)} />
            <span>to</span>
            <input type="number" min="0" step="0.5" placeholder="max" value={f.unitsMax} onChange={(e) => set('unitsMax', e.target.value)} />
          </div>
        </div>

        <div className="fgroup">
          <h3>Cost & quality</h3>
          <label className="check"><input type="checkbox" checked={f.ztc} onChange={(e) => set('ztc', e.target.checked)} /> Zero textbook cost</label>
          <label className="check"><input type="checkbox" checked={f.quality} onChange={(e) => set('quality', e.target.checked)} /> Quality reviewed</label>
        </div>

        <button className="clear-btn" onClick={() => { setF(blank); setOffset(0); }}>Clear all filters</button>
      </aside>

      <section>
        <div className="results-head">
          <span className="count">
            {loading ? 'Searching…' : `${data.total.toLocaleString()} course${data.total === 1 ? '' : 's'}`}
          </span>
          <label>
            Sort:&nbsp;
            <select value={f.sort} onChange={(e) => set('sort', e.target.value)}>
              <option value="relevance">College A–Z</option>
              <option value="title">Course title</option>
              <option value="units">Most units</option>
              <option value="tuition">Lowest tuition</option>
            </select>
          </label>
        </div>

        {loading && data.results.length === 0 ? (
          <div className="skeleton">Searching the catalog…</div>
        ) : data.results.length === 0 ? (
          <div className="empty">No courses match these filters. Try widening your search.</div>
        ) : (
          <>
            {data.results.map((c, i) => <Card key={`${c.college_slug}-${c.code}-${i}`} c={c} />)}
            {hasMore && <button className="loadmore" onClick={loadMore}>Show more courses</button>}
          </>
        )}
      </section>
    </>
  );
}

function Card({ c }) {
  const [open, setOpen] = useState(false);
  const m = c.meta || {};
  const ga = m.geAreas || {};
  const SYS = { csu: 'CSU', igetc: 'IGETC', calGetc: 'Cal-GETC' };
  const areaChips = [];
  for (const [k, label] of Object.entries(SYS)) {
    (ga[k] || []).forEach((a) => areaChips.push(`${label} ${String(a).split(' ')[0]}`));
  }
  const metaBits = [
    c.units ? `${c.units} units` : '', c.instructor ? c.instructor : '',
    c.term || '', m.tuition != null ? `$${m.tuition}` : '',
  ].filter(Boolean).join('  ·  ');
  const sections = m.sections || [];

  return (
    <div className="card">
      <div className="top">
        <div>
          <div><span className="code">{c.code}</span><span className="title">{c.title}</span></div>
          <div className="college">
            {c.college_url ? <a href={c.college_url} target="_blank" rel="noopener">{c.college}</a> : c.college}
          </div>
        </div>
        <span className={`pill ${c.modality}`}>
          {c.modality === 'in_person' ? 'In person' : c.modality === 'online' ? 'Online' : 'Hybrid'}
        </span>
      </div>

      {metaBits && <div className="metaline">{metaBits}</div>}

      <div className="chips">
        {(m.transferable || []).map((t) => <span key={t} className="chip transfer">{t}</span>)}
        {m.zeroTextbookCost && <span className="chip ztc">$0 textbooks</span>}
        {m.qualityReviewed && <span className="chip quality">★ Quality reviewed</span>}
        {(m.formats || []).map((ft) => <span key={ft} className="chip fmt">{ft}</span>)}
      </div>

      {areaChips.length > 0 && (
        <div className="chips">
          <span className="chips-lab">Satisfies:</span>
          {areaChips.map((a) => <span key={a} className="chip area">{a}</span>)}
        </div>
      )}

      {(c.description || sections.length > 0) && (
        <>
          <button className="details-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : `Details${sections.length ? ` · ${sections.length} section${sections.length === 1 ? '' : 's'}` : ''}`}
          </button>
          {open && (
            <div className="sections">
              {c.description && <p style={{ marginTop: 0, color: 'var(--muted)' }}>{c.description}</p>}
              {m.prerequisites && <p style={{ color: 'var(--muted)' }}><strong>Prerequisites:</strong> {m.prerequisites}</p>}
              {sections.length > 0 && (
                <table>
                  <thead><tr><th>Section</th><th>Dates</th><th>Instructor</th><th>Format</th></tr></thead>
                  <tbody>
                    {sections.map((s, i) => (
                      <tr key={i}>
                        <td>{s.crn || '—'}</td><td>{s.dates || '—'}</td>
                        <td>{s.professor || 'TBA'}</td><td>{s.format || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// We only have a VERIFIED modality signal for CVC (online) courses. ASSIST
// courses don't record modality, so we don't claim In-person/Hybrid — they're
// shown as "modality varies". The filter therefore offers only All / Online.
const MODALITIES = [
  ['all', 'All'], ['online', 'Online'],
];
const TRANSFERS = [
  ['', 'Any'], ['uc', 'UC'], ['igetc', 'IGETC'], ['calgetc', 'Cal-GETC'], ['csu', 'CSU Breadth'],
];
const PAGE = 60;

const blank = {
  q: '', subject: '', college: 'all', modality: 'all', transfer: '',
  ztc: false, quality: false, cid: false, format: '', sort: 'relevance',
};

// "2026-08-16T23:03:32Z" → "August 16, 2026" (empty string if unparseable).
function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function Spinner({ big }) {
  return <span className={big ? 'spinner big' : 'spinner'} role="status" aria-label="Loading" />;
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Searcher() {
  const [f, setF] = useState(blank);
  const [options, setOptions] = useState({ colleges: [], subjects: [], lastUpdated: '', geAreas: { csu: [], igetc: [], calGetc: [] } });
  const [data, setData] = useState({ results: [], total: null });
  const [loading, setLoading] = useState(true);       // first page of a new search
  const [moreLoading, setMoreLoading] = useState(false); // appending the next page
  const [reachedEnd, setReachedEnd] = useState(false);   // last page came back short
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [loc, setLoc] = useState(null);        // { lat, lng, label }
  const [locStatus, setLocStatus] = useState('');
  const [zip, setZip] = useState('');

  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); setOffset(0); };
  const debouncedQ = useDebounced(f.q, 250);

  const applyLoc = (l) => { setLoc(l); setLocStatus(''); setF((s) => ({ ...s, sort: 'nearest' })); setOffset(0); };
  const geocodeZip = async () => {
    if (!zip.trim()) return;
    setLocStatus('Finding…');
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(zip)}`).then((x) => x.json());
      if (r.lat) applyLoc({ lat: r.lat, lng: r.lng, label: r.label || zip });
      else setLocStatus('Place not found');
    } catch { setLocStatus('Lookup failed'); }
  };
  const clearLoc = () => { setLoc(null); setLocStatus(''); setZip(''); setF((s) => ({ ...s, sort: 'relevance' })); setOffset(0); };

  useEffect(() => {
    setOptionsLoading(true);
    fetch('/api/options').then((r) => r.json()).then(setOptions)
      .catch(() => {}).finally(() => setOptionsLoading(false));
  }, []);

  // Build the query from the DEBOUNCED text + the live filters. Depends on the
  // individual filter fields (NOT the whole `f`, and NOT the raw f.q) so typing a
  // letter doesn't fire a search with a stale debounced value — only the settled
  // text or a real filter change does.
  const queryString = useCallback((off) => {
    const sp = new URLSearchParams();
    if (debouncedQ) sp.set('q', debouncedQ);
    if (f.subject) sp.set('subject', f.subject);
    if (f.college !== 'all') sp.set('college', f.college);
    if (f.modality !== 'all') sp.set('modality', f.modality);
    if (f.transfer) sp.set('transfer', f.transfer);
    if (f.ztc) sp.set('ztc', '1');
    if (f.quality) sp.set('quality', '1');
    if (f.cid) sp.set('cid', '1');
    if (f.format) sp.set('format', f.format);
    if (loc) { sp.set('lat', String(loc.lat)); sp.set('lng', String(loc.lng)); }
    sp.set('sort', f.sort);
    sp.set('limit', String(PAGE));
    sp.set('offset', String(off));
    return sp.toString();
  }, [debouncedQ, f.subject, f.college, f.modality, f.transfer, f.ztc, f.quality, f.cid, f.format, f.sort, loc]);

  // Race guard: only the most recent request is allowed to update the results,
  // so an out-of-order response can never leave stale results on screen.
  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setReachedEnd(false);

    // Page 1 of results — fast (the API no longer counts on this path), so the
    // list paints as soon as this lands instead of waiting on the full-table count.
    fetch(`/api/search?${queryString(0)}`).then((r) => r.json()).then((d) => {
      if (id !== reqId.current) return; // a newer search superseded this one
      setData({ results: d.results, total: null });
      setReachedEnd(d.results.length < PAGE); // a short page means there's no more
      setOffset(0);
      setLoading(false);
    }).catch(() => { if (id === reqId.current) setLoading(false); });

    // Total count — the slow full-scan query, fetched IN PARALLEL purely to fill
    // the "N courses" label. The list never blocks on it.
    fetch(`/api/search?${queryString(0)}&countOnly=1`).then((r) => r.json()).then((d) => {
      if (id !== reqId.current) return;
      setData((prev) => ({ ...prev, total: d.total }));
    }).catch(() => {});
  }, [queryString]);

  // Append the next page. Guarded by a ref so the scroll observer can't fire it
  // twice, and by reqId so a page that lands after the filters changed is dropped.
  const loadingMoreRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || reachedEnd || loading) return;
    loadingMoreRef.current = true;
    setMoreLoading(true);
    const id = reqId.current;
    const next = offset + PAGE;
    try {
      const d = await fetch(`/api/search?${queryString(next)}`).then((r) => r.json());
      if (id !== reqId.current) return; // filters changed mid-load — discard
      setData((prev) => ({ ...prev, results: [...prev.results, ...d.results] }));
      setReachedEnd(d.results.length < PAGE);
      setOffset(next);
    } catch {
      /* keep what we have; the sentinel will retry on the next scroll */
    } finally {
      loadingMoreRef.current = false;
      setMoreLoading(false);
    }
  }, [offset, reachedEnd, loading, queryString]);

  // Infinite scroll: auto-load the next page when a sentinel near the bottom of
  // the list scrolls into view (600px early, so new rows are ready before you hit
  // the end). The "Show more" button below stays as a manual fallback.
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '600px' },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [loadMore]);

  const hasMore = !reachedEnd && data.results.length > 0;
  const activeFilters = !!f.subject + (f.college !== 'all') + (f.modality !== 'all') + !!f.transfer
    + !!f.ztc + !!f.quality + !!f.cid + !!f.format;

  return (
    <>
      <div className="locbar">
        {loc ? (
          <span className="loc-on">📍 Showing in-person courses nearest <strong>{loc.label}</strong>
            <button className="loc-clear" onClick={clearLoc}>change</button>
          </span>
        ) : (
          <>
            <span className="loc-prompt">📍 Find in-person courses near you:</span>
            <input className="loc-zip" value={zip} onChange={(e) => setZip(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && geocodeZip()} placeholder="ZIP, city, or address" />
            <button className="loc-go" onClick={geocodeZip}>Set</button>
          </>
        )}
        {locStatus && <span className="loc-status">{locStatus}</span>}
      </div>

      <div className="masthead">
        <h1>California Community College <em>course searcher</em></h1>
        <p>Only colleges with a verified-complete catalog — every course links straight to its class page.</p>
        <p className="status">
          {options.lastUpdated && <>Data last updated <strong>{fmtDate(options.lastUpdated)}</strong> · </>}
          {options.colleges.length > 0 && <>{options.colleges.length} colleges · </>}
          Link not working? Email <a href="mailto:asherzac2020@gmail.com?subject=Course%20link%20not%20working">asherzac2020@gmail.com</a> (the database may need a reset).
        </p>
      </div>

      {/* Filters — subject, college, and everything else */}
      <div className="controls">
        <div className="ctrl">
          <span className="ctrl-label">Subject {optionsLoading && <Spinner />}</span>
          <select value={f.subject} onChange={(e) => set('subject', e.target.value)}>
            <option value="">All subjects</option>
            {options.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="ctrl">
          <span className="ctrl-label">College {optionsLoading && <Spinner />}</span>
          <select value={f.college} onChange={(e) => set('college', e.target.value)}>
            <option value="all">All colleges</option>
            {options.colleges.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="ctrl">
          <span className="ctrl-label">Format</span>
          <div className="toggles">
            {MODALITIES.map(([v, l]) => (
              <button key={v} className={f.modality === v ? 'on' : ''} onClick={() => set('modality', v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="ctrl">
          <span className="ctrl-label">Transfers to</span>
          <div className="toggles">
            {TRANSFERS.map(([v, l]) => (
              <button key={v || 'any'} className={f.transfer === v ? 'on' : ''} onClick={() => set('transfer', v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="ctrl">
          <span className="ctrl-label">Options</span>
          <div className="opts">
            {f.modality !== 'in_person' && (
              <select value={f.format} onChange={(e) => set('format', e.target.value)}>
                <option value="">Online: any schedule</option>
                <option value="Asynchronous">Asynchronous</option>
                <option value="Synchronous">Synchronous</option>
              </select>
            )}
            <label className="tick"><input type="checkbox" checked={f.ztc} onChange={(e) => set('ztc', e.target.checked)} /> Zero textbook cost</label>
            <label className="tick"><input type="checkbox" checked={f.quality} onChange={(e) => set('quality', e.target.checked)} /> Quality reviewed</label>
            <label className="tick"><input type="checkbox" checked={f.cid} onChange={(e) => set('cid', e.target.checked)} /> C-ID transfer-approved</label>
          </div>
        </div>

        {activeFilters > 0 && (
          <button className="clear" onClick={() => { setF(blank); setOffset(0); }}>Clear {activeFilters} filter{activeFilters === 1 ? '' : 's'}</button>
        )}
      </div>

      {/* Keyword search sits under the whole selector */}
      <div className="searchrow">
        <input
          type="search" value={f.q} onChange={(e) => set('q', e.target.value)}
          placeholder="Search a course — “general biology”, “calculus”, “BIOL 105”, “nursing”…"
        />
      </div>

      <div className="resbar">
        <span className="count">
          {loading
            ? 'Searching…'
            : data.total != null
              ? `${data.total.toLocaleString()} course${data.total === 1 ? '' : 's'}`
              : `${data.results.length.toLocaleString()}${reachedEnd ? '' : '+'} course${data.results.length === 1 ? '' : 's'}`}
        </span>
        <label className="sortby">
          Sort
          <select value={f.sort} onChange={(e) => set('sort', e.target.value)}>
            {loc && <option value="nearest">Nearest to me</option>}
            <option value="relevance">College A–Z</option>
            <option value="title">Course title</option>
            <option value="units">Most units</option>
            <option value="tuition">Lowest tuition</option>
          </select>
        </label>
      </div>

      {loading && data.results.length === 0 ? (
        <div className="note note-loading"><Spinner big /> Searching the catalog…</div>
      ) : data.results.length === 0 ? (
        <div className="note">No courses match these filters. Try widening your search.</div>
      ) : (
        <div className="list">
          {data.results.map((c, i) => <Row key={`${c.college_slug}-${c.code}-${i}`} c={c} />)}
          {hasMore && (
            <>
              {/* Invisible tripwire: scrolling near it auto-loads the next page. */}
              <div ref={sentinelRef} className="scroll-sentinel" aria-hidden="true" />
              <button className="loadmore" onClick={loadMore} disabled={moreLoading}>
                {moreLoading ? <><Spinner /> Loading…</> : 'Show more'}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Row({ c }) {
  const [open, setOpen] = useState(false);
  const m = c.meta || {};
  const ga = m.geAreas || {};
  const SYS = { csu: 'CSU', igetc: 'IGETC', calGetc: 'Cal-GETC' };
  const areaChips = [];
  for (const [k, label] of Object.entries(SYS)) {
    (ga[k] || []).forEach((a) => areaChips.push(`${label} ${String(a).split(' ')[0]}`));
  }
  const bits = [c.units ? `${c.units} units` : '', c.instructor || '', c.term || '', m.tuition != null ? `$${m.tuition}` : '']
    .filter(Boolean).join('   ·   ');
  const sections = m.sections || [];

  return (
    <article className="row">
      <div className="row-head">
        <h3>
          {c.url ? (
            <a className="course-link" href={c.url} target="_blank" rel="noopener">
              <span className="code">{c.code}</span>{c.title}
            </a>
          ) : (
            <><span className="code">{c.code}</span>{c.title}</>
          )}
        </h3>
        <div className="row-actions">
          <span className={`fmt ${c.modality}`}>{c.modality === 'online' ? 'Online' : c.modality === 'in_person' ? 'In person' : c.modality === 'hybrid' ? 'Hybrid' : 'Modality varies — check schedule'}</span>
          {c.url && <a className="openbtn" href={c.url} target="_blank" rel="noopener">Open up ↗</a>}
        </div>
      </div>
      <div className="row-college">
        {c.college_url ? <a href={c.college_url} target="_blank" rel="noopener">{c.college}</a> : c.college}
        {c.distance_mi != null && <span className="dist">· {c.distance_mi} mi away</span>}
        {c.last_scraped && <span className="updated">· updated {fmtDate(c.last_scraped)}</span>}
      </div>
      {bits && <div className="row-meta">{bits}</div>}
      {m.note && <div className="row-note">{m.note}</div>}

      {(m.transferable?.length || m.zeroTextbookCost || m.qualityReviewed || m.cIdApproved || m.ucTransferable || areaChips.length > 0) && (
        <div className="tags">
          {m.ucTransferable && <span className="tag uc" title="On this college's UC Transfer Course Agreement (ASSIST.org) — accepted for transfer credit at the University of California">UC transferable</span>}
          {m.cIdApproved && <span className="tag cid" title={m.cIdTitle ? `C-ID ${m.cId}: ${m.cIdTitle} — approved for transfer/articulation` : 'Approved for transfer/articulation'}>C-ID {m.cId}</span>}
          {(m.transferable || []).map((t) => <span key={t} className="tag transfer">{t}</span>)}
          {areaChips.map((a) => <span key={a} className="tag area">{a}</span>)}
          {m.zeroTextbookCost && <span className="tag ztc">$0 textbooks</span>}
          {m.qualityReviewed && <span className="tag quality">Quality reviewed</span>}
          {(m.formats || []).map((ft) => <span key={ft} className="tag">{ft}</span>)}
        </div>
      )}

      {(c.description || sections.length > 0) && (
        <>
          <button className="more" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : `Details${sections.length ? ` · ${sections.length} section${sections.length === 1 ? '' : 's'}` : ''}`}
          </button>
          {open && (
            <div className="detail">
              {c.description && <p>{c.description}</p>}
              {m.prerequisites && <p><strong>Prerequisites:</strong> {m.prerequisites}</p>}
              {sections.length > 0 && (
                <table>
                  <thead><tr><th>Section</th><th>Dates</th><th>Instructor</th><th>Format</th><th>Notes</th></tr></thead>
                  <tbody>
                    {sections.map((s, i) => (
                      <tr key={i}><td>{s.crn || '—'}</td><td>{s.dates || '—'}</td><td>{s.professor || 'TBA'}</td><td>{s.format || '—'}</td><td>{s.notes || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

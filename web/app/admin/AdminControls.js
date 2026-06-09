'use client';
import { useEffect, useState } from 'react';

// Recheck-everything button + live usage meter. Talks to the scraper backend
// through the admin proxy routes; degrades gracefully when it's offline.
export default function AdminControls() {
  const [usage, setUsage] = useState(null);
  const [recheck, setRecheck] = useState({ running: false, done: 0, total: 0 });
  const [offline, setOffline] = useState(false);

  const poll = async () => {
    try {
      const d = await fetch('/api/admin/usage', { cache: 'no-store' }).then((r) => r.json());
      if (d.offline) { setOffline(true); return; }
      setOffline(false);
      setUsage(d.usage); setRecheck(d.recheck || { running: false });
    } catch { setOffline(true); }
  };

  useEffect(() => {
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    if (!confirm('Re-scrape every college? This re-pulls all sources and can take a while.')) return;
    const r = await fetch('/api/admin/recheck', { method: 'POST' });
    if (r.status === 502) { alert('Scraper backend is offline. Start it with `npm start` in the project root.'); return; }
    if (r.status === 409) { alert('A recheck is already running.'); return; }
    poll();
  };
  const reset = async () => { await fetch('/api/admin/usage', { method: 'POST' }); poll(); };

  return (
    <div className="recheck-bar">
      <button className="btn-primary" onClick={start} disabled={offline || recheck.running}>
        {recheck.running ? `↻ Rechecking… ${recheck.done}/${recheck.total}` : '↻ Recheck everything'}
      </button>
      <div className="usage">
        {offline ? (
          <span style={{ color: '#b42318' }}>scraper backend offline</span>
        ) : usage ? (
          <><strong>{(usage.requests || 0).toLocaleString()}</strong> requests · <strong>{usage.mb || 0}</strong> MB
            {recheck.running && <span style={{ color: 'var(--online)' }}> · live</span>}</>
        ) : 'loading…'}
      </div>
      <button className="btn-ghost" onClick={reset} disabled={offline}>Reset</button>
    </div>
  );
}

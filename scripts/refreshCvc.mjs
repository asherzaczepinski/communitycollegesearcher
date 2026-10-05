// Re-fetch every college's ONLINE courses from search.cvc.edu (with section
// details) and write a fresh src/data/cvc-snapshot.json.gz — the file
// buildFromAssist.js rebuilds the dataset from.
//
// Safe by design:
//   • Each college's fresh result is saved to src/data/cvc-fresh/<slug>.json as
//     soon as it finishes, so a crash/interrupt resumes where it left off
//     (results younger than 20h are reused). --restart ignores them.
//   • A college whose fresh count is under 60% of its previous count (CVC
//     hiccup, rate limit, term rollover glitch) KEEPS its previous rows.
//   • If the whole sweep comes back under 70% of the previous total, nothing is
//     written and the script exits non-zero.
//   • The previous snapshot is kept as cvc-snapshot.prev.json.gz.
//
//   node scripts/refreshCvc.mjs                # all colleges on CVC
//   node scripts/refreshCvc.mjs <slug>...      # only these (others keep old rows)
//   node scripts/refreshCvc.mjs --restart      # ignore saved partial progress
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { fetchCvcCourses, CVC_IDS } from '../src/scraper/cvc.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'src/data');
const FRESH = path.join(DATA, 'cvc-fresh');
const SNAP = path.join(DATA, 'cvc-snapshot.json.gz');
const KEEP_RATIO = 0.6;
const ABORT_RATIO = 0.7;
const REUSE_MS = 20 * 3600 * 1000;
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const restart = args.includes('--restart');
const only = new Set(args.filter((a) => !a.startsWith('--')));

const readGz = (f) => JSON.parse(gunzipSync(fs.readFileSync(f)).toString('utf8'));
const colleges = readGz(path.join(DATA, 'colleges-snapshot.json.gz'));
const oldRows = readGz(SNAP);
const oldByCollege = new Map();
for (const r of oldRows) {
  if (!oldByCollege.has(r.college_id)) oldByCollege.set(r.college_id, []);
  oldByCollege.get(r.college_id).push(r);
}

fs.mkdirSync(FRESH, { recursive: true });
const targets = colleges.filter((c) => CVC_IDS[c.slug] && (!only.size || only.has(c.slug)));
const now = new Date().toISOString();

// fetchCvcCourses() course -> snapshot row (same shape exportSnapshots writes).
// Tags from later passes (ucTransferable, C-ID) are re-applied by update.mjs.
const toRow = (collegeId) => (c) => {
  const { cvcCourseId, cvcUrl, ...meta } = c.meta || {};
  return {
    college_id: collegeId, code: c.code, title: c.title, modality: 'online', term: c.term || null,
    units: c.units || null, instructor: c.instructor || null, section: c.section || null,
    description: c.description || null, url: c.url, source: 'cvc',
    meta: JSON.stringify({ ...meta, cvcCourseId, cvcUrl }), updated_at: now,
  };
};

console.log(`CVC refresh: ${targets.length} colleges (term start ${new Date().getMonth() < 6 ? 'Jan' : 'Jul'} 1), ${oldRows.length.toLocaleString()} rows before`);
const results = new Map(); // college_id -> rows to use
let done = 0;
async function doCollege(c) {
  const file = path.join(FRESH, `${c.slug}.json`);
  let rows;
  if (!restart && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < REUSE_MS) {
    rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    const courses = await fetchCvcCourses(c.slug, { withDetails: true });
    rows = courses.filter((x) => x.title && x.url).map(toRow(c.id));
    fs.writeFileSync(file, JSON.stringify(rows));
  }
  const old = oldByCollege.get(c.id) || [];
  const keepOld = old.length >= 10 && rows.length < old.length * KEEP_RATIO;
  results.set(c.id, keepOld ? old : rows);
  done++;
  console.log(`[${done}/${targets.length}] ${c.slug}: ${rows.length} fresh (was ${old.length})${keepOld ? '  ⚠ too few — keeping previous rows' : ''}`);
}

const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const c = queue.shift();
    try { await doCollege(c); } catch (e) {
      done++;
      console.log(`[${done}/${targets.length}] ${c.slug}: FAILED (${e.message}) — keeping previous rows`);
    }
  }
}));

// Colleges not refreshed this run keep their previous rows.
const out = [];
for (const [cid, rows] of oldByCollege) if (!results.has(cid)) out.push(...rows);
for (const rows of results.values()) out.push(...rows);

if (out.length < oldRows.length * ABORT_RATIO) {
  console.error(`✗ Only ${out.length} rows vs ${oldRows.length} before — not writing. (Partial results saved in src/data/cvc-fresh/.)`);
  process.exit(1);
}
fs.copyFileSync(SNAP, path.join(DATA, 'cvc-snapshot.prev.json.gz'));
fs.writeFileSync(SNAP, gzipSync(Buffer.from(JSON.stringify(out))));
fs.rmSync(FRESH, { recursive: true, force: true });
console.log(`✓ cvc-snapshot.json.gz: ${out.length.toLocaleString()} rows (was ${oldRows.length.toLocaleString()})`);

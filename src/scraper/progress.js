// Per-college scraping progress + a live event bus.
//
// Every college we attempt gets a record on disk (src/data/progress/<slug>.json)
// recording its status, what we found, and a timestamped log of every step taken.
// The same updates are emitted on `bus` so the UI can stream them live over SSE.
//
// status values:
//   pending   — never attempted
//   running   — an attempt is in progress right now
//   live       — real courses found and ingested into the searchable DB ✅
//   blocked    — a sign-in wall stopped us (the one legitimate blocker) 🔒
//   impossible — exhausted HTTP + web search + headless browser, no data 🚫
//   error      — the attempt threw (network/driver) — retryable ⚠
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRESS_DIR = join(__dirname, '..', 'data', 'progress');
mkdirSync(PROGRESS_DIR, { recursive: true });

// Emits 'event' with { type:'log'|'status'|'run', slug, ... }. The server relays
// these to connected SSE clients.
export const bus = new EventEmitter();
bus.setMaxListeners(100);

const MAX_LOG = 300; // keep the last N log lines per college on disk
const cache = new Map(); // slug -> record (write-through cache)

const fileFor = (slug) => join(PROGRESS_DIR, `${slug}.json`);

function blank(college) {
  return {
    slug: college.slug,
    name: college.name,
    url: college.url,
    status: 'pending',
    attempts: 0,
    courseCount: 0,
    modalityCoverage: 0,
    method: null,
    extractUrl: null,
    blocked: null,
    note: '',
    startedAt: null,
    finishedAt: null,
    updatedAt: null,
    log: [],
  };
}

function read(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const f = fileFor(slug);
  if (existsSync(f)) {
    try {
      const rec = JSON.parse(readFileSync(f, 'utf8'));
      cache.set(slug, rec);
      return rec;
    } catch {
      /* corrupt — fall through to null */
    }
  }
  return null;
}

function write(rec) {
  rec.updatedAt = new Date().toISOString();
  cache.set(rec.slug, rec);
  try {
    writeFileSync(fileFor(rec.slug), JSON.stringify(rec, null, 2));
  } catch {
    /* disk full / permissions — keep the in-memory copy so the run continues */
  }
}

// Ensure a record exists for a college, returning it.
export function ensure(college) {
  return read(college.slug) || (() => { const r = blank(college); write(r); return r; })();
}

export function get(slug) {
  return read(slug);
}

// All records, newest activity first. Reads any on-disk records not yet cached.
export function all() {
  const slugs = new Set(cache.keys());
  for (const f of readdirSync(PROGRESS_DIR)) {
    if (f.endsWith('.json')) slugs.add(f.replace(/\.json$/, ''));
  }
  return [...slugs].map((s) => read(s)).filter(Boolean);
}

// Append a timestamped log line and stream it.
export function log(slug, msg) {
  const rec = read(slug);
  if (!rec) return;
  const entry = { t: new Date().toISOString(), msg: String(msg) };
  rec.log.push(entry);
  if (rec.log.length > MAX_LOG) rec.log = rec.log.slice(-MAX_LOG);
  write(rec);
  bus.emit('event', { type: 'log', slug, name: rec.name, ...entry });
}

// Merge status/result fields and stream the change.
export function update(slug, fields) {
  const rec = read(slug);
  if (!rec) return;
  Object.assign(rec, fields);
  write(rec);
  bus.emit('event', { type: 'status', slug, name: rec.name, status: rec.status, record: summary(rec) });
  return rec;
}

// A compact view (no full log) for status events and list payloads.
export function summary(rec) {
  const { log: _log, ...rest } = rec;
  return { ...rest, logCount: rec.log.length };
}

export function summaryAll() {
  return all().map(summary);
}

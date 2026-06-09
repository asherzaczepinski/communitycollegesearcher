// Sort every college into two folders under src/data/ by whether we actually
// pulled its REAL, FULL schedule (a substantial course listing) or not:
//
//   src/data/with-real-schedule/<slug>.json     — live & >= FULL_MIN courses (the real data)
//   src/data/without-real-schedule/<slug>.json  — thin/partial captures, blocked, or impossible
//
// Each file carries the college's metadata + its scraped courses, and each folder
// gets an _index.json and a human-readable README.txt. Re-run any time with
// `npm run organize` (it rebuilds both folders from the live DB + learned data).
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getColleges } from './db.js';
import { loadSnapshot, loadRecipe } from './scraper/kb.js';
import * as progress from './scraper/progress.js';

// A "real full schedule" means we scraped at least this many courses. The course
// counts split cleanly: 100+ are comprehensive listings; below that is partial
// captures or stray courses off marketing pages. Tweak here if you disagree.
const FULL_MIN = 100;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
const WITH = join(DATA, 'with-real-schedule');
const WITHOUT = join(DATA, 'without-real-schedule');

function freshDir(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function reasonFor(rec, prog) {
  if (rec.status === 'blocked' || prog?.blocked === 'login') return 'Class schedule is behind a sign-in wall.';
  if (rec.status === 'impossible') return 'No public, login-free schedule found (likely a JS app, a PDF, or login-gated).';
  if (rec.live && rec.courseCount > 0) return `Partial capture — only ${rec.courseCount} course(s) scraped, not the full schedule.`;
  return 'Not yet scraped.';
}

freshDir(WITH);
freshDir(WITHOUT);

const colleges = getColleges();
const withList = [];
const withoutList = [];

for (const c of colleges) {
  const snap = loadSnapshot(c.slug);
  const recipe = loadRecipe(c.slug);
  const prog = progress.get(c.slug);
  const courseCount = c.course_count || 0;

  const rec = {
    slug: c.slug,
    name: c.name,
    url: c.url,
    live: !!c.live,
    courseCount,
    modalityCoverage: recipe?.modalityCoverage ?? null,
    method: recipe?.method || c.scrape_type || null,
    source: recipe?.strategy || recipe?.source || null,
    extractUrl: recipe?.extractUrl || null,
    status: prog?.status || (c.live ? 'live' : 'pending'),
    lastStatus: c.last_status || null,
  };

  const isFull = rec.live && courseCount >= FULL_MIN;
  const dir = isFull ? WITH : WITHOUT;
  const payload = isFull ? { ...rec, courses: snap?.courses || [] } : { ...rec, reason: reasonFor(rec, prog), courses: snap?.courses || [] };
  writeFileSync(join(dir, `${c.slug}.json`), JSON.stringify(payload, null, 2));
  (isFull ? withList : withoutList).push(rec);
}

withList.sort((a, b) => b.courseCount - a.courseCount);
withoutList.sort((a, b) => b.courseCount - a.courseCount);

// Indexes (machine-readable) + READMEs (human-readable).
const stamp = new Date().toISOString();
writeFileSync(join(WITH, '_index.json'), JSON.stringify({ generatedAt: stamp, criterion: `live & >= ${FULL_MIN} courses`, count: withList.length, colleges: withList }, null, 2));
writeFileSync(join(WITHOUT, '_index.json'), JSON.stringify({ generatedAt: stamp, criterion: `not live, or < ${FULL_MIN} courses`, count: withoutList.length, colleges: withoutList }, null, 2));

const line = (r) => `  ${String(r.courseCount).padStart(5)}  ${r.name}${r.modalityCoverage ? `  (${Math.round(r.modalityCoverage * 100)}% modality)` : ''}${r.source ? `  [${r.source}]` : ''}`;
writeFileSync(
  join(WITH, 'README.txt'),
  `Colleges WITH a real, full schedule (live & >= ${FULL_MIN} courses) — ${withList.length} colleges.\n` +
    `Generated ${stamp}. Each <slug>.json holds the college's metadata + scraped courses.\n\n` +
    withList.map(line).join('\n') + '\n'
);
const byReason = {};
for (const r of withoutList) {
  const k = r.status === 'blocked' ? 'sign-in walled' : r.status === 'impossible' ? 'no public schedule' : r.live ? 'partial/thin' : 'not scraped';
  (byReason[k] ||= []).push(r);
}
writeFileSync(
  join(WITHOUT, 'README.txt'),
  `Colleges WITHOUT a real, full schedule (not live, or < ${FULL_MIN} courses) — ${withoutList.length} colleges.\n` +
    `Generated ${stamp}.\n\n` +
    Object.entries(byReason).map(([k, list]) => `== ${k} (${list.length}) ==\n` + list.map(line).join('\n')).join('\n\n') + '\n'
);

console.log(`Organized ${colleges.length} colleges:`);
console.log(`  with-real-schedule/    ${withList.length}  (live & >= ${FULL_MIN} courses)`);
console.log(`  without-real-schedule/ ${withoutList.length}`);
console.log(`    ${Object.entries(byReason).map(([k, l]) => `${l.length} ${k}`).join(', ')}`);

// Auto-scrape engine: get every college scraping, one at a time, and never give
// up until it's genuinely impossible.
//
// For each college it escalates through increasingly heavy tactics, stopping at
// the first one that yields real courses (or at a sign-in wall — the one thing we
// can't get past):
//
//   1. Homepage HTTP crawl        — cheap; follows schedule/catalog links + guesses
//   2. Web search + headless Chrome— finds the schedule app (often on another host),
//                                    drives its Search form, iframes, and pagination
//   3. Homepage in headless Chrome — for JS apps linked straight off the homepage
//
// When courses are found they're ingested straight into the searchable SQLite DB,
// flipping the college "live". Every step is logged live through progress.js.
import { replaceCourses, setScrapeConfig, markScraped } from '../db.js';
import { loadSnapshot } from './kb.js';
import { learnCollege, learnCollegeViaSearch } from './learn.js';
import { closeDriver } from './browser.js';
import * as progress from './progress.js';

const iso = () => new Date().toISOString();

// Push a learned recipe's freshly-saved snapshot into the DB so the college goes
// live and its courses become searchable. Returns the number of rows ingested.
function ingest(college, recipe) {
  const snap = loadSnapshot(college.slug);
  const courses = snap?.courses || [];
  if (!courses.length) return 0;
  const type = recipe.method === 'browser' ? 'browser' : 'auto';
  const n = replaceCourses(college.id, courses);
  setScrapeConfig(college.slug, type, recipe);
  markScraped(college.id, `ok: ${n} courses via ${type} (auto-learned)`);
  return n;
}

// Attempt one college through the full escalation ladder. Always resolves; records
// the outcome on the progress record. `college` must include the DB `id`.
export async function runCollege(college) {
  const slug = college.slug;
  progress.ensure(college);
  let attempts = (progress.get(slug)?.attempts || 0);
  progress.update(slug, { status: 'running', startedAt: iso(), finishedAt: null, blocked: null, note: '' });
  const onLog = (m) => progress.log(slug, m);
  onLog(`▶ Starting ${college.name} — ${college.url}`);

  let recipe = null;
  let blocked = null;
  try {
    // 1 — fast homepage HTTP crawl (no browser)
    attempts++;
    onLog('Attempt 1/3 — homepage HTTP crawl (no browser)');
    recipe = await learnCollege(college, { browser: false, onLog });
    blocked = recipe.blocked || blocked;

    // 2 — web search + headless browser (the thorough one)
    if (recipe.sampleCount === 0 && recipe.blocked !== 'login') {
      attempts++;
      onLog('Attempt 2/3 — web search + headless Chrome (drives Search forms / iframes / pagination)');
      recipe = await learnCollegeViaSearch(college, { browser: true, onLog });
      blocked = recipe.blocked || blocked;
    }

    // 3 — homepage rendered in the browser (JS apps linked off the homepage)
    if (recipe.sampleCount === 0 && recipe.blocked !== 'login') {
      attempts++;
      onLog('Attempt 3/3 — homepage rendered in headless Chrome');
      recipe = await learnCollege(college, { browser: true, onLog });
      blocked = recipe.blocked || blocked;
    }
  } catch (err) {
    onLog(`⚠ Error: ${err.message}`);
    return progress.update(slug, { status: 'error', attempts, finishedAt: iso(), note: err.message });
  }

  // Outcome.
  if (recipe && recipe.sampleCount > 0) {
    const n = ingest(college, recipe);
    onLog(`✅ LIVE — ingested ${n} courses into the searchable DB via ${recipe.method || 'auto'} (${Math.round((recipe.modalityCoverage || 0) * 100)}% with modality).`);
    onLog(`   source: ${recipe.extractUrl}`);
    return progress.update(slug, {
      status: 'live',
      attempts,
      courseCount: n,
      modalityCoverage: recipe.modalityCoverage || 0,
      method: recipe.method || 'auto',
      extractUrl: recipe.extractUrl,
      blocked: null,
      finishedAt: iso(),
      note: recipe.notes || '',
    });
  }
  if (blocked === 'login') {
    onLog('🔒 BLOCKED — the schedule is behind a sign-in wall. That is the one blocker Selenium is meant to stop at.');
    return progress.update(slug, { status: 'blocked', attempts, blocked: 'login', finishedAt: iso(), note: recipe?.notes || '' });
  }
  onLog('🚫 IMPOSSIBLE (for now) — homepage, web search, and headless browser all came up empty. No public, login-free course data found.');
  return progress.update(slug, { status: 'impossible', attempts, finishedAt: iso(), note: recipe?.notes || '' });
}

// --- Sequential runner (one college at a time) -----------------------------
export const state = { running: false, currentSlug: null, currentName: null, done: 0, total: 0, stop: false };

function emitRun(extra = {}) {
  progress.bus.emit('event', {
    type: 'run',
    running: state.running,
    currentSlug: state.currentSlug,
    currentName: state.currentName,
    done: state.done,
    total: state.total,
    ...extra,
  });
}

export function runState() {
  return { running: state.running, currentSlug: state.currentSlug, currentName: state.currentName, done: state.done, total: state.total };
}

export function requestStop() {
  if (state.running) {
    state.stop = true;
    return true;
  }
  return false;
}

// Process colleges sequentially. `colleges` rows must include `id` and `live`.
// Skips already-live colleges by default (so it's resumable). Returns a summary.
export async function runAll(colleges, { skipLive = true, onlySlugs = null } = {}) {
  if (state.running) return { error: 'a run is already in progress' };

  let queue = colleges;
  if (onlySlugs) queue = queue.filter((c) => onlySlugs.includes(c.slug));
  if (skipLive) queue = queue.filter((c) => !c.live);

  state.running = true;
  state.stop = false;
  state.done = 0;
  state.total = queue.length;
  state.currentSlug = null;
  state.currentName = null;
  emitRun({ started: true });

  try {
    for (const college of queue) {
      if (state.stop) break;
      state.currentSlug = college.slug;
      state.currentName = college.name;
      emitRun();
      await runCollege(college);
      state.done++;
      emitRun();
    }
  } finally {
    await closeDriver(); // free Chrome once the whole batch is done
    const stopped = state.stop;
    state.running = false;
    state.currentSlug = null;
    state.currentName = null;
    emitRun({ finished: true, stopped });
  }
  return { ok: true, processed: state.done, total: state.total };
}

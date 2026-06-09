// Scrape orchestrator: picks the right adapter for a college, runs it, caches
// the result to a JSON snapshot, and replaces that college's rows in the DB.
import { replaceCourses, markScraped, setScrapeConfig } from '../db.js';
import { loadRecipe, saveSnapshot } from './kb.js';
import { sampleCourses } from './adapters/sample.js';
import { htmlCourses } from './adapters/html.js';
import { autoCourses } from './adapters/auto.js';
import { browserCourses } from './adapters/browser.js';
import { cvcCourses } from './adapters/cvc.js';
import { colleagueCourses } from './adapters/colleague.js';
import { closeDriver } from './browser.js';
import { getScraper } from '../scrapers/index.js';
import { hasCvc } from './cvc.js';
import { colleagueHost } from './colleague.js';

// Decide how to get courses for a college (real data preferred over samples).
//  - explicit scrape_type on the college row wins (e.g. 'html' with selectors, or 'sample')
//  - else a learned recipe with hand-tuned selectors            -> 'html'
//  - else a learned recipe with a discovered extractUrl         -> 'auto' (REAL data)
//  - else fall back to sample data so the UI is never empty     -> 'sample'
// A per-college scraper / recipe that returns only a handful of courses is
// almost always an unfinished scaffold that matched a stray row. Below this bar
// we treat the result as "thin" — kept as a weak fallback, but allowed to be
// superseded by the CVC Exchange, which often has far more real data (e.g.
// el-camino's 'auto' recipe yields 2 courses while CVC lists ~159).
const SUBSTANTIAL = 25;

// Run our own primary source for a college (per-college scraper, then a learned
// recipe). Returns { type, courses } or null if nothing produced any rows.
async function primarySource(college) {
  const mod = getScraper(college.slug);
  if (mod) {
    try {
      const courses = await mod.scrape();
      if (courses && courses.length) return { type: 'college', courses };
    } catch { /* scaffold not implemented yet — fall through */ }
  }
  const recipe = loadRecipe(college.slug);
  let type = ['html', 'auto', 'browser'].includes(college.scrape_type) ? college.scrape_type : null;
  if (!type) {
    if (recipe && recipe.selectors) type = 'html';
    else if (recipe && recipe.method === 'browser' && recipe.extractUrl) type = 'browser';
    else if (recipe && recipe.extractUrl) type = 'auto';
    else return null;
  }
  try {
    if (type === 'html') return { type, courses: await htmlCourses(college, recipe) };
    if (type === 'auto') return { type, courses: await autoCourses(college, recipe) };
    if (type === 'browser') return { type, courses: await browserCourses(college, recipe) };
  } catch { /* recipe broke — treat as no primary */ }
  return null;
}

async function extract(college, { allowSample = true } = {}) {
  // 1. Our own source wins outright when it returns a substantial catalog.
  const primary = await primarySource(college);
  if (primary && primary.courses.length >= SUBSTANTIAL) return primary;

  // 2. Colleague Self-Service: a real, login-free FULL catalog. Preferred over
  //    the online-only CVC fallback when we know the host.
  if (colleagueHost(college.slug)) {
    try {
      const courses = await colleagueCourses(college);
      if (!primary || courses.length >= primary.courses.length) return { type: 'colleague', courses };
    } catch { /* host down / not public anymore — fall through */ }
  }

  // 3. Primary was thin/empty. If the college is on the CVC Exchange, fetch its
  //    real (online-only) courses and keep whichever source has more rows.
  if (hasCvc(college.slug)) {
    try {
      const courses = await cvcCourses(college);
      if (primary && primary.courses.length > courses.length) return primary;
      return { type: 'cvc', courses };
    } catch {
      if (primary) return primary; // CVC failed — fall back to the thin primary
    }
  } else if (primary) {
    return primary; // not on CVC, but a thin real result still beats samples
  }

  // 3. Nothing real available — sample so the UI is never empty (unless opted out).
  return allowSample ? { type: 'sample', courses: sampleCourses(college) } : { type: 'none', courses: [] };
}

// Where a row came from, derived from the extract type. Drives the per-course
// `source` column the UI reads ("X from the college site, Y from CVC").
const SOURCE_BY_TYPE = {
  cvc: 'cvc', colleague: 'colleague', sample: 'sample', none: 'site',
  html: 'site', auto: 'site', browser: 'site', college: 'site',
};
const onlineKey = (c) =>
  `${(c.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}|${(c.title || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

export async function scrapeCollege(college, opts = {}) {
  try {
    const { type, courses } = await extract(college, opts);
    const baseSource = SOURCE_BY_TYPE[type] || 'site';
    const merged = courses.map((c) => ({ ...c, source: c.source || baseSource }));

    // Fill in online coverage: any real (non-CVC) college that's also on the CVC
    // Exchange gets CVC's online sections merged in — so a site catalog that's
    // light on online classes is topped up. Tagged source='cvc' and only added
    // when not already present as an online course.
    let supplemented = 0;
    if (type !== 'cvc' && type !== 'sample' && hasCvc(college.slug)) {
      try {
        const cvc = await cvcCourses(college);
        const seen = new Set(merged.filter((c) => c.modality === 'online').map(onlineKey));
        for (const c of cvc) {
          const k = onlineKey(c);
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push({ ...c, source: 'cvc' });
          supplemented++;
        }
      } catch { /* CVC unavailable — keep the primary catalog as-is */ }
    }

    saveSnapshot(college.slug, merged);
    const n = replaceCourses(college.id, merged);
    setScrapeConfig(college.slug, type, loadRecipe(college.slug));
    markScraped(college.id, `ok: ${n} courses via ${type}${supplemented ? ` (+${supplemented} CVC online)` : ''}`);
    return { slug: college.slug, ok: true, count: n, type, supplemented };
  } catch (err) {
    markScraped(college.id, `error: ${err.message}`);
    return { slug: college.slug, ok: false, error: err.message };
  }
}

// Run scrapes with a small concurrency cap so we don't hammer sites.
export async function scrapeAll(colleges, { concurrency = 6, onResult, allowSample = true } = {}) {
  const opts = { allowSample };
  const queue = [...colleges];
  const results = [];
  async function worker() {
    while (queue.length) {
      const college = queue.shift();
      const r = await scrapeCollege(college, { allowSample: opts.allowSample !== false });
      results.push(r);
      if (onResult) onResult(r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, colleges.length) }, worker));
  await closeDriver(); // free Chrome if any 'browser'-typed college used it
  return results;
}

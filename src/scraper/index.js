// Scrape orchestrator: picks the right adapter for a college, runs it, caches
// the result to a JSON snapshot, and replaces that college's rows in the DB.
import { replaceCourses, markScraped, setScrapeConfig } from '../db.js';
import { loadRecipe, saveSnapshot } from './kb.js';
import { sampleCourses } from './adapters/sample.js';
import { htmlCourses } from './adapters/html.js';
import { autoCourses } from './adapters/auto.js';
import { getScraper } from '../scrapers/index.js';

// Decide how to get courses for a college (real data preferred over samples).
//  - explicit scrape_type on the college row wins (e.g. 'html' with selectors, or 'sample')
//  - else a learned recipe with hand-tuned selectors            -> 'html'
//  - else a learned recipe with a discovered extractUrl         -> 'auto' (REAL data)
//  - else fall back to sample data so the UI is never empty     -> 'sample'
async function extract(college, { allowSample = true } = {}) {
  // 1. Per-college scraper (src/scrapers/<slug>.js) is the primary path. If it
  //    produces courses, use them. If it throws or returns nothing (scaffold),
  //    fall through to the generic recipe/sample path so the UI is never empty.
  const mod = getScraper(college.slug);
  if (mod) {
    try {
      const courses = await mod.scrape();
      if (courses && courses.length) return { type: 'college', courses };
    } catch {
      /* scaffold not implemented yet — fall through */
    }
  }

  const recipe = loadRecipe(college.slug);
  // Only a "real" stored type is sticky; 'sample'/'none' are non-sticky defaults
  // so a freshly-learned recipe always wins over an old sample fallback.
  let type = college.scrape_type === 'html' || college.scrape_type === 'auto'
    ? college.scrape_type
    : null;
  if (!type) {
    if (recipe && recipe.selectors) type = 'html';
    else if (recipe && recipe.extractUrl) type = 'auto';
    else type = allowSample ? 'sample' : 'none';
  }

  switch (type) {
    case 'html':
      return { type, courses: await htmlCourses(college, recipe) };
    case 'auto':
      return { type, courses: await autoCourses(college, recipe) };
    case 'none':
      return { type, courses: [] };
    case 'sample':
    default:
      return { type: 'sample', courses: sampleCourses(college) };
  }
}

export async function scrapeCollege(college, opts = {}) {
  try {
    const { type, courses } = await extract(college, opts);
    saveSnapshot(college.slug, courses);
    const n = replaceCourses(college.id, courses);
    setScrapeConfig(college.slug, type, loadRecipe(college.slug));
    markScraped(college.id, `ok: ${n} courses via ${type}`);
    return { slug: college.slug, ok: true, count: n, type };
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
  return results;
}

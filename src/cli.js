// Command-line backend for managing the local database.
//
//   npm run seed                 -> load the 118 colleges into the DB
//   npm run scrape               -> (re)build courses for ALL colleges
//   npm run scrape -- <slug...>  -> scrape only specific colleges
//   npm run detect               -> "learn" how to scrape every college (writes recipes)
//   npm run detect -- <slug...>  -> learn only specific colleges
//   npm run stats                -> print database stats
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { upsertCollege, getColleges, getCollegeBySlug, stats } from './db.js';
import { scrapeAll, scrapeCollege } from './scraper/index.js';
import { learnCollege } from './scraper/learn.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSeed() {
  const file = join(__dirname, 'data', 'colleges.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function resolveColleges(slugs) {
  const all = getColleges();
  if (!slugs.length) return all;
  return slugs.map((s) => {
    const c = getCollegeBySlug(s);
    if (!c) {
      console.error(`! unknown college slug: ${s}`);
      process.exit(1);
    }
    return c;
  });
}

const [, , cmd, ...rawArgs] = process.argv;
const flags = new Set(rawArgs.filter((a) => a.startsWith('--')));
const args = rawArgs.filter((a) => !a.startsWith('--'));

// Run an async fn over items with a concurrency cap.
async function pool(items, concurrency, fn) {
  const queue = items.map((item, i) => ({ item, i }));
  async function worker() {
    while (queue.length) {
      const { item, i } = queue.shift();
      await fn(item, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

switch (cmd) {
  case 'seed': {
    const seed = loadSeed();
    for (const c of seed) upsertCollege(c);
    console.log(`Seeded ${seed.length} colleges into the database.`);
    console.log('Next: `npm run scrape` to populate courses (sample data), then `npm start`.');
    break;
  }

  case 'scrape': {
    const colleges = resolveColleges(args);
    const allowSample = !flags.has('--real'); // --real => real data only, no placeholder fallback
    console.log(`Scraping ${colleges.length} college(s)${allowSample ? '' : ' (real data only)'}...`);
    const results = await scrapeAll(colleges, {
      allowSample,
      onResult: (r) =>
        console.log(
          r.ok ? `  ✓ ${r.slug}: ${r.count} courses (${r.type})` : `  ✗ ${r.slug}: ${r.error}`
        ),
    });
    const ok = results.filter((r) => r.ok).length;
    const total = results.reduce((n, r) => n + (r.count || 0), 0);
    const byType = {};
    for (const r of results) if (r.ok) byType[r.type] = (byType[r.type] || 0) + 1;
    console.log(`Done. ${ok}/${results.length} colleges ok, ${total} courses total.`);
    console.log(`  sources: ${Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(', ') || 'none'}`);
    break;
  }

  case 'detect':
  case 'learn': {
    const colleges = resolveColleges(args);
    console.log(`Learning how to scrape ${colleges.length} college(s) (following links, extracting real courses)...`);
    let done = 0;
    let withCourses = 0;
    let withModality = 0;
    await pool(colleges, 8, async (c) => {
      const recipe = await learnCollege(c);
      done++;
      if (recipe.sampleCount > 0) withCourses++;
      if (recipe.modalityCoverage > 0.05) withModality++;
      console.log(
        `  [${done}/${colleges.length}] ${c.slug}: ` +
          (recipe.sampleCount > 0
            ? `${recipe.sampleCount} real courses (modality ${Math.round(recipe.modalityCoverage * 100)}%) <- ${recipe.extractUrl}`
            : `no server-rendered courses (${recipe.candidates.length} link(s) found, needs browser)`)
      );
    });
    console.log(`\nLearned ${colleges.length} colleges: ${withCourses} yielded real courses, ${withModality} with live modality.`);
    console.log('Recipes -> src/data/learned/*.json · snapshots -> src/data/snapshots/*.json · log -> LEARNING_LOG.txt');
    break;
  }

  case 'stats': {
    const s = stats();
    console.log(`Colleges:   ${s.colleges}`);
    console.log(`Configured: ${s.configured}`);
    console.log(`Courses:    ${s.courses}`);
    for (const m of s.byModality) console.log(`  ${m.modality}: ${m.n}`);
    break;
  }

  default:
    console.log(`Unknown command: ${cmd || '(none)'}

Usage:
  npm run seed                  Load the 118 colleges
  npm run scrape                Build/refresh courses for all colleges
  npm run scrape -- <slug>...   Scrape specific colleges
  npm run detect                Learn how to scrape every college's site
  npm run detect -- <slug>...   Learn specific colleges
  npm run stats                 Show database stats`);
    process.exit(1);
}

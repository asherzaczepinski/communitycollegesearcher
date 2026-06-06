// Knowledge base: everything the scraper "learns" is persisted to plain files
// so it is human-readable, diffable, and survives DB resets.
//
//   src/data/learned/<slug>.json     -> the recipe: how to extract courses from this college
//   src/data/snapshots/<slug>.json   -> the most recent extracted courses (raw result cache)
//   src/data/learned/LEARNING_LOG.txt-> append-only log of what was learned and when
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
export const LEARNED_DIR = join(DATA_DIR, 'learned');
export const SNAPSHOT_DIR = join(DATA_DIR, 'snapshots');
const LOG_FILE = join(LEARNED_DIR, 'LEARNING_LOG.txt');

mkdirSync(LEARNED_DIR, { recursive: true });
mkdirSync(SNAPSHOT_DIR, { recursive: true });

// A "recipe" describes how to pull courses from one college's site.
// {
//   slug, name, url,
//   platform: 'curricunet'|'banner'|'ssb'|'html'|'sample'|'unknown',
//   scheduleUrl: string|null,   // page we believe lists classes
//   candidates: [{ text, href }],  // links we found while exploring
//   selectors: { row, code, title, modality, units, instructor },
//   confidence: 0..1,
//   notes: string,
//   learnedAt: ISO string
// }

export function saveRecipe(recipe) {
  const file = join(LEARNED_DIR, `${recipe.slug}.json`);
  writeFileSync(file, JSON.stringify(recipe, null, 2));
  appendFileSync(
    LOG_FILE,
    `[${recipe.learnedAt}] ${recipe.slug}  platform=${recipe.platform}  confidence=${recipe.confidence}  schedule=${recipe.scheduleUrl || '-'}\n`
  );
  return file;
}

export function loadRecipe(slug) {
  const file = join(LEARNED_DIR, `${slug}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function listRecipes() {
  return readdirSync(LEARNED_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(LEARNED_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function saveSnapshot(slug, courses) {
  const file = join(SNAPSHOT_DIR, `${slug}.json`);
  writeFileSync(file, JSON.stringify({ slug, scrapedAt: new Date().toISOString(), count: courses.length, courses }, null, 2));
  return file;
}

export function loadSnapshot(slug) {
  const file = join(SNAPSHOT_DIR, `${slug}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

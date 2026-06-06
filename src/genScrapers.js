// Generate one dedicated scraper module per college into src/scrapers/<slug>.js.
//
// Each file is self-contained and independently editable: it carries that
// college's own URL(s) and a parse() you can specialize. Files are generated
// from the learned recipes (src/data/learned/*.json) so colleges that already
// yield real data get a working scraper, and the rest get a real scaffold with
// their discovered candidate links baked in.
//
// Re-run anytime with:  npm run gen
// Existing files are NOT overwritten unless you pass --force (so your hand-tuned
// scrapers are safe).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { slugify } from './db.js';
import { loadRecipe } from './scraper/kb.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPERS_DIR = join(__dirname, 'scrapers');
mkdirSync(SCRAPERS_DIR, { recursive: true });

const force = process.argv.includes('--force');
const colleges = JSON.parse(readFileSync(join(__dirname, 'data', 'colleges.json'), 'utf8'));

const q = (s) => JSON.stringify(s ?? null);

// Find a Banner Self-Service base URL among everything we learned about a site.
function bannerBaseFrom(recipe) {
  const urls = [recipe.scheduleUrl, recipe.extractUrl, ...((recipe.candidates || []).map((c) => c.href))].filter(Boolean);
  const hit = urls.find((u) => /StudentRegistrationSsb/i.test(u));
  return hit ? hit.split('/StudentRegistrationSsb')[0] + '/StudentRegistrationSsb' : null;
}

function bannerFile(college, slug, recipe, candidates) {
  const base = bannerBaseFrom(recipe);
  return `// Scraper for ${college.name}
// Site: ${college.url}
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: ${base}
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: ${q(slug)},
  name: ${q(college.name)},
  url: ${q(college.url)},
  platform: 'banner',
  bannerBase: ${q(base)},
  status: 'working',
  candidates: ${JSON.stringify(candidates)},
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}
`;
}

function fileFor(college) {
  const slug = slugify(college.name);
  const recipe = loadRecipe(slug) || {};
  const candidatesAll = (recipe.candidates || []).slice(0, 8);
  // Banner colleges get a dedicated Banner scraper (real modality).
  if (bannerBaseFrom(recipe)) return bannerFile(college, slug, recipe, candidatesAll);

  const extractUrl = recipe.extractUrl || null;
  const real = !!extractUrl;
  const candidates = candidatesAll;
  const candidateLines = candidates.length
    ? candidates.map((c) => `//   - ${JSON.stringify(c.text)} -> ${c.href}`).join('\n')
    : '//   (none found on the homepage — entry point may be a menu/JS/portal)';

  return `// Scraper for ${college.name}
// Site: ${college.url}
// Status: ${real ? 'WORKING — extracts real courses' : 'SCAFFOLD — needs a working course-list URL'}
// Course list discovered: ${extractUrl || 'none yet'}
// Platform guess: ${recipe.platform || 'unknown'}
//
// Candidate links found while learning this site:
${candidateLines}
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: ${q(slugify(college.name))},
  name: ${q(college.name)},
  url: ${q(college.url)},
  extractUrl: ${q(extractUrl)},
  platform: ${q(recipe.platform || 'unknown')},
  status: ${q(real ? 'working' : 'scaffold')},
  candidates: ${JSON.stringify(candidates)},
};

// Fetch this college's course list and return an array of course objects:
//   { code, title, modality, term, units, instructor, section, description, url }
// modality must be one of: 'in_person' | 'online' | 'hybrid'
export async function scrape() {
  if (!meta.extractUrl) {
    throw new Error(
      \`No server-rendered course list known for \${meta.name}. \` +
      \`Its schedule/catalog is likely a JavaScript app or login-gated search. \` +
      \`Set meta.extractUrl to a scrapable page (see candidate links in this file), \` +
      \`or implement a custom fetch + parse below (e.g. a headless browser or an API call).\`
    );
  }
  const res = await fetchText(meta.extractUrl, { timeoutMs: 20000 });
  if (!res.ok) throw new Error(\`\${meta.extractUrl} returned HTTP \${res.status}\`);
  return parse(res.body, res.url);
}

// Default parse = generic extractor. Override per college for better results.
export function parse(html, pageUrl) {
  const { courses } = extractCourses(html, { pageUrl });
  return courses;
}
`;
}

let written = 0;
let skipped = 0;
for (const college of colleges) {
  const slug = slugify(college.name);
  const path = join(SCRAPERS_DIR, `${slug}.js`);
  if (existsSync(path) && !force) {
    skipped++;
    continue;
  }
  writeFileSync(path, fileFor(college));
  written++;
}

const total = readdirSync(SCRAPERS_DIR).filter((f) => f.endsWith('.js') && f !== 'index.js').length;
console.log(`Generated ${written} scraper file(s), skipped ${skipped} existing.${force ? ' (--force)' : ''}`);
console.log(`src/scrapers/ now has ${total} per-college scrapers.`);
console.log(written && !force ? 'Pass --force to regenerate existing files from latest recipes.' : '');

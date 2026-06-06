// "Learn" how to scrape a college — for real.
//
// 1. Fetch the homepage and score links for class-schedule / course-catalog entry points.
// 2. FOLLOW the best candidates, fetch each page, and run the generic extractor on it.
// 3. Keep the page that yields the most real courses (preferring one that also
//    exposes modality). Record it as the college's `extractUrl` so future scrapes
//    pull real data with no per-site selectors.
// 4. Persist everything learned to src/data/learned/<slug>.json (+ LEARNING_LOG.txt).
//
// CA community colleges run a handful of course systems. Many publish a
// server-rendered catalog (real courses, little modality). Live class schedules
// (which carry modality) are often JavaScript apps — those get flagged as
// "needs a browser" so a headless adapter can be added later.
import * as cheerio from 'cheerio';
import { fetchText, absoluteUrl } from './fetch.js';
import { saveRecipe, saveSnapshot } from './kb.js';
import { extractCourses } from './extract.js';

const SCHEDULE_HINTS = [
  'schedule of classes', 'class schedule', 'search for classes', 'search classes',
  'find classes', 'class search', 'browse classes', 'searchable schedule', 'class listing',
];
const CATALOG_HINTS = [
  'course catalog', 'college catalog', 'catalog', 'course outlines', 'course descriptions', 'courses',
];
// Links that, one hop deeper, usually land on the ACTUAL course list.
const DEEP_HINTS = [
  'course outlines', 'course descriptions', 'courses a-z', 'courses a–z', 'all courses',
  'by subject', 'subjects', 'departments', 'course list', 'a-z index', 'course offerings',
];

const PLATFORM_SIGNATURES = [
  { platform: 'banner', re: /ssb|bwckschd|bannerweb|StudentRegistrationSsb/i },
  { platform: 'curricunet', re: /curricunet|mongoose|governet/i },
  { platform: 'peoplesoft', re: /psc\/|peoplesoft|ps\/EMPLOYEE/i },
  { platform: 'acalog', re: /acalog|catalog\..*\.edu|coursecatalog/i },
  { platform: 'courseleaf', re: /courseleaf|\/courseadmin\//i },
];

function scoreLink(text, href, hints, bonusRe) {
  const hay = `${text} ${href}`.toLowerCase();
  let score = 0;
  for (const h of hints) if (hay.includes(h)) score += h.length > 8 ? 3 : 1;
  if (bonusRe && bonusRe.test(hay)) score += 2;
  return score;
}

function detectPlatform(urls) {
  for (const u of urls) for (const s of PLATFORM_SIGNATURES) if (s.re.test(u)) return s.platform;
  return 'unknown';
}

function collectCandidates($, baseUrl) {
  const sched = [];
  const cat = [];
  $('a[href]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const raw = $(el).attr('href');
    if (!text || !raw) return;
    const href = absoluteUrl(raw, baseUrl) || raw;
    const ss = scoreLink(text, href, SCHEDULE_HINTS, /schedule|class.*search|search.*class/);
    const cs = scoreLink(text, href, CATALOG_HINTS, /catalog|course.*(outline|description)/);
    if (ss > 0) sched.push({ text, href, score: ss });
    if (cs > 0) cat.push({ text, href, score: cs });
  });
  const dedupe = (arr) => {
    const seen = new Set();
    return arr.sort((a, b) => b.score - a.score)
      .filter((c) => (seen.has(c.href) ? false : seen.add(c.href)))
      .slice(0, 6);
  };
  return { schedule: dedupe(sched), catalog: dedupe(cat) };
}

// Fetch a URL, extract courses, AND return deeper candidate links found on it.
async function probe(url) {
  try {
    const res = await fetchText(url, { timeoutMs: 20000 });
    if (!res.ok) return { url, ok: false, reason: `HTTP ${res.status}`, count: 0, links: [] };
    const { courses, modalityCoverage } = extractCourses(res.body, { pageUrl: res.url });
    const $ = cheerio.load(res.body);
    const links = [];
    $('a[href]').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      const raw = $(el).attr('href');
      if (!text || !raw) return;
      const href = absoluteUrl(raw, res.url);
      if (!href) return;
      const score =
        scoreLink(text, href, DEEP_HINTS, /course.*(outline|description|list)|subjects?|by.subject/) +
        scoreLink(text, href, SCHEDULE_HINTS, /schedule|class.*search/) * 0.5;
      if (score > 0) links.push({ text, href, score });
    });
    return { url: res.url, ok: courses.length > 0, count: courses.length, modalityCoverage, courses, links };
  } catch (err) {
    return { url, ok: false, reason: err.message, count: 0, links: [] };
  }
}

// Guess a college's catalog subdomain, e.g. https://catalog.foothill.edu/
function catalogGuesses(homeUrl) {
  try {
    const host = new URL(homeUrl).hostname.replace(/^www\./, '');
    return [
      `https://catalog.${host}/`,
      `https://catalog.${host}/course-outlines/`,
      `https://catalog.${host}/courses/`,
      `https://catalog.${host}/coursesaz/`,
      `https://catalog.${host}/course-descriptions/`,
    ];
  } catch {
    return [];
  }
}

export async function learnCollege(college) {
  const learnedAt = new Date().toISOString();
  const recipe = {
    slug: college.slug,
    name: college.name,
    url: college.url,
    platform: 'unknown',
    scheduleUrl: null,
    catalogUrl: null,
    extractUrl: null,        // the page we'll actually scrape
    method: null,            // 'auto' (generic extractor) | null
    sampleCount: 0,
    modalityCoverage: 0,
    candidates: [],
    confidence: 0,
    notes: '',
    learnedAt,
  };

  let home;
  try {
    home = await fetchText(college.url, { timeoutMs: 20000 });
  } catch (err) {
    recipe.notes = `Could not fetch homepage: ${err.message}`;
    saveRecipe(recipe);
    return recipe;
  }
  if (!home.ok) {
    recipe.notes = `Homepage returned HTTP ${home.status}`;
    saveRecipe(recipe);
    return recipe;
  }

  const $ = cheerio.load(home.body);
  const { schedule, catalog } = collectCandidates($, home.url);
  recipe.scheduleUrl = schedule[0]?.href || null;
  recipe.catalogUrl = catalog[0]?.href || null;
  recipe.candidates = [...schedule, ...catalog].slice(0, 10);
  recipe.platform = detectPlatform([
    recipe.scheduleUrl, recipe.catalogUrl, ...recipe.candidates.map((c) => c.href),
  ].filter(Boolean));

  // Bounded crawl (<= ~10 page fetches): start from the homepage's schedule &
  // catalog candidates plus guessed catalog subdomains; follow one hop deeper
  // into "course outlines / by subject" links. Keep the page yielding the most
  // real courses, preferring any page that also exposes modality.
  const visited = new Set([home.url]);
  const isBetter = (r, best) =>
    !best ||
    (r.modalityCoverage > 0.05 && best.modalityCoverage <= 0.05) ||
    (Math.sign(r.modalityCoverage - 0.05) === Math.sign(best.modalityCoverage - 0.05) && r.count > best.count);

  let best = null;
  let budget = 10;

  // Frontier of {href, depth}. Schedule first (modality), then catalog, then guesses.
  const frontier = [
    ...schedule.slice(0, 2).map((c) => ({ href: c.href, depth: 0 })),
    ...catalog.slice(0, 2).map((c) => ({ href: c.href, depth: 0 })),
    ...catalogGuesses(home.url).map((href) => ({ href, depth: 0 })),
  ];

  while (frontier.length && budget > 0) {
    const { href, depth } = frontier.shift();
    if (visited.has(href)) continue;
    visited.add(href);
    budget--;

    const r = await probe(href);
    if (r.ok && isBetter(r, best)) best = r;

    // If this page had no/few courses, follow its deeper links one more hop.
    if (depth < 2 && r.count < 50 && r.links && r.links.length) {
      const seen = new Set();
      r.links
        .sort((a, b) => b.score - a.score)
        .filter((l) => (seen.has(l.href) || visited.has(l.href) ? false : seen.add(l.href)))
        .slice(0, 3)
        .forEach((l) => frontier.push({ href: l.href, depth: depth + 1 }));
    }
    // Good enough — stop early once we have a solid haul with modality.
    if (best && best.count > 100 && best.modalityCoverage > 0.2) break;
  }

  if (best && best.count > 0) {
    recipe.extractUrl = best.url;
    recipe.method = 'auto';
    recipe.sampleCount = best.count;
    recipe.modalityCoverage = Number(best.modalityCoverage.toFixed(3));
    recipe.confidence = Math.min(1, 0.4 + Math.min(best.count, 200) / 400 + best.modalityCoverage * 0.4);
    recipe.notes =
      `Extracted ${best.count} real courses from ${best.url}. ` +
      (best.modalityCoverage > 0.05
        ? `Modality available for ~${Math.round(best.modalityCoverage * 100)}% (real schedule data).`
        : `Source is a catalog: real courses but modality not exposed here (defaults to in_person until a live-schedule adapter is added).`);
    saveSnapshot(college.slug, best.courses);
  } else {
    recipe.confidence = recipe.candidates.length ? 0.15 : 0;
    recipe.notes =
      recipe.candidates.length
        ? `Found entry links but no server-rendered course data — the schedule/catalog is likely a JavaScript app or behind a search form. Needs a headless-browser adapter. Best guesses saved above.`
        : `No schedule/catalog links found on the homepage (menu/JS/portal). Needs manual entry point.`;
  }

  saveRecipe(recipe);
  return recipe;
}

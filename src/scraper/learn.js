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
import { webSearch } from './search.js';
import { renderForCourses } from './browser.js';

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

// Common class-SCHEDULE entry points to brute-force when search/crawl come up dry.
// CA community colleges run a small set of registration platforms (Banner SSB,
// Ellucian Self-Service, district class-search pages), so the same host/path
// shapes recur. Cheap to try now that fetch retries + falls back gracefully.
function scheduleGuesses(homeUrl) {
  try {
    const host = new URL(homeUrl).hostname.replace(/^www\./, '');
    const paths = [
      'schedule', 'schedule-of-classes', 'class-schedule', 'classes', 'class-search',
      'find-classes', 'searchable-schedule', 'academics/schedule', 'admissions/class-schedule',
    ];
    const subs = ['ssb', 'banner', 'selfservice', 'ssb-prod', 'my', 'webadvisor', 'reg'];
    return [
      ...paths.map((p) => `https://www.${host}/${p}`),
      ...paths.map((p) => `https://${host}/${p}`),
      ...subs.map((s) => `https://${s}.${host}/`),
    ];
  } catch {
    return [];
  }
}

// A fresh, empty recipe skeleton. `source` records how discovery was seeded:
// 'homepage' (crawl from the college site) or 'web-search' (seed from a web search).
function blankRecipe(college, source) {
  return {
    slug: college.slug,
    name: college.name,
    url: college.url,
    source,
    platform: 'unknown',
    scheduleUrl: null,
    catalogUrl: null,
    extractUrl: null,        // the page we'll actually scrape
    method: null,            // 'auto' (generic extractor) | null
    sampleCount: 0,
    modalityCoverage: 0,
    candidates: [],
    searchQuery: null,       // set by learnCollegeViaSearch
    searchResults: [],       // set by learnCollegeViaSearch
    blocked: null,           // 'login' when a sign-in wall stopped the browser
    confidence: 0,
    notes: '',
    learnedAt: new Date().toISOString(),
  };
}

const isBetter = (r, best) =>
  !best ||
  (r.modalityCoverage > 0.05 && best.modalityCoverage <= 0.05) ||
  (Math.sign(r.modalityCoverage - 0.05) === Math.sign(best.modalityCoverage - 0.05) && r.count > best.count);

// Bounded crawl over a seed frontier of {href, depth}: probe each page, keep the
// one yielding the most real courses (preferring pages that expose modality), and
// follow promising "course outlines / by subject" links one hop deeper. Shared by
// both the homepage and web-search learn modes.
async function crawlForBest(frontier, visited, budget = 12, log = () => {}) {
  let best = null;
  while (frontier.length && budget > 0) {
    const { href, depth } = frontier.shift();
    if (!href || visited.has(href)) continue;
    visited.add(href);
    budget--;

    const r = await probe(href);
    log(`probe ${href} → ${r.ok ? `${r.count} courses` : `0 (${r.reason || 'no courses'})`}`);
    if (r.ok && isBetter(r, best)) {
      best = r;
      log(`  ↑ new best: ${best.count} courses, modality ${Math.round(best.modalityCoverage * 100)}%`);
    }

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
  return best;
}

// Fill in and persist a recipe from the best crawl result (or record failure).
// `best.method` is 'browser' when it came from a headless render, else 'auto'.
function finishRecipe(recipe, best, college, { foundNote = '', emptyNote = '', blocked = null, browserActions = [] } = {}) {
  if (browserActions.length) recipe.browserActions = browserActions;
  if (blocked) recipe.blocked = blocked;

  if (best && best.count > 0) {
    const viaBrowser = best.method === 'browser';
    recipe.extractUrl = best.url;
    recipe.method = viaBrowser ? 'browser' : 'auto';
    if (viaBrowser) recipe.browser = { settleMs: 2500 }; // render hints for the scrape adapter
    recipe.sampleCount = best.count;
    recipe.modalityCoverage = Number(best.modalityCoverage.toFixed(3));
    recipe.confidence = Math.min(1, 0.4 + Math.min(best.count, 200) / 400 + best.modalityCoverage * 0.4);
    recipe.notes =
      `Extracted ${best.count} real courses from ${best.url}` +
      (viaBrowser ? ' (rendered with a headless browser). ' : '. ') +
      (best.modalityCoverage > 0.05
        ? `Modality available for ~${Math.round(best.modalityCoverage * 100)}% (real schedule data).`
        : `Real courses but modality not exposed here (defaults to in_person).`) +
      (foundNote ? ` ${foundNote}` : '');
    saveSnapshot(college.slug, best.courses);
  } else if (blocked === 'login') {
    recipe.confidence = 0.1;
    recipe.notes =
      `Blocked by a sign-in wall — this college's schedule requires a login, the one thing the ` +
      `headless adapter is meant to stop at. Everything up to the login was reachable.` +
      (emptyNote ? ` ${emptyNote}` : '');
  } else {
    recipe.confidence = recipe.candidates.length ? 0.15 : 0;
    recipe.notes =
      emptyNote ||
      (recipe.candidates.length
        ? `Found entry links but no course data — likely a JavaScript app or a bespoke search form. Try "Deep learn (browser)".`
        : `No schedule/catalog links found on the homepage (menu/JS/portal). Needs manual entry point.`);
  }

  saveRecipe(recipe);
  return recipe;
}

// Headless fallback: when the plain-HTTP crawl came up empty (or thin), render the
// most promising pages in a real browser, drive the search form, and keep the best
// haul. Stops only at a sign-in wall. Returns { best, blocked, actions }.
async function browserRescue(recipe, httpBest, log = () => {}, maxRenders = 3) {
  const targets = [recipe.scheduleUrl, httpBest?.url, recipe.catalogUrl, ...recipe.candidates.map((c) => c.href)]
    .filter(Boolean);
  const tried = new Set();
  let best = httpBest;
  let blocked = null;
  const actions = [];

  for (const url of targets) {
    if (tried.has(url)) continue;
    tried.add(url);
    if (tried.size > maxRenders) break; // each render is slow — cap the attempts

    log(`render (headless Chrome) ${url} …`);
    const r = await renderForCourses(url);
    const line =
      `browser ${url} → ${r.courses.length} courses` +
      (r.blocked ? ` [${r.blocked}]` : '') +
      (r.error ? ` (err: ${r.error})` : '');
    actions.push(line);
    log(line);
    if (r.blocked) blocked = r.blocked;

    const cand = {
      url: r.finalUrl || url,
      method: 'browser',
      ok: r.courses.length > 0,
      count: r.courses.length,
      modalityCoverage: r.modalityCoverage,
      courses: r.courses,
    };
    if (cand.ok && isBetter(cand, best)) best = cand;
    if (best && best.method === 'browser' && best.count > 100) break; // solid haul — done
  }

  return { best, blocked, actions };
}

export async function learnCollege(college, { browser = false, onLog = null } = {}) {
  const log = (m) => { if (onLog) try { onLog(m); } catch { /* logging must never break learning */ } };
  const recipe = blankRecipe(college, 'homepage');

  log(`Fetching homepage ${college.url} …`);
  const home = await fetchText(college.url, { timeoutMs: 20000, retries: 3 });
  if (!home.ok) {
    const why = home.status ? `HTTP ${home.status}` : home.error || 'connection failed';
    recipe.notes = `Homepage unreachable (${why}) after retries + www/scheme fallback.`;
    log(`Homepage unreachable: ${why} (tried retries + www/scheme variants).`);
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
  log(`Homepage: ${schedule.length} schedule + ${catalog.length} catalog link(s); platform ${recipe.platform}.`);

  // Bounded crawl: start from the homepage's schedule & catalog candidates plus
  // guessed catalog subdomains; follow one hop deeper into "course outlines /
  // by subject" links. Schedule first (modality), then catalog, then guesses.
  const visited = new Set([home.url]);
  const frontier = [
    ...schedule.slice(0, 2).map((c) => ({ href: c.href, depth: 0 })),
    ...catalog.slice(0, 2).map((c) => ({ href: c.href, depth: 0 })),
    ...catalogGuesses(home.url).map((href) => ({ href, depth: 0 })),
  ];

  let best = await crawlForBest(frontier, visited, 12, log);

  // Plain HTTP got little/nothing — fall back to the headless browser if asked.
  let rescue = { blocked: null, actions: [] };
  if (browser && (!best || best.count < 25)) {
    log('Plain HTTP came up thin — escalating to the headless browser…');
    rescue = await browserRescue(recipe, best, log);
    best = rescue.best;
  }

  return finishRecipe(recipe, best, college, { blocked: rescue.blocked, browserActions: rescue.actions });
}

// Like learnCollege, but seeds discovery from a real web search ("<college> class
// schedule" / "<college> course catalog") instead of only the homepage. This finds
// course systems hosted on separate domains that the homepage never links cleanly.
export async function learnCollegeViaSearch(college, { browser = false, onLog = null, deep = false } = {}) {
  const log = (m) => { if (onLog) try { onLog(m); } catch { /* logging must never break learning */ } };
  const recipe = blankRecipe(college, deep ? 'web-search-deep' : 'web-search');
  const year = new Date().getFullYear();
  // `deep` casts a much wider net: more query phrasings (the schedule hides behind
  // many names) and a higher result cap, accepting more search volume to find the
  // colleges the basic two-query pass missed.
  const queries = deep
    ? [
        `${college.name} schedule of classes`,
        `${college.name} search for classes`,
        `${college.name} class schedule ${year}`,
        `${college.name} class search self service`,
        `${college.name} course catalog`,
        `${college.name} student registration class search`,
      ]
    : [
        `${college.name} class schedule`,
        `${college.name} course catalog`,
      ];
  recipe.searchQuery = queries[0];

  // Run the schedule query first; only fall back to later queries if results are
  // thin. This limits request volume in the common case, which matters because
  // search engines rate-limit bursts. Deep mode keeps going for more coverage.
  const enough = deep ? 10 : 4;
  const seen = new Set();
  const results = [];
  for (const q of queries) {
    let hits = [];
    try {
      hits = await webSearch(q, { limit: deep ? 8 : 6 });
    } catch {
      /* a single failed query shouldn't abort the others */
    }
    for (const h of hits) {
      if (seen.has(h.href)) continue;
      seen.add(h.href);
      results.push({ ...h, query: q });
    }
    log(`search "${q}" → ${hits.length} hit(s) (${results.length} unique so far)`);
    if (results.length >= enough) break;
  }
  recipe.searchResults = results.slice(0, 16);
  log(`Web search returned ${results.length} result(s).`);

  // Score result links the same way homepage candidates are — so schedule pages
  // (which carry modality) get probed before generic catalog pages.
  const ordered = results
    .map((h) => {
      const ss = scoreLink(h.title, h.href, SCHEDULE_HINTS, /schedule|class.*search|search.*class/);
      const cs = scoreLink(h.title, h.href, CATALOG_HINTS, /catalog|course.*(outline|description)/);
      return { ...h, score: Math.max(ss * 2, cs) }; // favor schedule hits
    })
    .sort((a, b) => b.score - a.score);

  recipe.candidates = ordered.slice(0, 10).map(({ title, href, score }) => ({ text: title, href, score }));
  recipe.scheduleUrl = ordered.find((h) => scoreLink(h.title, h.href, SCHEDULE_HINTS) > 0)?.href || null;
  recipe.catalogUrl = ordered.find((h) => scoreLink(h.title, h.href, CATALOG_HINTS) > 0)?.href || null;
  recipe.platform = detectPlatform(ordered.map((h) => h.href));

  // Seed the crawl from the top search hits. In deep mode (or when search came
  // back empty), ALSO brute-force the common schedule/catalog URL shapes so a
  // blocked/empty search engine no longer dead-ends the college.
  const guesses = deep || !results.length
    ? [...scheduleGuesses(college.url), ...catalogGuesses(college.url)]
    : [];
  const visited = new Set([college.url]);
  const frontier = [
    ...ordered.slice(0, deep ? 10 : 8).map((h) => ({ href: h.href, depth: 0 })),
    ...guesses.map((href) => ({ href, depth: 0 })),
  ];
  if (!frontier.length) {
    recipe.notes = 'Web search returned no results and no URL guesses applied.';
    log('No search results and no guesses — nothing to crawl.');
    saveRecipe(recipe);
    return recipe;
  }
  log(`Top candidate: ${frontier[0]?.href || '(none)'} (platform: ${recipe.platform}); ${guesses.length} URL guess(es) queued.`);
  let best = await crawlForBest(frontier, visited, deep ? 28 : 12, log);

  // Plain HTTP got little/nothing — render the top hits in a real browser if asked.
  let rescue = { blocked: null, actions: [] };
  if (browser && (!best || best.count < 25)) {
    log('Plain HTTP came up thin — escalating to the headless browser…');
    rescue = await browserRescue(recipe, best, log, deep ? 6 : 3);
    best = rescue.best;
  }

  return finishRecipe(recipe, best, college, {
    blocked: rescue.blocked,
    browserActions: rescue.actions,
    foundNote: `Discovered via web search "${recipe.searchQuery}".`,
    emptyNote:
      `Searched the web (${results.length} results) but no page yielded course data — ` +
      `the schedule is likely a bespoke search app. Top results saved above.`,
  });
}

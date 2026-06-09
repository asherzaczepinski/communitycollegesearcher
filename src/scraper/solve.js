// "Solving Impossibles" — a smarter, multi-strategy engine for the colleges the
// standard runner couldn't crack.
//
// The guiding idea (per the brief): DON'T just guess URLs. Visit the real
// homepage, see the links that are actually there, and explore them like a person
// would — follow "Academics → Class Schedule", "Admissions → Catalog", etc. Then,
// if that doesn't pan out, try genuinely DIFFERENT approaches, each independent:
//
//   Strategy 1  Explore real homepage links (HTTP)        — only links that exist
//   Strategy 2  Mine sitemap.xml / robots.txt             — the site's own index
//   Strategy 3  Render homepage + explore JS menu links   — catches JS-built navs
//   Strategy 4  Deep web search + headless form-driving   — wide net, off-site apps
//
// The first strategy that yields real courses wins; we record WHICH one and
// ingest the courses into the searchable DB. Every step streams to the live log.
import * as cheerio from 'cheerio';
import { fetchText, absoluteUrl } from './fetch.js';
import { extractCourses } from './extract.js';
import { learnCollegeViaSearch } from './learn.js';
import { webSearch } from './search.js';
import { renderHtml, renderForCourses, detectLogin, closeDriver } from './browser.js';
import { saveRecipe, saveSnapshot, loadSnapshot } from './kb.js';
import { ingestCourses } from './ingest.js';
import * as progress from './progress.js';

const iso = () => new Date().toISOString();

// Watchdog: no single strategy may run longer than this, and no single college
// longer than the overall budget. Selenium can wedge on heavy schedule apps and
// must never be allowed to hang the whole batch.
const STRATEGY_TIMEOUT_MS = 120000; // 2 min per strategy
const COLLEGE_BUDGET_MS = 330000; // ~5.5 min per college, then wrap up with best-so-far

const TIMEOUT = Symbol('timeout');
function withTimeout(promise, ms) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => reject(TIMEOUT), ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

// A page is only a real sign-in WALL if the URL itself is an SSO/login URL, or it's
// a tiny login-only page. Content-rich homepages often embed a portal login widget
// (password field + "sign in") — that must NOT count as a wall, or we'd never
// explore the real navigation links that are right there on the page.
const LOGIN_URL_RE =
  /(^|\.)(login|signin|sso|idp|auth|adfs|shibboleth|cas|okta|microsoftonline|accounts\.google)\.|\/(login|signin|sign-in|cas\/login|adfs|oauth2?\/authorize|saml|shibboleth)\b/i;
function isLoginWall(html, url) {
  try {
    const u = new URL(url);
    if (LOGIN_URL_RE.test(u.hostname) || LOGIN_URL_RE.test(u.pathname)) return true;
  } catch {
    /* ignore */
  }
  // A small page that is essentially just a login form (not a big content page).
  return html.length < 30000 && detectLogin(html, url);
}

// Score a real anchor by how likely following it leads to the course list. Gateway
// pages (Academics/Admissions) score lower than direct Schedule/Catalog links, but
// still get followed — that's how a human navigates there.
function scoreNav(text, href) {
  const hay = `${text} ${href}`.toLowerCase();
  let s = 0;
  if (/schedule of classes|class schedule|search for classes|class search|find classes|browse classes/.test(hay)) s += 6;
  if (/\bschedule\b|\bclasses\b/.test(hay)) s += 3;
  if (/catalog|course outline|course descriptions?|courses a-?z|all courses|course list/.test(hay)) s += 5;
  if (/registration|register|enroll/.test(hay)) s += 3;
  if (/academics|admissions|programs|departments|\bstudents?\b|future students/.test(hay)) s += 2;
  return s;
}

// Fetch a page's HTML — via headless Chrome (to capture JS-built menus) or plain
// HTTP. Always resolves to { ok, body, url }.
async function getPage(url, useBrowser) {
  if (useBrowser) {
    try {
      const html = await renderHtml(url, { settleMs: 1500, timeoutMs: 20000 });
      if (html) return { ok: true, body: html, url };
    } catch {
      /* fall back to HTTP */
    }
  }
  const r = await fetchText(url, { retries: 2 });
  return { ok: r.ok, body: r.body, url: r.url || url };
}

const better = (r, best) =>
  !best || r.count > best.count || (r.modalityCoverage > 0.05 && best.modalityCoverage <= 0.05);

// "Good enough to stop early." A handful of courses scraped off some marketing
// page isn't the real schedule — keep trying other strategies unless we've got a
// substantial haul (or a solid, modality-bearing one). Otherwise run ALL
// strategies and keep the global best (even if small — still real data).
const goodEnough = (b) => !!b && (b.count >= 40 || (b.count >= 12 && b.modalityCoverage > 0.1));

// --- Strategy 1 & 3: explore REAL links from the homepage ------------------
// BFS over links that actually exist on the page, scored toward course data.
// Same-site only (incl. catalog./schedule. subdomains of the apex). No URL guessing.
export async function exploreLinks(college, { onLog = () => {}, useBrowser = false, maxPages = 22, maxDepth = 3 } = {}) {
  let apex;
  try {
    apex = new URL(college.url).hostname.replace(/^www\./, '');
  } catch {
    return { best: null, blocked: null };
  }
  const sameSite = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '').endsWith(apex);
    } catch {
      return false;
    }
  };

  const visited = new Set();
  const frontier = [{ url: college.url, depth: 0, score: 99 }];
  let best = null;
  let blocked = null;
  let budget = maxPages;

  while (frontier.length && budget > 0) {
    frontier.sort((a, b) => b.score - a.score);
    const { url, depth } = frontier.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    budget--;

    // Render only the homepage in Chrome (that's where JS-built menus live); explore
    // everything deeper over fast HTTP. Keeps the strategy thorough but not glacial.
    const page = await getPage(url, useBrowser && depth === 0);
    if (!page.ok || !page.body) {
      onLog(`  explore ${url} → unreachable`);
      continue;
    }
    if (isLoginWall(page.body, page.url)) {
      blocked = 'login';
      onLog(`  explore ${url} → 🔒 sign-in page (skipping, continuing with other links)`);
      continue; // skip this page only — keep exploring the rest of the frontier
    }
    const { courses, modalityCoverage } = extractCourses(page.body, { pageUrl: page.url });
    onLog(`  explore ${url} → ${courses.length} course(s)${courses.length ? ` (${Math.round(modalityCoverage * 100)}% modality)` : ''}`);
    const cand = { url: page.url, count: courses.length, courses, modalityCoverage, method: useBrowser && depth === 0 ? 'browser' : 'auto' };
    if (courses.length && better(cand, best)) {
      best = cand;
      if (best.count > 120 && best.modalityCoverage > 0.1) break; // plenty — stop
    }

    if (depth < maxDepth) {
      const $ = cheerio.load(page.body);
      const links = [];
      $('a[href]').each((_, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        const raw = $(el).attr('href');
        if (!raw) return;
        const href = absoluteUrl(raw, page.url);
        if (!href || !sameSite(href) || visited.has(href)) return;
        const s = scoreNav(t, href);
        if (s > 0) links.push({ href, score: s });
      });
      const seen = new Set();
      links
        .sort((a, b) => b.score - a.score)
        .filter((l) => (seen.has(l.href) ? false : seen.add(l.href)))
        .slice(0, depth === 0 ? 8 : 4)
        .forEach((l) => frontier.push({ url: l.href, depth: depth + 1, score: l.score }));
    }
  }
  return { best, blocked };
}

// --- Strategy 2: mine the site's own sitemap / robots ----------------------
function rootOf(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}`;
}
const locsIn = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

export async function mineSitemaps(college, { onLog = () => {} } = {}) {
  let root;
  try {
    root = rootOf(college.url);
  } catch {
    return { best: null, blocked: null };
  }
  const sitemaps = new Set([`${root}/sitemap.xml`, `${root}/sitemap_index.xml`, `${root}/sitemap-index.xml`]);

  // robots.txt often points at the real sitemap(s).
  const robots = await fetchText(`${root}/robots.txt`, { retries: 1 });
  if (robots.ok) {
    for (const m of robots.body.matchAll(/sitemap:\s*(\S+)/gi)) sitemaps.add(m[1].trim());
  }

  const urls = new Set();
  let nested = 0;
  for (const sm of [...sitemaps].slice(0, 5)) {
    const r = await fetchText(sm, { retries: 1 });
    if (!r.ok) {
      onLog(`  sitemap ${sm} → none`);
      continue;
    }
    const locs = locsIn(r.body);
    onLog(`  sitemap ${sm} → ${locs.length} entr${locs.length === 1 ? 'y' : 'ies'}`);
    for (const loc of locs) {
      if (/\.xml(\.gz)?$/i.test(loc)) {
        if (nested++ < 8) {
          const r2 = await fetchText(loc, { retries: 1 });
          if (r2.ok) for (const u of locsIn(r2.body)) urls.add(u);
        }
      } else {
        urls.add(loc);
      }
    }
  }

  const candidates = [...urls].filter((u) => /catalog|schedule|course|class|curricul/i.test(u));
  onLog(`  sitemap mining → ${urls.size} URL(s), ${candidates.length} course-ish to probe`);
  let best = null;
  for (const u of candidates.slice(0, 18)) {
    const r = await fetchText(u, { retries: 1 });
    if (!r.ok) continue;
    const { courses, modalityCoverage } = extractCourses(r.body, { pageUrl: r.url });
    if (courses.length) {
      onLog(`  sitemap probe ${u} → ${courses.length}`);
      const cand = { url: r.url, count: courses.length, courses, modalityCoverage, method: 'auto' };
      if (better(cand, best)) best = cand;
      if (best.count > 120) break;
    }
  }
  return { best, blocked: null };
}

// --- Strategy: exhaustive search sweep -------------------------------------
// "Try different Google searches and shit." Fire a big battery of distinct query
// phrasings at the engine chain (DDG/Mojeek/Bing), pool + dedupe every link they
// surface, probe them for courses (following a couple real deep links each), then
// browser-drive the schedule-looking results. This is the widest net we cast.
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

async function probeUrl(url) {
  const r = await fetchText(url, { retries: 1 });
  if (!r.ok) return { ok: false, url, courses: [], modalityCoverage: 0, links: [] };
  if (isLoginWall(r.body, r.url)) return { login: true, url: r.url, courses: [], modalityCoverage: 0, links: [] };
  const { courses, modalityCoverage } = extractCourses(r.body, { pageUrl: r.url });
  const $ = cheerio.load(r.body);
  const links = [];
  $('a[href]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    const raw = $(el).attr('href');
    if (!raw) return;
    const href = absoluteUrl(raw, r.url);
    if (!href) return;
    const s = scoreNav(t, href);
    if (s >= 4) links.push({ href, score: s });
  });
  return { ok: courses.length > 0, url: r.url, courses, modalityCoverage, links };
}

async function searchSweep(college, { onLog = () => {}, browser = true } = {}) {
  const name = college.name;
  const host = hostOf(college.url);
  const year = new Date().getFullYear();
  const queries = [
    `${name} schedule of classes`,
    `${name} search for classes`,
    `${name} class schedule ${year}`,
    `${name} class schedule spring ${year}`,
    `${name} class schedule fall ${year}`,
    `${name} public class search`,
    `${name} self service banner class search`,
    `${name} ellucian self service class schedule`,
    `${name} webadvisor class schedule`,
    `${name} courses by subject`,
    `${name} course catalog`,
    host && `site:${host} schedule of classes`,
    host && `site:${host} class schedule`,
  ].filter(Boolean);

  const seen = new Set();
  const found = [];
  for (const q of queries) {
    let hits = [];
    try {
      hits = await webSearch(q, { limit: 6 });
    } catch {
      /* one query failing shouldn't stop the sweep */
    }
    let add = 0;
    for (const h of hits) {
      if (!h.href || seen.has(h.href)) continue;
      seen.add(h.href);
      found.push({ ...h, q });
      add++;
    }
    onLog(`  google "${q}" → ${hits.length} hit(s) (+${add} new, ${found.length} pooled)`);
  }
  if (!found.length) {
    onLog('  search sweep → every engine returned nothing (likely rate-limited).');
    return { best: null, blocked: null };
  }

  const scored = found
    .map((h) => ({ ...h, score: scoreNav(h.title || '', h.href) }))
    .sort((a, b) => b.score - a.score);

  // Probe the pooled links (+ the catalog subdomain as a safe seed), following a
  // couple of real "by subject / courses A-Z" links off each.
  let best = null;
  let blocked = null;
  const visited = new Set();
  const frontier = scored.slice(0, 16).map((h) => h.href);
  if (host) frontier.push(`https://catalog.${host}/`);
  let budget = 22;
  while (frontier.length && budget > 0) {
    const url = frontier.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    budget--;
    const r = await probeUrl(url);
    if (r.login) {
      blocked = 'login';
      onLog(`  probe ${url} → 🔒 sign-in`);
      continue;
    }
    onLog(`  probe ${url} → ${r.courses.length} course(s)`);
    const cand = { url: r.url, count: r.courses.length, courses: r.courses, modalityCoverage: r.modalityCoverage, method: 'auto' };
    if (r.courses.length && better(cand, best)) best = cand;
    if (best && best.count > 120 && best.modalityCoverage > 0.1) break;
    (r.links || []).sort((a, b) => b.score - a.score).slice(0, 2).forEach((l) => {
      if (!visited.has(l.href)) frontier.push(l.href);
    });
  }

  // Still thin? Render + drive the schedule-looking results in a real browser.
  if (browser && (!best || best.count < 25)) {
    const sched = scored
      .filter((h) => /schedule|class.*search|search.*class|self.?service|banner/i.test(`${h.title} ${h.href}`))
      .slice(0, 4);
    for (const h of sched) {
      onLog(`  render+drive ${h.href} …`);
      let r;
      try {
        r = await renderForCourses(h.href);
      } catch (e) {
        onLog(`   render error: ${e.message}`);
        continue;
      }
      if (r.blocked) blocked = r.blocked;
      onLog(`  render ${h.href} → ${r.courses.length} course(s)${r.blocked ? ` [${r.blocked}]` : ''}`);
      const cand = { url: r.finalUrl || h.href, count: r.courses.length, courses: r.courses, modalityCoverage: r.modalityCoverage, method: 'browser' };
      if (r.courses.length && better(cand, best)) best = cand;
      if (best && best.count > 80) break;
    }
  }
  return { best, blocked };
}

// --- Strategy: deep web search + headless form-driving ---------------------
async function deepSearch(college, onLog) {
  const r = await learnCollegeViaSearch(college, { browser: true, onLog, deep: true });
  const snap = r.sampleCount > 0 ? loadSnapshot(college.slug) : null;
  const best = snap
    ? { url: r.extractUrl, count: r.sampleCount, courses: snap.courses, modalityCoverage: r.modalityCoverage || 0, method: r.method || 'auto' }
    : null;
  return { best, blocked: r.blocked || null };
}

// --- Orchestrator ----------------------------------------------------------
export async function solveImpossible(college) {
  const slug = college.slug;
  progress.ensure(college);
  let attempts = progress.get(slug)?.attempts || 0;
  progress.update(slug, { status: 'running', startedAt: iso(), finishedAt: null, blocked: null, note: '' });
  const onLog = (m) => progress.log(slug, m);
  onLog(`▶ Solving ${college.name} — ${college.url}  [smart multi-strategy]`);

  const strategies = [
    ['Explore real homepage links (HTTP)', () => exploreLinks(college, { onLog, useBrowser: false })],
    ['Mine sitemap.xml / robots.txt', () => mineSitemaps(college, { onLog })],
    ['Render homepage + explore JS menu links', () => exploreLinks(college, { onLog, useBrowser: true, maxPages: 14 })],
    ['Exhaustive Google/DDG search sweep', () => searchSweep(college, { onLog, browser: true })],
    ['Deep web search + headless form-driving', () => deepSearch(college, onLog)],
  ];

  let best = null;
  let winning = null;
  let blocked = null;
  const t0 = Date.now();
  try {
    for (const [name, fn] of strategies) {
      if (Date.now() - t0 > COLLEGE_BUDGET_MS) {
        onLog(`   ⏱ college time budget reached — wrapping up with best so far.`);
        break;
      }
      attempts++;
      onLog(`── Strategy: ${name}`);
      let r;
      try {
        r = await withTimeout(fn(), STRATEGY_TIMEOUT_MS);
      } catch (e) {
        if (e === TIMEOUT) {
          onLog(`   ⏱ strategy timed out after ${STRATEGY_TIMEOUT_MS / 1000}s — resetting Chrome and moving on.`);
          await closeDriver().catch(() => {}); // a wedged render must not poison the next strategy/college
        } else {
          onLog(`   strategy error: ${e.message}`);
        }
        continue;
      }
      if (r.blocked === 'login') blocked = 'login';
      if (r.best && r.best.count > 0 && better(r.best, best)) {
        best = r.best;
        winning = name;
        onLog(`   ✓ "${name}" found ${best.count} course(s)`);
      }
      // Stop early only on a SUBSTANTIAL haul — a few stray courses isn't the real
      // schedule, so keep trying other strategies for something better.
      if (goodEnough(best)) {
        onLog(`   solid haul (${best.count} courses) — stopping strategy ladder.`);
        break;
      }
      // NOTE: a login wall on one page does NOT stop us — another strategy
      // (sitemap, search) may still find a public catalog. Keep trying.
    }
  } catch (err) {
    onLog(`⚠ Error: ${err.message}`);
    return progress.update(slug, { status: 'error', attempts, finishedAt: iso(), note: err.message });
  }

  if (best) {
    const recipe = {
      slug,
      name: college.name,
      url: college.url,
      source: 'solve',
      strategy: winning,
      platform: 'unknown',
      extractUrl: best.url,
      method: best.method,
      sampleCount: best.count,
      modalityCoverage: Number((best.modalityCoverage || 0).toFixed(3)),
      confidence: 0.6,
      notes: `Solved via "${winning}" — ${best.count} courses from ${best.url}.`,
      learnedAt: iso(),
    };
    saveSnapshot(slug, best.courses);
    saveRecipe(recipe);
    const n = ingestCourses(college, best.courses, { method: best.method, recipe, tag: 'solved' });
    onLog(`✅ SOLVED — ${n} courses ingested into the searchable DB (strategy: ${winning}).`);
    return progress.update(slug, {
      status: 'live',
      attempts,
      courseCount: n,
      modalityCoverage: recipe.modalityCoverage,
      method: best.method,
      extractUrl: best.url,
      strategy: winning,
      blocked: null,
      finishedAt: iso(),
      note: recipe.notes,
    });
  }
  if (blocked === 'login') {
    onLog('🔒 BLOCKED — the class schedule is gated behind a sign-in page. That is the one legitimate stop.');
    return progress.update(slug, { status: 'blocked', attempts, blocked: 'login', finishedAt: iso(), note: 'Class schedule requires sign-in (the only acceptable hard stop).' });
  }
  onLog('🚫 No public course data found yet — exhausted link exploration, sitemap mining, rendered menus, an exhaustive search sweep, and form-driving, and hit NO sign-in wall. Re-run "Solve" to try again (fresh searches / less rate-limiting).');
  return progress.update(slug, {
    status: 'impossible',
    attempts,
    finishedAt: iso(),
    note: 'No login wall found, but no public schedule surfaced through 5 strategies incl. an exhaustive search sweep. Retryable.',
  });
}

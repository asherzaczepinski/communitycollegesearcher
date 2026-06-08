// Minimal, key-free web search by scraping search engines' server-rendered HTML.
// Used by the "Search & learn" flow to find a college's class-schedule or catalog
// system when it lives on a domain the homepage never links cleanly.
//
// We try several engines that return plain HTML (no JavaScript) so cheerio can
// read them, falling through on failure — any single engine may rate-limit a
// burst of queries (DuckDuckGo answers a throttled request with HTTP 202 and no
// results), so a fallback chain keeps the feature usable.
import * as cheerio from 'cheerio';
import { fetchText } from './fetch.js';

// Keep a result only if it's a real external http(s) page (not the engine itself).
function cleanUrl(raw, engineHostRe) {
  if (!raw) return null;
  try {
    const u = new URL(raw, 'https://example.com');
    if (!/^https?:$/.test(u.protocol)) return null;
    if (engineHostRe.test(u.hostname)) return null; // ads / internal links
    return u.href;
  } catch {
    return null;
  }
}

// DuckDuckGo wraps outbound links as //duckduckgo.com/l/?uddg=<encoded-real-url>.
function unwrapDdg(href) {
  if (!href) return null;
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    return cleanUrl(uddg ? decodeURIComponent(uddg) : u.href, /(^|\.)duckduckgo\.com$/i);
  } catch {
    return null;
  }
}

// Each engine: a URL builder and a cheerio parser yielding [{ title, href }].
const ENGINES = [
  {
    name: 'ddg-html',
    url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    parse: ($) =>
      $('a.result__a').map((_, el) => ({ title: $(el).text(), href: unwrapDdg($(el).attr('href')) })).get(),
  },
  {
    name: 'ddg-lite',
    url: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
    parse: ($) =>
      $('a.result-link').map((_, el) => ({ title: $(el).text(), href: unwrapDdg($(el).attr('href')) })).get(),
  },
  {
    name: 'mojeek',
    url: (q) => `https://www.mojeek.com/search?q=${encodeURIComponent(q)}`,
    parse: ($) =>
      $('a.title, ul.results-standard li a.title').map((_, el) => ({
        title: $(el).text(),
        href: cleanUrl($(el).attr('href'), /(^|\.)mojeek\.com$/i),
      })).get(),
  },
  {
    name: 'bing',
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&count=20`,
    parse: ($) =>
      $('li.b_algo h2 a').map((_, el) => ({
        title: $(el).text(),
        href: cleanUrl($(el).attr('href'), /(^|\.)bing\.com$/i),
      })).get(),
  },
];

function dedupe(rows, limit) {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const title = (r.title || '').replace(/\s+/g, ' ').trim();
    if (!title || !r.href || seen.has(r.href)) continue;
    seen.add(r.href);
    out.push({ title, href: r.href });
    if (out.length >= limit) break;
  }
  return out;
}

// Return [{ title, href }] for a query, best-effort. Never throws for "no results";
// returns [] only if every engine is unreachable or blocks us.
export async function webSearch(query, { limit = 8 } = {}) {
  for (const engine of ENGINES) {
    try {
      const res = await fetchText(engine.url(query), { timeoutMs: 20000 });
      // DDG answers throttled requests with 202 + a placeholder page; the parser
      // simply finds no result links and we fall through to the next engine.
      if (res.status >= 400) continue;
      const hits = dedupe(engine.parse(cheerio.load(res.body)), limit);
      if (hits.length) return hits;
    } catch {
      /* try the next engine */
    }
  }
  return [];
}

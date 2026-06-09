// Ellucian Colleague Self-Service course-catalog client.
//
// Discovered via Perplexity research into colleges we couldn't otherwise scrape
// (Palo Verde, Napa Valley, …): many CA community colleges run Ellucian Colleague
// Self-Service, and its **course catalog search is PUBLIC** — no student login.
// The page is an Angular SPA so the HTML has no data, but it talks to a JSON API:
//
//   1. GET  https://<host>/Student/Courses
//        -> sets cookie `.ColleagueSelfServiceAntiforgery`
//        -> HTML contains <input name="__RequestVerificationToken" value="...">
//   2. POST https://<host>/Student/Courses/PostSearchCriteria
//        headers: __RequestVerificationToken: <token>, X-Requested-With: XMLHttpRequest
//        body: the criteria object DIRECTLY (NOT wrapped in {"searchParameters":...}
//              — the wrapper is silently ignored and you get the default first page)
//        -> { Courses:[{SubjectCode,Number,Title,Description,MinimumCredits,
//             MaximumCredits,MatchingSectionIds,...}], TotalItems, TotalPages, ... }
//
// The antiforgery token (CSRF) is the only gate — fetch it once, reuse it. Terms
// like "2026FA"/"2026SP" are optional; omitting them returns the full catalog.
// Pagination: pageNumber + quantityPerPage both work; a single big quantityPerPage
// (e.g. 9999) returns the whole catalog in one request.
import { normalizeModality } from './modality.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// slug -> Colleague Self-Service host, for colleges confirmed to run it with a
// PUBLIC catalog. Hosts don't follow a guessable pattern, so each is verified by
// hand (found via the college's class-search page or Perplexity). Add as found.
export const COLLEAGUE_HOSTS = {
  'palo-verde-college': 'prod-selfserv.paloverde.edu',
};

export function colleagueHost(slug) {
  return COLLEAGUE_HOSTS[slug] || null;
}

// GET the search page; return { token, cookie } for the antiforgery handshake.
async function handshake(host) {
  const res = await fetch(`https://${host}/Student/Courses`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Self-Service handshake HTTP ${res.status}`);
  const html = await res.text();
  const token = (html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) || [])[1];
  if (!token) throw new Error('no antiforgery token on /Student/Courses (not Colleague Self-Service?)');
  // collect Set-Cookie name=value pairs
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0]).join('; ');
  return { token, cookie };
}

async function postSearch(host, { token, cookie }, criteria) {
  const res = await fetch(`https://${host}/Student/Courses/PostSearchCriteria`, {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest', __RequestVerificationToken: token,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(criteria), // criteria go at the TOP LEVEL, not wrapped
  });
  if (!res.ok) throw new Error(`PostSearchCriteria HTTP ${res.status}`);
  return res.json();
}

// Map a Colleague course object to our normalized course shape.
function toCourse(c, host) {
  const code = `${c.SubjectCode || ''}${c.SubjectCode && c.Number ? ' ' : ''}${c.Number || ''}`.trim() || null;
  const credits = c.MinimumCredits != null
    ? (c.MaximumCredits && c.MaximumCredits !== c.MinimumCredits
        ? `${c.MinimumCredits}-${c.MaximumCredits}` : String(c.MinimumCredits))
    : null;
  return {
    code,
    title: (c.Title || '').trim() || code || 'Untitled',
    // Catalog level has no per-section delivery; infer online from the text, else
    // leave the normalizer's default. Section-level modality is a future add.
    modality: normalizeModality(`${c.Title || ''} ${c.Description || ''}`),
    term: Array.isArray(c.TermsOffered) ? c.TermsOffered.join(', ') || null : null,
    units: credits,
    instructor: null,
    section: Array.isArray(c.MatchingSectionIds) && c.MatchingSectionIds.length
      ? c.MatchingSectionIds[0] : null,
    description: (c.Description || '').replace(/\s+/g, ' ').trim() || null,
    url: `https://${host}/Student/Courses/Search`,
  };
}

// Fetch the full public course catalog from a Colleague Self-Service host.
// `terms` filters to specific term codes (e.g. ['2026FA']); omit for all.
export async function fetchColleagueCourses(host, { terms = [], pageSize = 5000, onProgress = null } = {}) {
  const hs = await handshake(host);
  const base = {
    keyword: null, terms, openSections: null, subjects: [], academicLevels: [],
    pageNumber: 1, sortOn: 'None', sortDirection: 'Ascending',
    quantityPerPage: pageSize, searchResultsView: 'CatalogListing',
  };
  const out = [];
  const seen = new Set();
  // A big quantityPerPage returns the whole catalog in one request; if the host
  // caps the page size below TotalItems, fall through to page-by-page.
  let page = 1, totalPages = 1;
  do {
    const data = await postSearch(host, hs, { ...base, pageNumber: page });
    totalPages = data.TotalPages || 1;
    for (const c of data.Courses || []) {
      const key = `${c.SubjectCode}${c.Number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(toCourse(c, host));
    }
    if (onProgress) onProgress({ host, page, totalPages, found: out.length });
    page += 1;
  } while (page <= totalPages);
  return out;
}

// Probe whether a host looks like a live, public Colleague Self-Service.
export async function isColleagueHost(host) {
  try { await handshake(host); return true; } catch { return false; }
}

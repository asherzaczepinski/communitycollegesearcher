// Robust fetch helper. College sites are flaky: they drop connections, rate-limit
// bursts, redirect www<->apex, and sometimes only answer one scheme. A single
// `fetch failed` is almost never a real dead-end — it's a blip. So this:
//   - sends real browser-like headers (some WAFs 403 unknown bots),
//   - retries network errors and 408/429/5xx with backoff + jitter,
//   - on DNS/connection failure, falls back to www<->apex and https<->http,
//   - never throws: returns { ok, status, url, body, error } so callers can log
//     a real reason instead of a useless "could not fetch".
import { recordRequest } from './usage.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Connection-level failure code worth retrying / falling back from (vs. a clean
// HTTP response we should just return).
function netErrorCode(err) {
  return err?.cause?.code || err?.code || (err?.name === 'AbortError' ? 'TIMEOUT' : err?.message) || 'ERR';
}

// Build the list of URLs to try: the original, then www<->apex, then the other
// scheme. De-duped, original first.
function urlVariants(url) {
  const out = [url];
  try {
    const u = new URL(url);
    const swapWww = new URL(url);
    swapWww.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
    out.push(swapWww.href);
    const swapScheme = new URL(url);
    swapScheme.protocol = u.protocol === 'https:' ? 'http:' : 'https:';
    out.push(swapScheme.href);
  } catch {
    /* unparseable — just try it as-is */
  }
  return [...new Set(out)];
}

async function once(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: ctrl.signal });
    const body = await res.text();
    recordRequest(body.length); // meter network usage for the UI
    return { ok: res.ok, status: res.status, url: res.url, body };
  } finally {
    clearTimeout(t);
  }
}

// Try one URL up to `retries+1` times, backing off on retryable failures.
async function fetchWithRetries(url, timeoutMs, retries) {
  let last = { ok: false, status: 0, url, body: '', error: 'unknown' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await once(url, timeoutMs);
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res; // success or hard status → done
      last = { ...res, error: `HTTP ${res.status}` };
    } catch (err) {
      last = { ok: false, status: 0, url, body: '', error: netErrorCode(err), retryable: true };
    }
    if (attempt < retries) await sleep(400 * (attempt + 1) + Math.floor(Math.random() * 300));
  }
  return last;
}

// Fetch text, never throwing. Falls back across www/scheme variants when the
// connection itself fails (DNS/refused/reset), retries flaky responses.
export async function fetchText(url, { timeoutMs = 20000, retries = 2 } = {}) {
  const variants = urlVariants(url);
  let last = { ok: false, status: 0, url, body: '', error: 'unknown' };
  for (const target of variants) {
    const res = await fetchWithRetries(target, timeoutMs, retries);
    if (res.ok) return res;
    last = res;
    // Only try the next variant when the connection failed outright
    // (DNS/refused/reset/timeout). A real HTTP status means the host answered.
    if (res.status !== 0) break;
  }
  return last;
}

export function absoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

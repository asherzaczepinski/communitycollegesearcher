// Headless-browser rendering via Selenium + Chrome.
//
// Many college class schedules are JavaScript apps: the course list is injected
// into the DOM after load (and often only AFTER you submit a search form), so a
// plain fetch() sees an empty shell. This renders the page in real Chrome, drives
// the minimal interaction needed to reveal the class list, and returns the courses
// the generic extractor finds.
//
// Design rule: the ONLY thing that should ever stop us is a real sign-in wall.
// Everything else (lazy JS, "click Search to see classes", pagination) we drive
// through automatically. When we hit a login/SSO page we stop and say so plainly.
//
// Chrome must be installed; Selenium Manager auto-downloads the matching driver.
import { Builder, until, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { extractCourses } from './extract.js';

let driverPromise = null;

function buildDriver() {
  const options = new chrome.Options();
  options.addArguments(
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1400,2400',
    '--blink-settings=imagesEnabled=false', // skip images — we only want the DOM
    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0 Safari/537.36'
  );
  // 'eager' returns control at DOMContentLoaded instead of waiting for every last
  // XHR/image — SPA schedules often never reach full 'load', which would hang get().
  options.setPageLoadStrategy('eager');
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

// One shared driver for the whole run (cheaper than spinning up per page).
export async function getDriver() {
  if (!driverPromise) driverPromise = buildDriver();
  return driverPromise;
}

export async function closeDriver() {
  if (driverPromise) {
    const d = await driverPromise;
    await d.quit().catch(() => {});
    driverPromise = null;
  }
}

// --- Sign-in detection -----------------------------------------------------
// The one legitimate blocker. We look at both the URL (SSO/IdP hosts and login
// paths) and the page itself (a password field with sign-in chrome).
const LOGIN_HOST = /(^|\.)(login|signin|sso|idp|auth|adfs|shibboleth|cas|okta|microsoftonline|accounts\.google)\./i;
const LOGIN_PATH = /\/(login|signin|sign-in|cas\/login|adfs|oauth2?\/authorize|saml|shibboleth)\b/i;
const LOGIN_TEXT = /\b(sign in|signin|log ?in|single sign-?on|enter your password|student id and password)\b/i;

export function detectLogin(html, url = '') {
  try {
    const u = new URL(url);
    if (LOGIN_HOST.test(u.hostname) || LOGIN_PATH.test(u.pathname)) return true;
  } catch {
    /* ignore unparseable url */
  }
  const hasPassword = /<input[^>]+type=["']?password/i.test(html);
  return hasPassword && LOGIN_TEXT.test(html);
}

// --- Interaction helpers ---------------------------------------------------
// Words on the control that reveals a class list once clicked.
const REVEAL_WORDS =
  /\b(search|find classes?|find courses?|show results|view results|browse|list all|see all|get classes|display|view classes|go)\b/i;
const NEXT_WORDS = /^(next|next ›|next »|»|›|more results|show more|load more)$/i;

const lc = (s) => String(s || '').toLowerCase();

// In each <select>, prefer an inclusive option ("All", "Any", "View All") so the
// search isn't narrowed to one subject/campus.
async function selectInclusiveOptions(driver) {
  const selects = await driver.findElements(By.css('select')).catch(() => []);
  for (const sel of selects.slice(0, 12)) {
    try {
      const opts = await sel.findElements(By.css('option'));
      for (const o of opts) {
        if (/\b(all|any)\b|view all|-- *select/i.test(lc(await o.getText()))) {
          await o.click();
          break;
        }
      }
    } catch {
      /* stale/hidden select — skip */
    }
  }
}

// Click the first visible control whose label looks like "Search / Show classes".
// Returns the label we clicked, or null if none matched.
async function clickReveal(driver) {
  const buttons = await driver
    .findElements(By.css('button, input[type=submit], input[type=button], a[role=button]'))
    .catch(() => []);
  for (const el of buttons.slice(0, 60)) {
    try {
      const tag = await el.getTagName();
      const label = tag === 'input' ? await el.getAttribute('value') : await el.getText();
      if (!REVEAL_WORDS.test(label || '')) continue;
      if (!(await el.isDisplayed()) || !(await el.isEnabled())) continue;
      await el.click();
      return (label || '').replace(/\s+/g, ' ').trim();
    } catch {
      /* stale/intercepted — try the next */
    }
  }
  return null;
}

// Click a "Next / Show more" control to load another page of results.
async function clickNext(driver) {
  const els = await driver.findElements(By.css('a, button')).catch(() => []);
  for (const el of els.slice(0, 120)) {
    try {
      const txt = (await el.getText())?.replace(/\s+/g, ' ').trim() || '';
      const aria = (await el.getAttribute('aria-label')) || '';
      if (!NEXT_WORDS.test(txt) && !/next( page)?/i.test(aria)) continue;
      if (!(await el.isDisplayed()) || !(await el.isEnabled())) continue;
      await el.click();
      return true;
    } catch {
      /* stale — try the next */
    }
  }
  return false;
}

// A crashed Chrome session must not poison later calls — recognise it so the
// caller can rebuild the driver.
function isDeadSession(err) {
  return /invalid session id|no such session|session deleted|chrome not reachable|disconnected/i.test(
    err?.message || ''
  );
}

// Some schedules inject the real search app into an <iframe> after load. When the
// top document is empty, descend one level of frames and harvest each.
async function harvestFrames(driver, harvest, settleMs) {
  const frames = await driver.findElements(By.css('iframe')).catch(() => []);
  for (let i = 0; i < Math.min(frames.length, 6); i++) {
    try {
      await driver.switchTo().defaultContent();
      const fresh = await driver.findElements(By.css('iframe'));
      if (!fresh[i]) continue;
      await driver.switchTo().frame(fresh[i]);
      await driver.sleep(800);
      await harvest(`iframe[${i}]`);
      await selectInclusiveOptions(driver).catch(() => {});
      const clicked = await clickReveal(driver).catch(() => null);
      if (clicked) {
        await driver.sleep(settleMs);
        await harvest(`iframe[${i}] click "${clicked}"`);
      }
    } catch {
      /* frame gone / cross-origin — skip */
    }
  }
  await driver.switchTo().defaultContent().catch(() => {});
}

// --- Public: render a page and pull every course we can, driving interaction --
//
// Returns { courses, modalityCoverage, finalUrl, blocked, error, actions }.
//   blocked === 'login'  -> a sign-in wall stopped us (the only allowed blocker)
//   error                -> the page/driver failed (e.g. timeout, crashed session)
//   actions              -> human-readable trace of what we did (for the recipe)
// Never throws: on a dead session it resets the driver so the next call is clean.
//
// All calls are serialized through one promise chain because there is a single
// shared Chrome session — two renders at once (e.g. a concurrent `scrape` run)
// would clobber each other's navigation. The queue keeps each render isolated.
let chain = Promise.resolve();
export function renderForCourses(url, opts = {}) {
  const run = chain.then(() => safeRender(url, opts));
  chain = run.catch(() => {}); // a failed render shouldn't break the queue
  return run;
}

async function safeRender(url, opts) {
  try {
    return await drive(url, opts);
  } catch (err) {
    if (isDeadSession(err)) await closeDriver();
    return { courses: [], modalityCoverage: 0, finalUrl: url, blocked: null, error: err.message, actions: [`error: ${err.message}`] };
  }
}

async function drive(url, { settleMs = 2200, timeoutMs = 22000, maxPages = 6, interact = true, waitFor = null } = {}) {
  const driver = await getDriver();
  await driver.manage().setTimeouts({ pageLoad: timeoutMs, script: timeoutMs });
  try {
    await driver.get(url);
  } catch {
    /* eager load may still time out on chatty SPAs — use whatever rendered */
  }
  if (waitFor) {
    await driver.wait(until.elementLocated(By.css(waitFor)), Math.min(timeoutMs, 15000)).catch(() => {});
  }
  await driver.sleep(settleMs);

  const merged = new Map(); // key -> course
  const actions = [];
  let blocked = null;

  const harvest = async (label) => {
    let html;
    let cur = url;
    try {
      html = await driver.getPageSource();
      cur = await driver.getCurrentUrl();
    } catch {
      return;
    }
    if (detectLogin(html, cur)) {
      blocked = 'login';
      actions.push(`${label}: blocked by sign-in (${cur})`);
      return;
    }
    const { courses } = extractCourses(html, { pageUrl: cur });
    let added = 0;
    for (const c of courses) {
      const key = `${lc(c.code)}|${lc(c.title)}|${lc(c.section || '')}`;
      if (!merged.has(key)) {
        merged.set(key, c);
        added++;
      }
    }
    actions.push(`${label}: +${added} (total ${merged.size})`);
  };

  // Harvest repeatedly until the course count stops growing (async results can
  // trickle in for several seconds after a load or a click). Stops early once the
  // count is non-zero and stable, so already-rendered pages return fast.
  const pollUntilStable = async (label, tries) => {
    let last = -1;
    for (let i = 0; i < tries && !blocked; i++) {
      await harvest(i === 0 ? label : `${label} +${i}`);
      if (merged.size > 0 && merged.size === last) break;
      last = merged.size;
      if (i < tries - 1) await driver.sleep(settleMs);
    }
  };

  await pollUntilStable('load', 3);

  // If the page is still empty, the class list is probably gated behind a search
  // form — set dropdowns to "All" and click the Search/Show button, then wait for
  // the results to render.
  if (interact && !blocked && merged.size < 25) {
    await selectInclusiveOptions(driver).catch(() => {});
    const clicked = await clickReveal(driver).catch(() => null);
    if (clicked) await pollUntilStable(`click "${clicked}"`, 6);
  }

  // Still nothing? The class app may live in an iframe — descend and try there.
  if (interact && !blocked && merged.size === 0) {
    await harvestFrames(driver, harvest, settleMs);
  }

  // Walk pagination (top document) while it keeps adding new courses.
  let page = 1;
  while (interact && !blocked && merged.size > 0 && page < maxPages) {
    const advanced = await clickNext(driver).catch(() => false);
    if (!advanced) break;
    await driver.sleep(settleMs);
    const before = merged.size;
    await harvest(`page ${++page}`);
    if (merged.size === before) break; // nothing new — stop paginating
  }

  const courses = [...merged.values()];
  const known = courses.filter((c) => c.modalityKnown).length;
  let finalUrl = url;
  try {
    finalUrl = await driver.getCurrentUrl();
  } catch {
    /* keep url */
  }
  return {
    courses,
    modalityCoverage: courses.length ? known / courses.length : 0,
    finalUrl,
    blocked,
    error: null,
    actions,
  };
}

// Kept for compatibility: render a URL and return its fully-loaded HTML.
export async function renderHtml(url, { waitFor = null, settleMs = 2500, timeoutMs = 30000 } = {}) {
  const driver = await getDriver();
  await driver.manage().setTimeouts({ pageLoad: timeoutMs, script: timeoutMs });
  try {
    await driver.get(url);
  } catch {
    /* tolerate eager-load timeout */
  }
  if (waitFor) {
    await driver.wait(until.elementLocated(By.css(waitFor)), Math.min(timeoutMs, 15000)).catch(() => {});
  }
  if (settleMs) await driver.sleep(settleMs);
  return driver.getPageSource();
}

// Headless-browser rendering via Selenium + Chrome.
//
// Many college class schedules are JavaScript apps: the course list is injected
// into the DOM after the page loads, so plain fetch() sees an empty shell. This
// renders the page in real Chrome, waits for content, and returns the final HTML
// so the same generic extractor can read it.
//
// Chrome must be installed; Selenium Manager auto-downloads the matching driver.
import { Builder, until, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

let driverPromise = null;

function buildDriver() {
  const options = new chrome.Options();
  options.addArguments(
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1400,2000',
    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0 Safari/537.36'
  );
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

// Render a URL and return its fully-loaded HTML.
//  - waitFor: optional CSS selector to wait for before grabbing HTML
//  - settleMs: extra pause after load for late XHR/render
export async function renderHtml(url, { waitFor = null, settleMs = 2500, timeoutMs = 30000 } = {}) {
  const driver = await getDriver();
  await driver.manage().setTimeouts({ pageLoad: timeoutMs, script: timeoutMs });
  await driver.get(url);
  if (waitFor) {
    try {
      await driver.wait(until.elementLocated(By.css(waitFor)), Math.min(timeoutMs, 15000));
    } catch {
      /* selector never appeared — return whatever rendered */
    }
  }
  if (settleMs) await driver.sleep(settleMs);
  return driver.getPageSource();
}

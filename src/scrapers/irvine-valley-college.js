// Scraper for Irvine Valley College
// Site: https://www.ivc.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.ivc.edu/class-schedule
//   - "Find Classes »" -> https://classes.socccd.edu/smartscheduleweb/index/1/I/202670/MarketingCode
//   - "Class Schedule" -> https://www.ivc.edu/node/1886
//   - "Financial Aid Disbursements Schedule" -> https://www.ivc.edu/financial-aid/disbursement-information
//   - "Summer Session: May 26 - Aug. 8" -> https://classes.socccd.edu/smartscheduleweb/index/1/I/202650/MarketingCode
//   - "The 2026-27 Irvine Valley men's basketball schedule is released" -> https://ivclasers.com/sports/mbkb/2025-26/releases/20260601nbdyr1
//   - "Catalog" -> https://www.ivc.edu/catalog
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "irvine-valley-college",
  name: "Irvine Valley College",
  url: "https://www.ivc.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.ivc.edu/class-schedule","score":5},{"text":"Find Classes »","href":"https://classes.socccd.edu/smartscheduleweb/index/1/I/202670/MarketingCode","score":5},{"text":"Class Schedule","href":"https://www.ivc.edu/node/1886","score":5},{"text":"Financial Aid Disbursements Schedule","href":"https://www.ivc.edu/financial-aid/disbursement-information","score":2},{"text":"Summer Session: May 26 - Aug. 8","href":"https://classes.socccd.edu/smartscheduleweb/index/1/I/202650/MarketingCode","score":2},{"text":"The 2026-27 Irvine Valley men's basketball schedule is released","href":"https://ivclasers.com/sports/mbkb/2025-26/releases/20260601nbdyr1","score":2},{"text":"Catalog","href":"https://www.ivc.edu/catalog","score":3}],
};

// Fetch this college's course list and return an array of course objects:
//   { code, title, modality, term, units, instructor, section, description, url }
// modality must be one of: 'in_person' | 'online' | 'hybrid'
export async function scrape() {
  if (!meta.extractUrl) {
    throw new Error(
      `No server-rendered course list known for ${meta.name}. ` +
      `Its schedule/catalog is likely a JavaScript app or login-gated search. ` +
      `Set meta.extractUrl to a scrapable page (see candidate links in this file), ` +
      `or implement a custom fetch + parse below (e.g. a headless browser or an API call).`
    );
  }
  const res = await fetchText(meta.extractUrl, { timeoutMs: 20000 });
  if (!res.ok) throw new Error(`${meta.extractUrl} returned HTTP ${res.status}`);
  return parse(res.body, res.url);
}

// Default parse = generic extractor. Override per college for better results.
export function parse(html, pageUrl) {
  const { courses } = extractCourses(html, { pageUrl });
  return courses;
}

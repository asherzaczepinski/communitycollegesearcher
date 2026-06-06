// Scraper for Orange Coast College
// Site: https://www.orangecoastcollege.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://ssb-prod.ec.cccd.edu/PROD/pw_pub_sched.p_search?Term=202650&college=OC
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://orangecoastcollege.edu/academics/class-schedule/index.html
//   - "Catalog" -> https://catalog.cccd.edu/orange-coast/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "orange-coast-college",
  name: "Orange Coast College",
  url: "https://www.orangecoastcollege.edu/",
  extractUrl: "https://ssb-prod.ec.cccd.edu/PROD/pw_pub_sched.p_search?Term=202650&college=OC",
  platform: "acalog",
  status: "working",
  candidates: [{"text":"Class Schedule","href":"https://orangecoastcollege.edu/academics/class-schedule/index.html","score":5},{"text":"Catalog","href":"https://catalog.cccd.edu/orange-coast/","score":3}],
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

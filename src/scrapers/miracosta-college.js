// Scraper for MiraCosta College
// Site: https://www.miracosta.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: peoplesoft
//
// Candidate links found while learning this site:
//   - "Class Schedules" -> https://www.miracosta.edu/academics/class-schedules-catalog/index.html
//   - "Summer and Fall Schedule" -> https://surf.miracosta.edu/psc/ps/EMPLOYEE/SA/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL
//   - "Class Schedules" -> https://www.miracosta.edu/academics/class-schedules-catalog/index.html
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "miracosta-college",
  name: "MiraCosta College",
  url: "https://www.miracosta.edu/",
  extractUrl: null,
  platform: "peoplesoft",
  status: "scaffold",
  candidates: [{"text":"Class Schedules","href":"https://www.miracosta.edu/academics/class-schedules-catalog/index.html","score":5},{"text":"Summer and Fall Schedule","href":"https://surf.miracosta.edu/psc/ps/EMPLOYEE/SA/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL","score":2},{"text":"Class Schedules","href":"https://www.miracosta.edu/academics/class-schedules-catalog/index.html","score":3}],
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

// Scraper for San Jose City College
// Site: https://www.sjcc.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.sjcc.edu/admissions-records/schedule.aspx
//   - "College Catalog" -> https://www.sjcc.edu/academic-affairs/college-catalog.aspx
//   - "ITSS Help Desk" -> https://services.sjeccd.edu/TDClient/1862/Portal/Requests/ServiceCatalog?CategoryID=18176
//   - "Informed Consent" -> https://catalog.sjcc.edu/college-district-policies/informed-consent/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "san-jose-city-college",
  name: "San Jose City College",
  url: "https://www.sjcc.edu/",
  extractUrl: null,
  platform: "acalog",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.sjcc.edu/admissions-records/schedule.aspx","score":5},{"text":"College Catalog","href":"https://www.sjcc.edu/academic-affairs/college-catalog.aspx","score":6},{"text":"ITSS Help Desk","href":"https://services.sjeccd.edu/TDClient/1862/Portal/Requests/ServiceCatalog?CategoryID=18176","score":3},{"text":"Informed Consent","href":"https://catalog.sjcc.edu/college-district-policies/informed-consent/","score":3}],
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

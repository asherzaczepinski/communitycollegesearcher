// Scraper for San Diego College of Continuing Education
// Site: https://sdcce.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.sdccd.edu/students/class-search/cesearch.html
//   - "College Catalogs" -> https://www.sdccd.edu/students/college-catalogs/index.aspx
//   - "Catalog 2025-2026" -> https://sdcce.edu/sites/default/files/ce-catalog-2025-2026.pdf
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "san-diego-college-of-continuing-education",
  name: "San Diego College of Continuing Education",
  url: "https://sdcce.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.sdccd.edu/students/class-search/cesearch.html","score":5},{"text":"College Catalogs","href":"https://www.sdccd.edu/students/college-catalogs/index.aspx","score":6},{"text":"Catalog 2025-2026","href":"https://sdcce.edu/sites/default/files/ce-catalog-2025-2026.pdf","score":3}],
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

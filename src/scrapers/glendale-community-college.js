// Scraper for Glendale Community College
// Site: https://www.glendale.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "CLASS SCHEDULE" -> javascript:void(0)
//   - "Winter 2026 Printed Class Schedule" -> https://www.glendale.edu/class-schedule/printed-class-schedule
//   - "Class Schedule" -> https://www.glendale.edu/class-schedule/class-schedule
//   - "Canvas" -> https://www.glendale.edu/class-schedule/distance-education/canvas
//   - "Catalogs" -> https://www.glendale.edu/class-schedule/catalogs
//   - "Common Course Numbering" -> https://www.glendale.edu/class-schedule/ccn
//   - "2025-2026 Catalog" -> https://www.glendale.edu/academics/catalogs
//   - "Catalogs" -> https://www.glendale.edu/class-schedule/catalogs
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "glendale-community-college",
  name: "Glendale Community College",
  url: "https://www.glendale.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"CLASS SCHEDULE","href":"javascript:void(0)","score":5},{"text":"Winter 2026 Printed Class Schedule","href":"https://www.glendale.edu/class-schedule/printed-class-schedule","score":5},{"text":"Class Schedule","href":"https://www.glendale.edu/class-schedule/class-schedule","score":5},{"text":"Canvas","href":"https://www.glendale.edu/class-schedule/distance-education/canvas","score":2},{"text":"Catalogs","href":"https://www.glendale.edu/class-schedule/catalogs","score":2},{"text":"Common Course Numbering","href":"https://www.glendale.edu/class-schedule/ccn","score":2},{"text":"2025-2026 Catalog","href":"https://www.glendale.edu/academics/catalogs","score":3},{"text":"Catalogs","href":"https://www.glendale.edu/class-schedule/catalogs","score":3}],
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

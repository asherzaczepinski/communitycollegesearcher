// Scraper for Los Angeles Pierce College
// Site: https://www.piercecollege.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://www.lapc.edu/academics/calendar-schedules
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Search" -> https://www.laccd.edu/students/class-search-lapc
//   - "Class Schedules" -> https://www.lapc.edu/academics/calendar-schedules
//   - "College Catalog" -> https://www.lapc.edu/academic-resources/schedule-catalog
//   - "Previous Semester Schedules" -> https://www.lapc.edu/academic-resources/schedule-previous-catalogs
//   - "College Catalog" -> https://www.lapc.edu/academic-resources/schedule-catalog
//   - "Previous Semester Schedules" -> https://www.lapc.edu/academic-resources/schedule-previous-catalogs
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "los-angeles-pierce-college",
  name: "Los Angeles Pierce College",
  url: "https://www.piercecollege.edu/",
  extractUrl: "https://www.lapc.edu/academics/calendar-schedules",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Search","href":"https://www.laccd.edu/students/class-search-lapc","score":5},{"text":"Class Schedules","href":"https://www.lapc.edu/academics/calendar-schedules","score":5},{"text":"College Catalog","href":"https://www.lapc.edu/academic-resources/schedule-catalog","score":2},{"text":"Previous Semester Schedules","href":"https://www.lapc.edu/academic-resources/schedule-previous-catalogs","score":2},{"text":"College Catalog","href":"https://www.lapc.edu/academic-resources/schedule-catalog","score":6},{"text":"Previous Semester Schedules","href":"https://www.lapc.edu/academic-resources/schedule-previous-catalogs","score":3}],
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

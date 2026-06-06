// Scraper for Los Angeles Valley College
// Site: https://www.lavc.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://www.lavc.edu/academics/catalogs
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Search" -> https://www.laccd.edu/students/class-search-lavc
//   - "Class Schedule" -> https://www.lavc.edu/academics/class-schedule
//   - "Two-Year Course Scheduling Planner" -> https://www.lavc.edu/academics/class-schedule#twoyrplanner
//   - "Course Catalogs" -> https://www.lavc.edu/academics/catalogs
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "los-angeles-valley-college",
  name: "Los Angeles Valley College",
  url: "https://www.lavc.edu/",
  extractUrl: "https://www.lavc.edu/academics/catalogs",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Search","href":"https://www.laccd.edu/students/class-search-lavc","score":5},{"text":"Class Schedule","href":"https://www.lavc.edu/academics/class-schedule","score":5},{"text":"Two-Year Course Scheduling Planner","href":"https://www.lavc.edu/academics/class-schedule#twoyrplanner","score":2},{"text":"Course Catalogs","href":"https://www.lavc.edu/academics/catalogs","score":6}],
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

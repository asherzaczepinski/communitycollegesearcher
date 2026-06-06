// Scraper for Columbia College
// Site: https://www.gocolumbia.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://gocolumbia.edu/academics/calendar_finals_schedule/index.html
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Search" -> https://myapps.yosemite.edu/ccClassSearch/
//   - "Academic Calendar" -> https://gocolumbia.edu/academics/calendar_finals_schedule/index.html
//   - "Catalog" -> https://gocolumbia.edu/academics/catalog_schedules/index.html
//   - "Catalog" -> https://gocolumbia.edu/academics/catalog_schedules/index.html
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "columbia-college",
  name: "Columbia College",
  url: "https://www.gocolumbia.edu/",
  extractUrl: "https://gocolumbia.edu/academics/calendar_finals_schedule/index.html",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Search","href":"https://myapps.yosemite.edu/ccClassSearch/","score":5},{"text":"Academic Calendar","href":"https://gocolumbia.edu/academics/calendar_finals_schedule/index.html","score":2},{"text":"Catalog","href":"https://gocolumbia.edu/academics/catalog_schedules/index.html","score":2},{"text":"Catalog","href":"https://gocolumbia.edu/academics/catalog_schedules/index.html","score":3}],
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

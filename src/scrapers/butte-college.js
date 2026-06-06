// Scraper for Butte College
// Site: https://www.butte.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Search for Classes (schedules)" -> https://www.butte.edu/schedule/
//   - "Search for Classes" -> https://selfservice.butte.edu/Student/Courses
//   - "Bus Schedule" -> https://www.butte.edu/bus
//   - "Catalog" -> https://www.butte.edu/curriculum/catalog/
//   - "Search for Classes" -> https://selfservice.butte.edu/Student/Courses
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "butte-college",
  name: "Butte College",
  url: "https://www.butte.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Search for Classes (schedules)","href":"https://www.butte.edu/schedule/","score":5},{"text":"Search for Classes","href":"https://selfservice.butte.edu/Student/Courses","score":5},{"text":"Bus Schedule","href":"https://www.butte.edu/bus","score":2},{"text":"Catalog","href":"https://www.butte.edu/curriculum/catalog/","score":3},{"text":"Search for Classes","href":"https://selfservice.butte.edu/Student/Courses","score":1}],
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

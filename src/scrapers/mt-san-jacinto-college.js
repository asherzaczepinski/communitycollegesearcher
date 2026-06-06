// Scraper for Mt. San Jacinto College
// Site: https://www.msjc.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Schedule of Classes" -> https://www.msjc.edu/scheduleofclasses/
//   - "Courses A-Z" -> https://catalog.msjc.edu/courses/#coursesaztext
//   - "General Education Patterns" -> https://www.msjc.edu/catalog/general-education-patterns.html
//   - "Academic Calendar" -> https://www.msjc.edu/catalog/academic-calendar.html
//   - "Catalog" -> https://www.msjc.edu/catalog/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "mt-san-jacinto-college",
  name: "Mt. San Jacinto College",
  url: "https://www.msjc.edu/",
  extractUrl: null,
  platform: "acalog",
  status: "scaffold",
  candidates: [{"text":"Schedule of Classes","href":"https://www.msjc.edu/scheduleofclasses/","score":5},{"text":"Courses A-Z","href":"https://catalog.msjc.edu/courses/#coursesaztext","score":4},{"text":"General Education Patterns","href":"https://www.msjc.edu/catalog/general-education-patterns.html","score":3},{"text":"Academic Calendar","href":"https://www.msjc.edu/catalog/academic-calendar.html","score":3},{"text":"Catalog","href":"https://www.msjc.edu/catalog/","score":3}],
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

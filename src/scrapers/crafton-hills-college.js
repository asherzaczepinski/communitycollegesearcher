// Scraper for Crafton Hills College
// Site: https://www.craftonhills.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.craftonhills.edu/admissions-and-records/enroll/class-schedule/index.php
//   - "Find Classes" -> https://www.craftonhills.edu/eschedule
//   - "College Catalog" -> https://www.craftonhills.edu/academic-and-career-programs/college-catalog/index.php
//   - "Catalog" -> https://www.craftonhills.edu/catalog
//   - "Register for Courses" -> https://www.craftonhills.edu/admissions-and-records/enroll/index.php
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "crafton-hills-college",
  name: "Crafton Hills College",
  url: "https://www.craftonhills.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.craftonhills.edu/admissions-and-records/enroll/class-schedule/index.php","score":5},{"text":"Find Classes","href":"https://www.craftonhills.edu/eschedule","score":5},{"text":"College Catalog","href":"https://www.craftonhills.edu/academic-and-career-programs/college-catalog/index.php","score":6},{"text":"Catalog","href":"https://www.craftonhills.edu/catalog","score":3},{"text":"Register for Courses","href":"https://www.craftonhills.edu/admissions-and-records/enroll/index.php","score":1}],
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

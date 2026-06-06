// Scraper for Foothill College
// Site: https://www.foothill.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://catalog.foothill.edu/course-outlines/
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://foothill.edu/schedule/index.html
//   - "College Catalog" -> https://foothill.edu/catalog/index.html
//   - "Degrees & Certificates" -> https://catalog.foothill.edu/degrees-certificates/
//   - "Choose a Major" -> https://catalog.foothill.edu/degrees-certificates/by-type/
//   - "See Program Details" -> https://catalog.foothill.edu/degrees-certificates/bs/
//   - "Explore Certificate Options" -> https://catalog.foothill.edu/degrees-certificates/credit-certificates/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "foothill-college",
  name: "Foothill College",
  url: "https://www.foothill.edu/",
  extractUrl: "https://catalog.foothill.edu/course-outlines/",
  platform: "acalog",
  status: "working",
  candidates: [{"text":"Class Schedule","href":"https://foothill.edu/schedule/index.html","score":5},{"text":"College Catalog","href":"https://foothill.edu/catalog/index.html","score":6},{"text":"Degrees & Certificates","href":"https://catalog.foothill.edu/degrees-certificates/","score":3},{"text":"Choose a Major","href":"https://catalog.foothill.edu/degrees-certificates/by-type/","score":3},{"text":"See Program Details","href":"https://catalog.foothill.edu/degrees-certificates/bs/","score":3},{"text":"Explore Certificate Options","href":"https://catalog.foothill.edu/degrees-certificates/credit-certificates/","score":3}],
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

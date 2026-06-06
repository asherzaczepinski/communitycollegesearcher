// Scraper for Palomar College
// Site: https://www.palomar.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.palomar.edu/schedule/
//   - "Find Classes and Enroll" -> https://www.palomar.edu/mypalomar/findclasses/
//   - "View Catalog" -> https://www.palomar.edu/catalog/
//   - "Explore courses." -> https://www.palomar.edu/wcce/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "palomar-college",
  name: "Palomar College",
  url: "https://www.palomar.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.palomar.edu/schedule/","score":5},{"text":"Find Classes and Enroll","href":"https://www.palomar.edu/mypalomar/findclasses/","score":3},{"text":"View Catalog","href":"https://www.palomar.edu/catalog/","score":3},{"text":"Explore courses.","href":"https://www.palomar.edu/wcce/","score":1}],
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

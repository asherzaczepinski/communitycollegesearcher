// Scraper for San Diego Mesa College
// Site: https://www.sdmesa.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.sdccd.edu/students/class-search/search.html
//   - "Find Classes" -> https://www.sdmesa.edu/student-support/register-for-classes/find-your-classes.shtml
//   - "Catalog" -> https://www.sdccd.edu/students/college-catalogs/index.aspx
//   - "Catalog" -> https://www.sdmesa.edu/catalog
//   - "Catalog" -> https://www.sdmesa.edu/academics/catalog/index.shtml/
//   - "Open Courses" -> https://www.sdmesa.edu/open-courses
//   - "All Courses" -> https://www.sdmesa.edu/academics/courses
//   - "All Courses" -> https://www.sdmesa.edu/academics/courses/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "san-diego-mesa-college",
  name: "San Diego Mesa College",
  url: "https://www.sdmesa.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.sdccd.edu/students/class-search/search.html","score":5},{"text":"Find Classes","href":"https://www.sdmesa.edu/student-support/register-for-classes/find-your-classes.shtml","score":3},{"text":"Catalog","href":"https://www.sdccd.edu/students/college-catalogs/index.aspx","score":3},{"text":"Catalog","href":"https://www.sdmesa.edu/catalog","score":3},{"text":"Catalog","href":"https://www.sdmesa.edu/academics/catalog/index.shtml/","score":3},{"text":"Open Courses","href":"https://www.sdmesa.edu/open-courses","score":1},{"text":"All Courses","href":"https://www.sdmesa.edu/academics/courses","score":1},{"text":"All Courses","href":"https://www.sdmesa.edu/academics/courses/","score":1}],
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

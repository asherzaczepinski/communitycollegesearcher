// Scraper for Imperial Valley College
// Site: https://www.imperial.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedules" -> https://www.imperial.edu/student-news/index.html
//   - "Check Out the Summer 2026 Class Schedule" -> https://www.imperial.edu/student-news/summer-2026-schedule.html
//   - "Learn How to Search For Classes" -> https://www.imperial.edu/student-news/course-search-guide.html
//   - "Catalog" -> https://www.imperial.edu/academics/catalogs-and-schedules-2.html
//   - "Catalog" -> https://www.imperial.edu/academics/catalogs-and-schedules-2.html
//   - "8-Week Courses" -> https://www.imperial.edu/student-news/8-week-courses.html
//   - "Virtual Bookstore" -> https://www.imperial.edu/courses-and-programs/divisions/arts-and-letters/library-2/virtual-bookstore.html
//   - "Academic Calendar" -> https://www.imperial.edu/courses-and-programs/academic-calendars.html/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "imperial-valley-college",
  name: "Imperial Valley College",
  url: "https://www.imperial.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedules","href":"https://www.imperial.edu/student-news/index.html","score":5},{"text":"Check Out the Summer 2026 Class Schedule","href":"https://www.imperial.edu/student-news/summer-2026-schedule.html","score":5},{"text":"Learn How to Search For Classes","href":"https://www.imperial.edu/student-news/course-search-guide.html","score":5},{"text":"Catalog","href":"https://www.imperial.edu/academics/catalogs-and-schedules-2.html","score":2},{"text":"Catalog","href":"https://www.imperial.edu/academics/catalogs-and-schedules-2.html","score":3},{"text":"8-Week Courses","href":"https://www.imperial.edu/student-news/8-week-courses.html","score":1},{"text":"Virtual Bookstore","href":"https://www.imperial.edu/courses-and-programs/divisions/arts-and-letters/library-2/virtual-bookstore.html","score":1},{"text":"Academic Calendar","href":"https://www.imperial.edu/courses-and-programs/academic-calendars.html/","score":1}],
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

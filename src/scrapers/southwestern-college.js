// Scraper for Southwestern College
// Site: https://www.swccd.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://www.swccd.edu/classes-and-registration/class-schedule/index.aspx
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.swccd.edu/classes-and-registration/class-schedule/index.aspx
//   - "SWC Catalog" -> https://www.swccd.edu/classes-and-registration/catalog/index.aspx
//   - "SWC Catalog" -> https://catalog.swccd.edu/
//   - "Student Parent Resources" -> https://swccd.instructure.com/courses/49117/pages/family-slash-student-parent
//   - "College Activity Courses" -> https://www.swccd.edu/locations/crown-cove-aquatic-center/college-activity-courses.aspx
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "southwestern-college",
  name: "Southwestern College",
  url: "https://www.swccd.edu/",
  extractUrl: "https://www.swccd.edu/classes-and-registration/class-schedule/index.aspx",
  platform: "acalog",
  status: "working",
  candidates: [{"text":"Class Schedule","href":"https://www.swccd.edu/classes-and-registration/class-schedule/index.aspx","score":5},{"text":"SWC Catalog","href":"https://www.swccd.edu/classes-and-registration/catalog/index.aspx","score":3},{"text":"SWC Catalog","href":"https://catalog.swccd.edu/","score":3},{"text":"Student Parent Resources","href":"https://swccd.instructure.com/courses/49117/pages/family-slash-student-parent","score":1},{"text":"College Activity Courses","href":"https://www.swccd.edu/locations/crown-cove-aquatic-center/college-activity-courses.aspx","score":1}],
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

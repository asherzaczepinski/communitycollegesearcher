// Scraper for Norco College
// Site: https://www.norcocollege.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://www.norcocollege.edu/catalogs/index.html
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Academic Calendar & Class Schedule" -> https://www.norcocollege.edu/schedules/index.html
//   - "Find a Class" -> https://www.norcocollege.edu/scheduleapp/index.html
//   - "Learn More about short-term accelerated classes!" -> https://www.norcocollege.edu/schedules/accelerated.html
//   - "College Catalog" -> https://www.norcocollege.edu/catalogs/index.html
//   - "Student Handbook" -> https://rccd.instructure.com/courses/31763
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "norco-college",
  name: "Norco College",
  url: "https://www.norcocollege.edu/",
  extractUrl: "https://www.norcocollege.edu/catalogs/index.html",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Academic Calendar & Class Schedule","href":"https://www.norcocollege.edu/schedules/index.html","score":5},{"text":"Find a Class","href":"https://www.norcocollege.edu/scheduleapp/index.html","score":2},{"text":"Learn More about short-term accelerated classes!","href":"https://www.norcocollege.edu/schedules/accelerated.html","score":2},{"text":"College Catalog","href":"https://www.norcocollege.edu/catalogs/index.html","score":6},{"text":"Student Handbook","href":"https://rccd.instructure.com/courses/31763","score":1}],
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

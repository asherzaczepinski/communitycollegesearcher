// Scraper for Berkeley City College
// Site: https://www.berkeleycitycollege.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://www.peralta.edu/admissions/academic-calendar-finals-schedule-enrollment-calendar
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedules and Course Catalogs" -> https://www.berkeleycitycollege.edu/academics/schedule-and-catalog
//   - "Click here for Important 2026 dates and deadlines! 🗓️" -> https://www.peralta.edu/admissions/academic-calendar-finals-schedule-enrollment-calendar
//   - "Class Schedules and Course Catalogs" -> https://www.berkeleycitycollege.edu/academics/schedule-and-catalog
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "berkeley-city-college",
  name: "Berkeley City College",
  url: "https://www.berkeleycitycollege.edu/",
  extractUrl: "https://www.peralta.edu/admissions/academic-calendar-finals-schedule-enrollment-calendar",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Schedules and Course Catalogs","href":"https://www.berkeleycitycollege.edu/academics/schedule-and-catalog","score":5},{"text":"Click here for Important 2026 dates and deadlines! 🗓️","href":"https://www.peralta.edu/admissions/academic-calendar-finals-schedule-enrollment-calendar","score":2},{"text":"Class Schedules and Course Catalogs","href":"https://www.berkeleycitycollege.edu/academics/schedule-and-catalog","score":6}],
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

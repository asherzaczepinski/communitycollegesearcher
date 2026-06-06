// Scraper for Yuba College
// Site: https://yc.yccd.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://yc.yccd.edu/academics/class-schedule/
//   - "Schedule A Visit" -> https://yc.yccd.edu/admissions/
//   - "Finals Schedule" -> https://yc.yccd.edu/academics/finals-schedule/
//   - "Course ScheduleSchedules for Summer/Fall 2026 are now searchable!" -> https://yc.yccd.edu/admissions/courses/
//   - "Catalog" -> https://yc.yccd.edu/academics/catalog/
//   - "IT HelpDesk" -> https://yccd.teamdynamix.com/TDClient/1911/Portal/Requests/ServiceCatalog?CategoryID=13956
//   - "Course Search" -> https://yc.yccd.edu/admissions/courses/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "yuba-college",
  name: "Yuba College",
  url: "https://yc.yccd.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://yc.yccd.edu/academics/class-schedule/","score":5},{"text":"Schedule A Visit","href":"https://yc.yccd.edu/admissions/","score":2},{"text":"Finals Schedule","href":"https://yc.yccd.edu/academics/finals-schedule/","score":2},{"text":"Course ScheduleSchedules for Summer/Fall 2026 are now searchable!","href":"https://yc.yccd.edu/admissions/courses/","score":2},{"text":"Catalog","href":"https://yc.yccd.edu/academics/catalog/","score":3},{"text":"IT HelpDesk","href":"https://yccd.teamdynamix.com/TDClient/1911/Portal/Requests/ServiceCatalog?CategoryID=13956","score":3},{"text":"Course Search","href":"https://yc.yccd.edu/admissions/courses/","score":1}],
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

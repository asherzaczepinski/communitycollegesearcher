// Scraper for Los Angeles Mission College
// Site: https://www.lamission.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Search" -> https://www.laccd.edu/students/class-search-lamc
//   - "Schedules & Catalogs" -> https://www.lamission.edu/academics/calendar-schedules/schedules-catalog
//   - "Academic Calendar" -> https://www.lamission.edu/academics/calendar-schedules/calendar
//   - "Schedules & Catalogs" -> https://www.lamission.edu/academics/calendar-schedules/schedules-catalog
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "los-angeles-mission-college",
  name: "Los Angeles Mission College",
  url: "https://www.lamission.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Search","href":"https://www.laccd.edu/students/class-search-lamc","score":5},{"text":"Schedules & Catalogs","href":"https://www.lamission.edu/academics/calendar-schedules/schedules-catalog","score":2},{"text":"Academic Calendar","href":"https://www.lamission.edu/academics/calendar-schedules/calendar","score":2},{"text":"Schedules & Catalogs","href":"https://www.lamission.edu/academics/calendar-schedules/schedules-catalog","score":3}],
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

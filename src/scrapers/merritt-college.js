// Scraper for Merritt College
// Site: https://www.merritt.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://merritt.edu/online-schedule?campus=Merritt&session_code=4W1%2C10W%2C8W1%2C8W2%2CDOE%2CIN1%2C14W%2CDYN
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedules and Course Catalogs" -> https://merritt.edu/class-schedule
//   - "Take a look HERE" -> https://merritt.edu/online-schedule?campus=Merritt&session_code=4W1%2C10W%2C8W1%2C8W2%2CDOE%2CIN1%2C14W%2CDYN
//   - "Class Schedules and Course Catalogs" -> https://merritt.edu/class-schedule
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "merritt-college",
  name: "Merritt College",
  url: "https://www.merritt.edu/",
  extractUrl: "https://merritt.edu/online-schedule?campus=Merritt&session_code=4W1%2C10W%2C8W1%2C8W2%2CDOE%2CIN1%2C14W%2CDYN",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Schedules and Course Catalogs","href":"https://merritt.edu/class-schedule","score":5},{"text":"Take a look HERE","href":"https://merritt.edu/online-schedule?campus=Merritt&session_code=4W1%2C10W%2C8W1%2C8W2%2CDOE%2CIN1%2C14W%2CDYN","score":2},{"text":"Class Schedules and Course Catalogs","href":"https://merritt.edu/class-schedule","score":6}],
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

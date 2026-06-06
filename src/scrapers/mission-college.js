// Scraper for Mission College
// Site: https://www.missioncollege.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://missioncollege.edu/class-schedule/index.html
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://missioncollege.edu/class-schedule/index.html
//   - "College Catalog Take a class, explore transfer degrees or find an apprenticeship − everything we have to offer in one place." -> https://mission.elumenapp.com/catalog/24-25/
//   - "Catalog" -> https://mission.elumenapp.com/catalog/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "mission-college",
  name: "Mission College",
  url: "https://www.missioncollege.edu/",
  extractUrl: "https://missioncollege.edu/class-schedule/index.html",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Schedule","href":"https://missioncollege.edu/class-schedule/index.html","score":5},{"text":"College Catalog Take a class, explore transfer degrees or find an apprenticeship − everything we have to offer in one place.","href":"https://mission.elumenapp.com/catalog/24-25/","score":6},{"text":"Catalog","href":"https://mission.elumenapp.com/catalog/","score":3}],
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

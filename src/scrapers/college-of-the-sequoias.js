// Scraper for College of the Sequoias
// Site: https://www.cos.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://catalog.cos.edu/course-descriptions/
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "​Athletics Schedule" -> http://cosgiants.com/landing/index
//   - "​Dates & Deadlines​" -> https://catalog.cos.edu/academic-calendar/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "college-of-the-sequoias",
  name: "College of the Sequoias",
  url: "https://www.cos.edu/",
  extractUrl: "https://catalog.cos.edu/course-descriptions/",
  platform: "acalog",
  status: "working",
  candidates: [{"text":"​Athletics Schedule","href":"http://cosgiants.com/landing/index","score":2},{"text":"​Dates & Deadlines​","href":"https://catalog.cos.edu/academic-calendar/","score":3}],
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

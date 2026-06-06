// Scraper for Santa Barbara City College
// Site: https://www.sbcc.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://catalog.sbcc.edu/course-descriptions/
// Platform guess: banner
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://banner.sbcc.edu/ords/ssb/pw_pub_sched.p_search?term=202530&level=NC
//   - "All Degrees and Certificates" -> https://catalog.sbcc.edu/programs/
//   - "Our Faculty" -> https://catalog.sbcc.edu/faculty-administrators/
//   - "Catalog" -> https://catalog.sbcc.edu/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "santa-barbara-city-college",
  name: "Santa Barbara City College",
  url: "https://www.sbcc.edu/",
  extractUrl: "https://catalog.sbcc.edu/course-descriptions/",
  platform: "banner",
  status: "working",
  candidates: [{"text":"Class Schedule","href":"https://banner.sbcc.edu/ords/ssb/pw_pub_sched.p_search?term=202530&level=NC","score":5},{"text":"All Degrees and Certificates","href":"https://catalog.sbcc.edu/programs/","score":3},{"text":"Our Faculty","href":"https://catalog.sbcc.edu/faculty-administrators/","score":3},{"text":"Catalog","href":"https://catalog.sbcc.edu/","score":3}],
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

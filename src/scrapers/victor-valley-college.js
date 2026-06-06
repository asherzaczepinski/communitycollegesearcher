// Scraper for Victor Valley College
// Site: https://www.vvc.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Schedule of courses" -> https://vvc-ss.colleague.elluciancloud.com/Student/Courses
//   - "College Catalogs" -> https://catalog.vvc.edu/
//   - "Schedule of courses" -> https://vvc-ss.colleague.elluciancloud.com/Student/Courses
//   - "Basic Skills" -> https://vvc.emsicc.com/programs/basic-skills-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area
//   - "Developmental Studies" -> https://vvc.emsicc.com/programs/developmental-studies-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area
//   - "English as a Second Language" -> https://vvc.emsicc.com/programs/english-as-a-second-language-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area
//   - "Library Science" -> https://vvc.emsicc.com/programs/library-science-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "victor-valley-college",
  name: "Victor Valley College",
  url: "https://www.vvc.edu/",
  extractUrl: null,
  platform: "acalog",
  status: "scaffold",
  candidates: [{"text":"Schedule of courses","href":"https://vvc-ss.colleague.elluciancloud.com/Student/Courses","score":2},{"text":"College Catalogs","href":"https://catalog.vvc.edu/","score":6},{"text":"Schedule of courses","href":"https://vvc-ss.colleague.elluciancloud.com/Student/Courses","score":1},{"text":"Basic Skills","href":"https://vvc.emsicc.com/programs/basic-skills-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area","score":1},{"text":"Developmental Studies","href":"https://vvc.emsicc.com/programs/developmental-studies-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area","score":1},{"text":"English as a Second Language","href":"https://vvc.emsicc.com/programs/english-as-a-second-language-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area","score":1},{"text":"Library Science","href":"https://vvc.emsicc.com/programs/library-science-non-credit-courses/125091?radius=100%20miles&region=Greater%20Victor%20Valley%20Area","score":1}],
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

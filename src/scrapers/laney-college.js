// Scraper for Laney College
// Site: https://www.laney.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://www.peralta.edu/admissions/academic-calendar-finals-schedule-enrollment-calendar?__hstc=141551021.16aaf3de54ce950a0dc1ffa65ee2a391.1768605781923.1776186154020.1776280533391.54&__hssc=141551021.2.1776280533391&__hsfp=c12d20b7b81bf9a16dbe3029d387a69f
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Search For Classes" -> https://laney.edu/class-scheduling
//   - "Class Schedule & Catalog" -> https://laney.edu/instruction/catalog/
//   - "Open Enrollment For Summer & Fall 2026 Has Begun. Search For Classes ➔" -> https://laney.edu/class-scheduling?campus=Laney&strm_descr=2026%2520Fall
//   - "Search Summer Classes" -> https://laney.edu/class-scheduling?campus=Laney&strm_descr=2026%2520Summer
//   - "Class Schedule & Catalog" -> https://laney.edu/instruction/catalog/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "laney-college",
  name: "Laney College",
  url: "https://www.laney.edu/",
  extractUrl: "https://www.peralta.edu/admissions/academic-calendar-finals-schedule-enrollment-calendar?__hstc=141551021.16aaf3de54ce950a0dc1ffa65ee2a391.1768605781923.1776186154020.1776280533391.54&__hssc=141551021.2.1776280533391&__hsfp=c12d20b7b81bf9a16dbe3029d387a69f",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Search For Classes","href":"https://laney.edu/class-scheduling","score":5},{"text":"Class Schedule & Catalog","href":"https://laney.edu/instruction/catalog/","score":5},{"text":"Open Enrollment For Summer & Fall 2026 Has Begun. Search For Classes ➔","href":"https://laney.edu/class-scheduling?campus=Laney&strm_descr=2026%2520Fall","score":5},{"text":"Search Summer Classes","href":"https://laney.edu/class-scheduling?campus=Laney&strm_descr=2026%2520Summer","score":2},{"text":"Class Schedule & Catalog","href":"https://laney.edu/instruction/catalog/","score":3}],
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

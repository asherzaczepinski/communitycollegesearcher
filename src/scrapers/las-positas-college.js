// Scraper for Las Positas College
// Site: https://www.laspositascollege.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://www.laspositascollege.edu/class-schedule/catalog.php
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.laspositascollege.edu/class-schedule/index.php
//   - "View Class Schedules" -> https://www.laspositascollege.edu/class-schedule/
//   - "Facility Rentals" -> https://www.laspositascollege.edu/facilities/feeschedule.php
//   - "Schedule a Tour" -> https://www.laspositascollege.edu/outreach/campustour.php
//   - "College Catalog" -> https://www.laspositascollege.edu/class-schedule/catalog.php
//   - "Final Exam Schedule" -> https://www.laspositascollege.edu/class-schedule/finals.php
//   - "College Catalog" -> https://www.laspositascollege.edu/class-schedule/catalog.php
//   - "Bookstore" -> http://www.bkstr.com/webapp/wcs/stores/servlet/StoreCatalogDisplay?catalogId=10001&langId=-1&demoKey=d&storeId=10499
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "las-positas-college",
  name: "Las Positas College",
  url: "https://www.laspositascollege.edu/",
  extractUrl: "https://www.laspositascollege.edu/class-schedule/catalog.php",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Schedule","href":"https://www.laspositascollege.edu/class-schedule/index.php","score":5},{"text":"View Class Schedules","href":"https://www.laspositascollege.edu/class-schedule/","score":5},{"text":"Facility Rentals","href":"https://www.laspositascollege.edu/facilities/feeschedule.php","score":2},{"text":"Schedule a Tour","href":"https://www.laspositascollege.edu/outreach/campustour.php","score":2},{"text":"College Catalog","href":"https://www.laspositascollege.edu/class-schedule/catalog.php","score":2},{"text":"Final Exam Schedule","href":"https://www.laspositascollege.edu/class-schedule/finals.php","score":2},{"text":"College Catalog","href":"https://www.laspositascollege.edu/class-schedule/catalog.php","score":6},{"text":"Bookstore","href":"http://www.bkstr.com/webapp/wcs/stores/servlet/StoreCatalogDisplay?catalogId=10001&langId=-1&demoKey=d&storeId=10499","score":3}],
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

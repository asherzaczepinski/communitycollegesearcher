// Scraper for San Bernardino Valley College
// Site: https://www.valleycollege.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.valleycollege.edu/academics/class-schedule/index.php
//   - "Financial Aid Disbursement Schedule" -> https://www.valleycollege.edu/financial-aid/disbursements.php
//   - "Find Your Classes for Summer & Fall 2026" -> https://www.valleycollege.edu/eschedule/index.php?term=2026SP&IsOpen=true
//   - "View Open Classes" -> https://www.valleycollege.edu/eschedule/index.php?IsOpen=true
//   - "College Catalog" -> https://www.valleycollege.edu/academics/college-catalog.php
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "san-bernardino-valley-college",
  name: "San Bernardino Valley College",
  url: "https://www.valleycollege.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.valleycollege.edu/academics/class-schedule/index.php","score":5},{"text":"Financial Aid Disbursement Schedule","href":"https://www.valleycollege.edu/financial-aid/disbursements.php","score":2},{"text":"Find Your Classes for Summer & Fall 2026","href":"https://www.valleycollege.edu/eschedule/index.php?term=2026SP&IsOpen=true","score":2},{"text":"View Open Classes","href":"https://www.valleycollege.edu/eschedule/index.php?IsOpen=true","score":2},{"text":"College Catalog","href":"https://www.valleycollege.edu/academics/college-catalog.php","score":6}],
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

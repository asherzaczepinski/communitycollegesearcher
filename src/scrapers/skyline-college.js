// Scraper for Skyline College
// Site: https://www.skylinecollege.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Find Classes" -> https://webschedule.smccd.edu/
//   - "Course Catalog & Schedule" -> https://skylinecollege.edu/catalogschedule/
//   - "Schedule a Tour" -> https://skylinecollege.edu/enrollmentworkshops
//   - "Building Hours" -> https://smccd.edu/facilities/skyline/buildingschedule.php
//   - "Course Catalog & Schedule" -> https://skylinecollege.edu/catalogschedule/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "skyline-college",
  name: "Skyline College",
  url: "https://www.skylinecollege.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Find Classes","href":"https://webschedule.smccd.edu/","score":5},{"text":"Course Catalog & Schedule","href":"https://skylinecollege.edu/catalogschedule/","score":2},{"text":"Schedule a Tour","href":"https://skylinecollege.edu/enrollmentworkshops","score":2},{"text":"Building Hours","href":"https://smccd.edu/facilities/skyline/buildingschedule.php","score":2},{"text":"Course Catalog & Schedule","href":"https://skylinecollege.edu/catalogschedule/","score":6}],
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

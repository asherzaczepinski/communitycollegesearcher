// Scraper for Pasadena City College
// Site: https://www.pasadena.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Schedule of Classes" -> https://findclasses.pasadena.edu/
//   - "Start Planning for Fall 2026! The Fall 2026 Schedule of Classes is now available. Log in to LancerPoint to see your registration appointment and start planning for the fall term!" -> https://pasadena.edu/current-students/guide-to-fall.php
//   - "Catalog" -> https://www.pasadena.edu/academics/catalog-schedule-calendar.php
//   - "Catalog" -> https://pasadena.edu/academics/catalog-schedule-calendar.php
//   - "Catalog" -> https://www.pasadena.edu/academics/catalog-schedule-calendar.php
//   - "Catalog" -> https://pasadena.edu/academics/catalog-schedule-calendar.php
//   - "Online Courses" -> https://www.pasadena.edu/academics/pcc-online/index.php
//   - "First Time College Student I will be taking college courses for the first time since high school." -> https://pasadena.edu/get-started/next-steps.php?type=first-time-student
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "pasadena-city-college",
  name: "Pasadena City College",
  url: "https://www.pasadena.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Schedule of Classes","href":"https://findclasses.pasadena.edu/","score":5},{"text":"Start Planning for Fall 2026! The Fall 2026 Schedule of Classes is now available. Log in to LancerPoint to see your registration appointment and start planning for the fall term!","href":"https://pasadena.edu/current-students/guide-to-fall.php","score":5},{"text":"Catalog","href":"https://www.pasadena.edu/academics/catalog-schedule-calendar.php","score":2},{"text":"Catalog","href":"https://pasadena.edu/academics/catalog-schedule-calendar.php","score":2},{"text":"Catalog","href":"https://www.pasadena.edu/academics/catalog-schedule-calendar.php","score":3},{"text":"Catalog","href":"https://pasadena.edu/academics/catalog-schedule-calendar.php","score":3},{"text":"Online Courses","href":"https://www.pasadena.edu/academics/pcc-online/index.php","score":1},{"text":"First Time College Student I will be taking college courses for the first time since high school.","href":"https://pasadena.edu/get-started/next-steps.php?type=first-time-student","score":1}],
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

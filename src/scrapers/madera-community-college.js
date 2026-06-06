// Scraper for Madera Community College
// Site: https://www.maderacollege.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedules" -> https://www.maderacollege.edu/admissions-aid/schedule-of-classes.html
//   - "Final Exam Schedule" -> https://www.maderacollege.edu/academics/final-exam-schedule.html
//   - "College Catalog" -> https://www.maderacollege.edu/admissions-aid/college-catalogs.html
//   - "English as a Second Language" -> https://www.maderacollege.edu/academics/courses/english-esl.html
//   - "Build Your Success This Summer Take Transferable Courses to Accelerate Your Academic Goals Enroll Now" -> https://www.maderacollege.edu/landing/summer-school.html
//   - "Common Course Numbering (CCN) Key course information is changing effective Fall 2026. View Effected Courses" -> https://www.maderacollege.edu/academics/common-course-numbering-updates.html
//   - "Nursing Program - LVN The Licensed Vocational Nursing Program is accredited by the Board of Vocational Nursing and Psychiatric Technicians (BVNPT). It requires three semesters of full-time study once the admission requirements are completed." -> https://www.maderacollege.edu/academics/courses/nursing-lvn.html
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "madera-community-college",
  name: "Madera Community College",
  url: "https://www.maderacollege.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedules","href":"https://www.maderacollege.edu/admissions-aid/schedule-of-classes.html","score":5},{"text":"Final Exam Schedule","href":"https://www.maderacollege.edu/academics/final-exam-schedule.html","score":2},{"text":"College Catalog","href":"https://www.maderacollege.edu/admissions-aid/college-catalogs.html","score":6},{"text":"English as a Second Language","href":"https://www.maderacollege.edu/academics/courses/english-esl.html","score":1},{"text":"Build Your Success This Summer Take Transferable Courses to Accelerate Your Academic Goals Enroll Now","href":"https://www.maderacollege.edu/landing/summer-school.html","score":1},{"text":"Common Course Numbering (CCN) Key course information is changing effective Fall 2026. View Effected Courses","href":"https://www.maderacollege.edu/academics/common-course-numbering-updates.html","score":1},{"text":"Nursing Program - LVN The Licensed Vocational Nursing Program is accredited by the Board of Vocational Nursing and Psychiatric Technicians (BVNPT). It requires three semesters of full-time study once the admission requirements are completed.","href":"https://www.maderacollege.edu/academics/courses/nursing-lvn.html","score":1}],
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

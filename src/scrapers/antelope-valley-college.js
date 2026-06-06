// Scraper for Antelope Valley College
// Site: https://www.avc.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.avc.edu/schedule
//   - "Class Schedule" -> https://www.avc.edu/distance-education/schedule
//   - "Two Year Schedule" -> https://www.avc.edu/2yearschedule
//   - "How to Schedule Your EOPS Counseling Appointment" -> https://www.avc.edu/students/student-services/eopscarenextupguardian-scholars/how-schedule-your-eops-counseling
//   - "Programs & Schedule" -> https://www.avc.edu/childdev/programs
//   - "Agendas, Minutes & Schedules" -> https://www.avc.edu/campus-organizations-committees/academic-achievement-committee/agendas-minutes-schedules
//   - "College Catalog" -> https://avc.elumenapp.com/catalog
//   - "Noncredit Programs and Courses" -> https://www.avc.edu/academics/el/noncredit-programs-and-courses
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "antelope-valley-college",
  name: "Antelope Valley College",
  url: "https://www.avc.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.avc.edu/schedule","score":5},{"text":"Class Schedule","href":"https://www.avc.edu/distance-education/schedule","score":5},{"text":"Two Year Schedule","href":"https://www.avc.edu/2yearschedule","score":2},{"text":"How to Schedule Your EOPS Counseling Appointment","href":"https://www.avc.edu/students/student-services/eopscarenextupguardian-scholars/how-schedule-your-eops-counseling","score":2},{"text":"Programs & Schedule","href":"https://www.avc.edu/childdev/programs","score":2},{"text":"Agendas, Minutes & Schedules","href":"https://www.avc.edu/campus-organizations-committees/academic-achievement-committee/agendas-minutes-schedules","score":2},{"text":"College Catalog","href":"https://avc.elumenapp.com/catalog","score":6},{"text":"Noncredit Programs and Courses","href":"https://www.avc.edu/academics/el/noncredit-programs-and-courses","score":1}],
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

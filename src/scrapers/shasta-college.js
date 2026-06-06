// Scraper for Shasta College
// Site: https://www.shastacollege.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: curricunet
//
// Candidate links found while learning this site:
//   - "Course Catalogs & Class Schedules" -> https://www.shastacollege.edu/academics/course-catalogs-and-class-schedules/
//   - "Disbursement Schedule / BankMobile Disbursements" -> https://www.shastacollege.edu/cost-financial-aid/disbursement-schedule/
//   - "Schedule Counseling Appointments" -> https://www.shastacollege.edu/counseling/counseling-appointments/
//   - "College Catalog 2025-2026 (PDF)" -> https://scmainweb.s3.us-west-1.amazonaws.com/files/resources/2025-26-college-catalog.pdf
//   - "Course Catalogs & Class Schedules" -> https://www.shastacollege.edu/academics/course-catalogs-and-class-schedules/
//   - "CurricUNET for Course Outlines" -> http://www.curricunet.com/shasta/search/course/
//   - "Spring Catalog Addendum 2024-2025 (PDF)" -> https://scmainweb.s3.us-west-1.amazonaws.com/files/resources/2024-25-spring-catalog-addendum.pdf
//   - "Search Courses & Sections" -> https://mysc.shastacollege.edu/Student/Courses
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "shasta-college",
  name: "Shasta College",
  url: "https://www.shastacollege.edu/",
  extractUrl: null,
  platform: "curricunet",
  status: "scaffold",
  candidates: [{"text":"Course Catalogs & Class Schedules","href":"https://www.shastacollege.edu/academics/course-catalogs-and-class-schedules/","score":5},{"text":"Disbursement Schedule / BankMobile Disbursements","href":"https://www.shastacollege.edu/cost-financial-aid/disbursement-schedule/","score":2},{"text":"Schedule Counseling Appointments","href":"https://www.shastacollege.edu/counseling/counseling-appointments/","score":2},{"text":"College Catalog 2025-2026 (PDF)","href":"https://scmainweb.s3.us-west-1.amazonaws.com/files/resources/2025-26-college-catalog.pdf","score":6},{"text":"Course Catalogs & Class Schedules","href":"https://www.shastacollege.edu/academics/course-catalogs-and-class-schedules/","score":6},{"text":"CurricUNET for Course Outlines","href":"http://www.curricunet.com/shasta/search/course/","score":5},{"text":"Spring Catalog Addendum 2024-2025 (PDF)","href":"https://scmainweb.s3.us-west-1.amazonaws.com/files/resources/2024-25-spring-catalog-addendum.pdf","score":3},{"text":"Search Courses & Sections","href":"https://mysc.shastacollege.edu/Student/Courses","score":1}],
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

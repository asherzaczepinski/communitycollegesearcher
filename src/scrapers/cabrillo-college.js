// Scraper for Cabrillo College
// Site: https://www.cabrillo.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedules" -> https://www.cabrillo.edu/class-schedules/
//   - "Check out the Summer 2026 Schedule of Classes" -> https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/Search?searchResultsView=SectionListing&terms=2026SP
//   - "Register for Classes" -> https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/Search
//   - "Ad Astra Schedule" -> https://www.aaiscloud.com/CabrilloC/Default.aspx
//   - "Summer 2026 Classes" -> https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/search?terms=2026SU
//   - "College Catalog" -> https://www.cabrillo.edu/college-catalog/
//   - "Classes" -> https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses
//   - "Register for Classes" -> https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/Search
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "cabrillo-college",
  name: "Cabrillo College",
  url: "https://www.cabrillo.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Class Schedules","href":"https://www.cabrillo.edu/class-schedules/","score":5},{"text":"Check out the Summer 2026 Schedule of Classes","href":"https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/Search?searchResultsView=SectionListing&terms=2026SP","score":5},{"text":"Register for Classes","href":"https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/Search","score":2},{"text":"Ad Astra Schedule","href":"https://www.aaiscloud.com/CabrilloC/Default.aspx","score":2},{"text":"Summer 2026 Classes","href":"https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/search?terms=2026SU","score":2},{"text":"College Catalog","href":"https://www.cabrillo.edu/college-catalog/","score":6},{"text":"Classes","href":"https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses","score":1},{"text":"Register for Classes","href":"https://cabrillo-ss.colleague.elluciancloud.com/Student/Courses/Search","score":1}],
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

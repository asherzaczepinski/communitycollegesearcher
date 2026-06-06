// Scraper for Contra Costa College
// Site: https://www.contracosta.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://vsb.4cd.edu/criteria.jsp
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://webapps.4cd.edu/apps/courseschedulesearch/search-course.aspx
//   - "Schedule Builder (for Current Students)" -> https://vsb.4cd.edu/criteria.jsp
//   - "Remote, Weekend + Evening Classes" -> https://www.contracosta.edu/academics/flexible-schedule/
//   - "Academic Catalog" -> https://ccc.elumenapp.com/catalog/current/home
//   - "Class Schedule" -> https://webapps.4cd.edu/apps/courseschedulesearch/search-course.aspx
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "contra-costa-college",
  name: "Contra Costa College",
  url: "https://www.contracosta.edu/",
  extractUrl: "https://vsb.4cd.edu/criteria.jsp",
  platform: "unknown",
  status: "working",
  candidates: [{"text":"Class Schedule","href":"https://webapps.4cd.edu/apps/courseschedulesearch/search-course.aspx","score":5},{"text":"Schedule Builder (for Current Students)","href":"https://vsb.4cd.edu/criteria.jsp","score":2},{"text":"Remote, Weekend + Evening Classes","href":"https://www.contracosta.edu/academics/flexible-schedule/","score":2},{"text":"Academic Catalog","href":"https://ccc.elumenapp.com/catalog/current/home","score":3},{"text":"Class Schedule","href":"https://webapps.4cd.edu/apps/courseschedulesearch/search-course.aspx","score":1}],
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

// Scraper for Rio Hondo College
// Site: https://www.riohondo.edu/
// Status: WORKING — extracts real courses
// Course list discovered: https://ssb.riohondo.edu:8443/prodssb/pw_pub_sched.p_search
// Platform guess: banner
//
// Candidate links found while learning this site:
//   - "View Class Schedules" -> https://ssb.riohondo.edu:8443/prodssb/pw_pub_sched.p_search
//   - "College Catalog" -> https://www.riohondo.edu/academics/catalog/
//   - "View Open Classes" -> https://gorio.page/summer-open-courses
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "rio-hondo-college",
  name: "Rio Hondo College",
  url: "https://www.riohondo.edu/",
  extractUrl: "https://ssb.riohondo.edu:8443/prodssb/pw_pub_sched.p_search",
  platform: "banner",
  status: "working",
  candidates: [{"text":"View Class Schedules","href":"https://ssb.riohondo.edu:8443/prodssb/pw_pub_sched.p_search","score":5},{"text":"College Catalog","href":"https://www.riohondo.edu/academics/catalog/","score":6},{"text":"View Open Classes","href":"https://gorio.page/summer-open-courses","score":1}],
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

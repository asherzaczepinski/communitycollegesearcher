// Scraper for Mt. San Antonio College
// Site: https://www.mtsac.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Class Schedule" -> https://www.mtsac.edu/#scheduleClasses
//   - "Summer Schedule of Classes" -> https://www.mtsac.edu/schedule/summer.html
//   - "Fall Schedule of Classes" -> https://www.mtsac.edu/schedule/fall.html
//   - "Schedule of Classes" -> https://www.mtsac.edu/schedule/
//   - "Explore more than 400 programs in our Catalog" -> https://catalog.mtsac.edu/
//   - "Associate Degrees Earn associate degrees to prepare for a career or save money then transfer to a four-year university." -> https://catalog.mtsac.edu/programs/explore-your-future/
//   - "Academic Catalog" -> https://www.mtsac.edu/catalog/
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "mt-san-antonio-college",
  name: "Mt. San Antonio College",
  url: "https://www.mtsac.edu/",
  extractUrl: null,
  platform: "acalog",
  status: "scaffold",
  candidates: [{"text":"Class Schedule","href":"https://www.mtsac.edu/#scheduleClasses","score":5},{"text":"Summer Schedule of Classes","href":"https://www.mtsac.edu/schedule/summer.html","score":5},{"text":"Fall Schedule of Classes","href":"https://www.mtsac.edu/schedule/fall.html","score":5},{"text":"Schedule of Classes","href":"https://www.mtsac.edu/schedule/","score":5},{"text":"Explore more than 400 programs in our Catalog","href":"https://catalog.mtsac.edu/","score":3},{"text":"Associate Degrees Earn associate degrees to prepare for a career or save money then transfer to a four-year university.","href":"https://catalog.mtsac.edu/programs/explore-your-future/","score":3},{"text":"Academic Catalog","href":"https://www.mtsac.edu/catalog/","score":3}],
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

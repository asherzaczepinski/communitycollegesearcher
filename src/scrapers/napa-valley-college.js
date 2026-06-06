// Scraper for Napa Valley College
// Site: https://www.napavalley.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: acalog
//
// Candidate links found while learning this site:
//   - "Schedule of Classes" -> https://colss-prod.ec.napavalley.edu/Student/Student/Courses
//   - "Schedule of Classes" -> https://nam04.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcolss-prod.ec.napavalley.edu%2FStudent%2FCourses&data=05%7C02%7Cdenise.kaduri%40napavalley.edu%7C2fbd234bf61c4d9664da08dcf2d29974%7C09f3c00d68764d399c48e1bd5ff6c560%7C0%7C0%7C638652233524942645%7CUnknown%7CTWFpbGZsb3d8eyJWIjoiMC4wLjAwMDAiLCJQIjoiV2luMzIiLCJBTiI6Ik1haWwiLCJXVCI6Mn0%3D%7C0%7C%7C%7C&sdata=xbjzsil219%2B0XWof9rXnSKz%2BnXxyL6%2FmzUvFAbiitfY%3D&reserved=0
//   - "Browse Class Schedule" -> https://www.napavalley.edu/programs-and-academics/academic-affairs/class-schedules.html
//   - "Calendar & Exam Schedule" -> https://www.napavalley.edu/programs-and-academics/academic-affairs/academic-calendar.html
//   - "Catalog" -> https://catalog.napavalley.edu/
//   - "Catalog" -> https://www.napavalley.edu/programs-and-academics/catalog.html
//   - "Schedule of Classes" -> https://colss-prod.ec.napavalley.edu/Student/Student/Courses
//   - "Schedule of Classes" -> https://nam04.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcolss-prod.ec.napavalley.edu%2FStudent%2FCourses&data=05%7C02%7Cdenise.kaduri%40napavalley.edu%7C2fbd234bf61c4d9664da08dcf2d29974%7C09f3c00d68764d399c48e1bd5ff6c560%7C0%7C0%7C638652233524942645%7CUnknown%7CTWFpbGZsb3d8eyJWIjoiMC4wLjAwMDAiLCJQIjoiV2luMzIiLCJBTiI6Ik1haWwiLCJXVCI6Mn0%3D%7C0%7C%7C%7C&sdata=xbjzsil219%2B0XWof9rXnSKz%2BnXxyL6%2FmzUvFAbiitfY%3D&reserved=0
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "napa-valley-college",
  name: "Napa Valley College",
  url: "https://www.napavalley.edu/",
  extractUrl: null,
  platform: "acalog",
  status: "scaffold",
  candidates: [{"text":"Schedule of Classes","href":"https://colss-prod.ec.napavalley.edu/Student/Student/Courses","score":5},{"text":"Schedule of Classes","href":"https://nam04.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcolss-prod.ec.napavalley.edu%2FStudent%2FCourses&data=05%7C02%7Cdenise.kaduri%40napavalley.edu%7C2fbd234bf61c4d9664da08dcf2d29974%7C09f3c00d68764d399c48e1bd5ff6c560%7C0%7C0%7C638652233524942645%7CUnknown%7CTWFpbGZsb3d8eyJWIjoiMC4wLjAwMDAiLCJQIjoiV2luMzIiLCJBTiI6Ik1haWwiLCJXVCI6Mn0%3D%7C0%7C%7C%7C&sdata=xbjzsil219%2B0XWof9rXnSKz%2BnXxyL6%2FmzUvFAbiitfY%3D&reserved=0","score":5},{"text":"Browse Class Schedule","href":"https://www.napavalley.edu/programs-and-academics/academic-affairs/class-schedules.html","score":5},{"text":"Calendar & Exam Schedule","href":"https://www.napavalley.edu/programs-and-academics/academic-affairs/academic-calendar.html","score":2},{"text":"Catalog","href":"https://catalog.napavalley.edu/","score":3},{"text":"Catalog","href":"https://www.napavalley.edu/programs-and-academics/catalog.html","score":3},{"text":"Schedule of Classes","href":"https://colss-prod.ec.napavalley.edu/Student/Student/Courses","score":1},{"text":"Schedule of Classes","href":"https://nam04.safelinks.protection.outlook.com/?url=https%3A%2F%2Fcolss-prod.ec.napavalley.edu%2FStudent%2FCourses&data=05%7C02%7Cdenise.kaduri%40napavalley.edu%7C2fbd234bf61c4d9664da08dcf2d29974%7C09f3c00d68764d399c48e1bd5ff6c560%7C0%7C0%7C638652233524942645%7CUnknown%7CTWFpbGZsb3d8eyJWIjoiMC4wLjAwMDAiLCJQIjoiV2luMzIiLCJBTiI6Ik1haWwiLCJXVCI6Mn0%3D%7C0%7C%7C%7C&sdata=xbjzsil219%2B0XWof9rXnSKz%2BnXxyL6%2FmzUvFAbiitfY%3D&reserved=0","score":1}],
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

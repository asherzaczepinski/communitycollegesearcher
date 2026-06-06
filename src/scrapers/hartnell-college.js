// Scraper for Hartnell College
// Site: https://www.hartnell.edu/
// Status: SCAFFOLD — needs a working course-list URL
// Course list discovered: none yet
// Platform guess: unknown
//
// Candidate links found while learning this site:
//   - "Schedule of Classes See what classes are offered this semester." -> https://www.hartnell.edu/academics/schedule-classes.html
//   - "Save money with Zero Textbook Cost (ZTC) Courses Search for classes that are Zero Textbook Cost, or ZTC for short, which are course sections that do not require the purchase of a textbook.Zero Textbook Cost" -> https://www.hartnell.edu/academics/ztc/index.html
//   - "Schedule an Event" -> https://hartnell.events.prod.coursedog.com/
//   - "Learn about year-long schedules" -> https://www.hartnell.edu/news/enrollment-updates.html
//   - "Take Hartnell classes during your regular high school schedule.CCAP Dual Enrollment" -> https://www.hartnell.edu/academics/college-readiness/index.html
//   - "College Catalog" -> https://www.hartnell.edu/academics-affairs/catalogs.html
//   - "Our Distance education courses let you learn from anywhere in California.Find Online Classes" -> https://stuserv.hartnell.edu/Student/Courses/
//   - "Save money with Zero Textbook Cost (ZTC) Courses Search for classes that are Zero Textbook Cost, or ZTC for short, which are course sections that do not require the purchase of a textbook.Zero Textbook Cost" -> https://www.hartnell.edu/academics/ztc/index.html
//
// To customize: set meta.extractUrl to a page that SERVER-RENDERS courses, and/or
// replace parse() with selectors specific to this college (especially to capture
// modality — in_person / online / hybrid — from the live class schedule).
import { fetchText } from '../scraper/fetch.js';
import { extractCourses } from '../scraper/extract.js';
// import { normalizeModality } from '../scraper/modality.js'; // for custom parsing

export const meta = {
  slug: "hartnell-college",
  name: "Hartnell College",
  url: "https://www.hartnell.edu/",
  extractUrl: null,
  platform: "unknown",
  status: "scaffold",
  candidates: [{"text":"Schedule of Classes See what classes are offered this semester.","href":"https://www.hartnell.edu/academics/schedule-classes.html","score":5},{"text":"Save money with Zero Textbook Cost (ZTC) Courses Search for classes that are Zero Textbook Cost, or ZTC for short, which are course sections that do not require the purchase of a textbook.Zero Textbook Cost","href":"https://www.hartnell.edu/academics/ztc/index.html","score":5},{"text":"Schedule an Event","href":"https://hartnell.events.prod.coursedog.com/","score":2},{"text":"Learn about year-long schedules","href":"https://www.hartnell.edu/news/enrollment-updates.html","score":2},{"text":"Take Hartnell classes during your regular high school schedule.CCAP Dual Enrollment","href":"https://www.hartnell.edu/academics/college-readiness/index.html","score":2},{"text":"College Catalog","href":"https://www.hartnell.edu/academics-affairs/catalogs.html","score":6},{"text":"Our Distance education courses let you learn from anywhere in California.Find Online Classes","href":"https://stuserv.hartnell.edu/Student/Courses/","score":1},{"text":"Save money with Zero Textbook Cost (ZTC) Courses Search for classes that are Zero Textbook Cost, or ZTC for short, which are course sections that do not require the purchase of a textbook.Zero Textbook Cost","href":"https://www.hartnell.edu/academics/ztc/index.html","score":1}],
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

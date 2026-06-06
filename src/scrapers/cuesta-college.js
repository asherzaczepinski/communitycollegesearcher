// Scraper for Cuesta College
// Site: https://www.cuesta.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://ssb2.cuesta.edu/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "cuesta-college",
  name: "Cuesta College",
  url: "https://www.cuesta.edu/",
  platform: 'banner',
  bannerBase: "https://ssb2.cuesta.edu/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Class Schedule","href":"https://www.cuesta.edu/become-student/findclasses/schedule/index.html","score":5},{"text":"Class Finder","href":"https://ssb2.cuesta.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search","score":2},{"text":"Catalog","href":"https://www.cuesta.edu/become-student/findclasses/index.html","score":3}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

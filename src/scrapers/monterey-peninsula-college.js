// Scraper for Monterey Peninsula College
// Site: https://www.mpc.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://reg-prod.mpc.elluciancloud.com:8103/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "monterey-peninsula-college",
  name: "Monterey Peninsula College",
  url: "https://www.mpc.edu/",
  platform: 'banner',
  bannerBase: "https://reg-prod.mpc.elluciancloud.com:8103/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Browse Classes","href":"https://reg-prod.mpc.elluciancloud.com:8103/StudentRegistrationSsb/ssb/term/termSelection?mode=search","score":5},{"text":"Catalogs & Class Schedules","href":"https://www.mpc.edu/academics/catalogs-and-schedules.html","score":5},{"text":"Catalogs & Class Schedules","href":"https://www.mpc.edu/academics/catalogs-and-schedules.html","score":3},{"text":"New Early Childhood Education Courses!","href":"https://www.mpc.edu/news/new-eced-courses.html","score":1}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

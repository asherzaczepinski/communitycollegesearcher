// Scraper for College of the Siskiyous
// Site: https://www.siskiyous.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://reg-prod.cloud.siskiyous.edu/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "college-of-the-siskiyous",
  name: "College of the Siskiyous",
  url: "https://www.siskiyous.edu/",
  platform: 'banner',
  bannerBase: "https://reg-prod.cloud.siskiyous.edu/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Class Schedule","href":"https://reg-prod.cloud.siskiyous.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search","score":5},{"text":"Class Schedule","href":"https://www.siskiyous.edu/schedules/","score":5},{"text":"College Catalog","href":"https://www.siskiyous.edu/catalog/","score":6},{"text":"Degrees and Certificates","href":"https://siskiyous.elumenapp.com/catalog/cos26-27catalog/degreesandcertificatesa-z","score":3}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

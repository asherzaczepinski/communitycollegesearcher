// Scraper for Barstow Community College
// Site: https://www.barstow.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://ssbprod2.barstow.edu:8443/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "barstow-community-college",
  name: "Barstow Community College",
  url: "https://www.barstow.edu/",
  platform: 'banner',
  bannerBase: "https://ssbprod2.barstow.edu:8443/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"View the schedule of classes","href":"https://ssbprod2.barstow.edu:8443/StudentRegistrationSsb/ssb/registration/","score":5},{"text":"Schedule of Classes","href":"https://www.barstow.edu/academics/schedule-classes","score":5},{"text":"Catalog & Schedule","href":"https://www.barstow.edu/academics/catalog","score":2},{"text":"Course Catalog","href":"https://www.barstow.edu/academics/catalog","score":6}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

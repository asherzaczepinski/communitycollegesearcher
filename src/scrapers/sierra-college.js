// Scraper for Sierra College
// Site: https://www.sierracollege.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://ss.oci.sierracollege.edu/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "sierra-college",
  name: "Sierra College",
  url: "https://www.sierracollege.edu/",
  platform: 'banner',
  bannerBase: "https://ss.oci.sierracollege.edu/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Class Schedule","href":"https://ss.oci.sierracollege.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search","score":5},{"text":"College Catalog","href":"https://catalog.sierracollege.edu/","score":6},{"text":"Bookstore","href":"https://sierra.bncollege.com/?storeId=19556&catalogId=10001&langId=-1","score":3}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

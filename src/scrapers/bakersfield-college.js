// Scraper for Bakersfield College
// Site: https://www.bakersfieldcollege.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://reg-prod.ec.kccd.edu/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "bakersfield-college",
  name: "Bakersfield College",
  url: "https://www.bakersfieldcollege.edu/",
  platform: 'banner',
  bannerBase: "https://reg-prod.ec.kccd.edu/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Class Schedule","href":"https://reg-prod.ec.kccd.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search","score":5}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

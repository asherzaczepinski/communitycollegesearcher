// Scraper for Allan Hancock College
// Site: https://www.hancockcollege.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://ssb.hancockcollege.edu/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "allan-hancock-college",
  name: "Allan Hancock College",
  url: "https://www.hancockcollege.edu/",
  platform: 'banner',
  bannerBase: "https://ssb.hancockcollege.edu/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Class Search","href":"https://ssb.hancockcollege.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search","score":5},{"text":"MESA/STEM Academic Success Center","href":"https://www.hancockcollege.edu/mesa/aew-tutoring-schedules.php","score":2},{"text":"Catalog","href":"https://hancockcollege.curriqunet.com/catalog","score":3},{"text":"Transfer Degrees","href":"https://hancockcollege.curriqunet.com/catalog/iq/140/5135","score":3},{"text":"Catalog","href":"https://hancockcollege.curriqunet.com/catalog/iq/301","score":3},{"text":"Catalog","href":"https://hancockcollege.curriqunet.com/catalog/","score":3}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

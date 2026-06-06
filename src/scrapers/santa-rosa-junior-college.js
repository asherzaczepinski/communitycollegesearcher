// Scraper for Santa Rosa Junior College
// Site: https://www.santarosa.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://reg-prod.santarosajc.elluciancloud.com:8103/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "santa-rosa-junior-college",
  name: "Santa Rosa Junior College",
  url: "https://www.santarosa.edu/",
  platform: 'banner',
  bannerBase: "https://reg-prod.santarosajc.elluciancloud.com:8103/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Fall/Summer 2026 Schedule of Classes","href":"https://reg-prod.santarosajc.elluciancloud.com:8103/StudentRegistrationSsb/ssb/term/termSelection?mode=search","score":5},{"text":"Spring 2026 Schedule of Classes","href":"https://portal.santarosa.edu/SRWeb/MVC.Core2/ScheduleOfClasses2/home","score":5}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

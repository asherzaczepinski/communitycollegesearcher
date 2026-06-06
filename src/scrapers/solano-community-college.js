// Scraper for Solano Community College
// Site: https://www.solano.edu/
// Status: WORKING (Banner Self-Service JSON API) — real sections WITH modality
// Banner base: https://ssb.solano.edu/StudentRegistrationSsb
//
// Pulls the live class schedule for the newest term straight from Ellucian
// Banner's public search API (no browser needed). Each section's
// instructionalMethod + campus is mapped to in_person / online / hybrid.
import { bannerCourses } from '../scraper/adapters/banner.js';

export const meta = {
  slug: "solano-community-college",
  name: "Solano Community College",
  url: "https://www.solano.edu/",
  platform: 'banner',
  bannerBase: "https://ssb.solano.edu/StudentRegistrationSsb",
  status: 'working',
  candidates: [{"text":"Class Search","href":"https://ssb.solano.edu/StudentRegistrationSsb/ssb/registration/registration","score":5},{"text":"Class Search","href":"https://nam11.safelinks.protection.outlook.com/?url=https%3A%2F%2Fssb.solano.edu%2FStudentRegistrationSsb%2Fssb%2FclassSearch%2FclassSearch&data=05%7C02%7CZohaib.Javed%40solano.edu%7C8ea4c99630d748a9ffcb08dde7243625%7Cdc5d168e14e544b199aeb7984aa29306%7C0%7C0%7C638920864898715254%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=XxHsXR5lplq5uyD7kFN67F5en0nmHgfvVDvqFVErjcY%3D&reserved=0","score":5},{"text":"Catalog","href":"https://www.solano.edu/administrative-offices/academic-affairs/course-catalog.php","score":3},{"text":"Course/Program Outlines of Record (COR/POR)","href":"https://solano.elumenapp.com/public/","score":2}],
};

export async function scrape() {
  return bannerCourses(meta.bannerBase);
}

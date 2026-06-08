// Browser adapter: scrape real courses from a page that only renders its class
// list via JavaScript. Re-runs the same headless render the "Deep learn (browser)"
// step used to discover the page — loading it in Chrome, clicking through the
// search form, descending iframes, and paginating — then returns what it finds.
//
// A sign-in wall is the one blocker we surface as an error; everything else we
// drive through automatically.
import { renderForCourses } from '../browser.js';

export async function browserCourses(college, recipe) {
  if (!recipe?.extractUrl) throw new Error('no learned extractUrl — run "Deep learn (browser)" first');
  const r = await renderForCourses(recipe.extractUrl, recipe.browser || {});
  if (r.blocked === 'login') {
    throw new Error('blocked by sign-in wall — this schedule requires a login we cannot bypass');
  }
  if (!r.courses.length) {
    throw new Error(r.error ? `browser render failed: ${r.error}` : 'browser render found 0 courses');
  }
  return r.courses.map((c) => ({ ...c, term: recipe.term || c.term || null }));
}

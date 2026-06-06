// Auto adapter: scrape real courses from the page `learn` discovered, using the
// generic selector-free extractor. No per-site configuration required.
import { fetchText } from '../fetch.js';
import { extractCourses } from '../extract.js';

export async function autoCourses(college, recipe) {
  if (!recipe?.extractUrl) throw new Error('no learned extractUrl — run detect first');
  const res = await fetchText(recipe.extractUrl, { timeoutMs: 20000 });
  if (!res.ok) throw new Error(`extract page returned HTTP ${res.status}`);
  const { courses } = extractCourses(res.body, { pageUrl: res.url });
  if (!courses.length) throw new Error('extractor found 0 courses (page may now be JS-rendered)');
  // term carried from recipe if present
  return courses.map((c) => ({ ...c, term: recipe.term || c.term || null }));
}

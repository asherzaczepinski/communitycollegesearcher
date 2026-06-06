// Generic HTML adapter.
//
// Driven entirely by a learned recipe's `selectors`. Point it at a page that
// renders a table/list of class sections in the HTML (server-rendered — this
// does not run JavaScript), describe where each field lives with CSS selectors,
// and it extracts courses. This is the template you copy/specialize per college.
//
// recipe.selectors example:
// {
//   "row":      "table.sections tbody tr",   // one element per section
//   "code":     "td.course-code",
//   "title":    "td.course-title",
//   "modality": "td.delivery",               // text gets normalized to the 3 buckets
//   "units":    "td.units",
//   "instructor":"td.instructor",
//   "section":  "td.section-no"
// }
import * as cheerio from 'cheerio';
import { fetchText } from '../fetch.js';
import { normalizeModality } from '../modality.js';

export async function htmlCourses(college, recipe) {
  const sel = recipe?.selectors;
  const target = recipe?.scheduleUrl;
  if (!target || !sel || !sel.row) {
    throw new Error('html adapter needs recipe.scheduleUrl and recipe.selectors.row');
  }

  const res = await fetchText(target);
  if (!res.ok) throw new Error(`schedule page returned HTTP ${res.status}`);

  const $ = cheerio.load(res.body);
  const text = (root, s) => (s ? $(root).find(s).first().text().replace(/\s+/g, ' ').trim() : '');

  const courses = [];
  $(sel.row).each((_, el) => {
    const title = text(el, sel.title);
    if (!title) return; // skip header / empty rows
    courses.push({
      code: text(el, sel.code) || null,
      title,
      modality: normalizeModality(text(el, sel.modality)),
      term: recipe.term || null,
      units: text(el, sel.units) || null,
      instructor: text(el, sel.instructor) || null,
      section: text(el, sel.section) || null,
      description: null,
      url: target,
    });
  });

  if (!courses.length) {
    throw new Error('html adapter matched 0 rows — selectors likely need adjusting');
  }
  return courses;
}

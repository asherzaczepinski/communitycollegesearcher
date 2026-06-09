// Generic, selector-free course extractor.
//
// Given the HTML of a catalog or schedule page, pull out real (code, title)
// pairs and a modality when the page exposes one — without per-site selectors.
// Two strategies are tried and merged:
//   1) TABLE rows  — common on server-rendered class schedules (modality lives
//      in a cell, e.g. "Online", "Hybrid", "In Person").
//   2) TEXT blocks — common on course catalogs, where each course reads like
//      "BIOL 101 - Human Anatomy" inside a heading/link/paragraph.
import * as cheerio from 'cheerio';
import { normalizeModality } from './modality.js';

// A course code like "BIOL 101", "CIS 1A", "MATH-10", "C S 110".
const CODE_RE = /\b([A-Z]{1,5}(?:[ ./-][A-Z]{0,4})?\s?\d{1,3}[A-Z]{0,2})\b/;
const CODE_ANCHORED = /^[A-Z]{1,5}(?:[ ./-][A-Z]{0,4})?\s?\d{1,3}[A-Z]{0,2}$/;
const MODALITY_WORD = /online|hybrid|in[- ]?person|on[- ]?campus|distance|async|hyflex|face[- ]?to[- ]?face|virtual|remote/i;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Subjects that look like codes but aren't courses (times, common abbreviations).
const NON_COURSE_SUBJ = /^(COVID|ZTC|ADA|FAQ|PDF|GTM|AM|PM|AB|SB|ACA|FERPA|EOPS|TTY|TBA|MW|TTH|MWF)$/i;

// A PARENTHESIZED code immediately followed by its title in one element, e.g.
//   "(KINES-001-C01) Introduction to Kinesiology".
// This is the distinctive Ellucian / Banner Self-Service schedule signature. The
// required parentheses keep it from matching "CODE Instructor" / "CODE CRN" cells
// in other layouts (which would mis-pair code with the wrong text).
const EMBEDDED_RE =
  /^\(\s*([A-Z]{2,5})[ ./-](\d{1,3}[A-Z]{0,2})(?:-[A-Z0-9]+)?\s*\)\s*[:–—-]?\s*([A-Za-z][A-Za-z0-9 ,&'’/().:+-]{3,120})$/;

function isCode(s) {
  const t = clean(s).toUpperCase();
  return CODE_ANCHORED.test(t) && /\d/.test(t) && t.length <= 12;
}

function embeddedCourse(text, modalityCtx) {
  const m = clean(text).match(EMBEDDED_RE);
  if (!m || NON_COURSE_SUBJ.test(m[1])) return null;
  const title = clean(m[3]).replace(/\(\s*[\d.]+\s*units?\s*\)/i, '').trim();
  if (title.length < 3 || /^\d+$/.test(title)) return null; // reject CRN-only "titles"
  const modalityHit = MODALITY_WORD.test(modalityCtx) ? modalityCtx : '';
  return {
    code: `${m[1].toUpperCase()} ${m[2].toUpperCase()}`,
    title: title.slice(0, 160),
    modality: modalityHit ? normalizeModality(modalityHit) : null,
  };
}

// Strategy 1: table rows. (Original, conservative: a cell that is exactly a code,
// title = the longest other plain cell.)
function fromTables($) {
  const out = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td, th').map((__, c) => clean($(c).text())).get().filter(Boolean);
    if (cells.length < 2) return;
    const codeCell = cells.find(isCode);
    if (!codeCell) return;
    const rowText = cells.join(' | ');
    const title = cells
      .filter((c) => c !== codeCell && !isCode(c) && c.length > 4 && !/^\d/.test(c))
      .sort((a, b) => b.length - a.length)[0];
    if (!title) return;
    const modalityHit = cells.find((c) => MODALITY_WORD.test(c)) || (MODALITY_WORD.test(rowText) ? rowText : '');
    out.push({
      code: clean(codeCell),
      title: clean(title).slice(0, 160),
      modality: modalityHit ? normalizeModality(modalityHit) : null,
    });
  });
  return out;
}

// Strategy 1b: rows/elements where one cell or link holds "(CODE-SEC) Title". The
// modality comes from the surrounding row's text. Catches Ellucian-style schedules
// the bare-code table strategy misses, without cross-cell mis-pairing.
function fromEmbeddedRows($) {
  const out = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td, th').map((__, c) => clean($(c).text())).get();
    if (!cells.length) return;
    const rowText = cells.join(' | ');
    for (const cell of cells) {
      const c = embeddedCourse(cell, rowText);
      if (c) { out.push(c); break; } // one course per row
    }
  });
  // Non-table layouts: links / list items that read "(CODE) Title".
  $('a, li, dt, h3, h4, h5').each((_, el) => {
    const c = embeddedCourse(clean($(el).text()), clean($(el).text()));
    if (c) out.push(c);
  });
  return out;
}

// Strategy 2: "CODE - Title" text blocks (catalogs).
function fromTextBlocks($) {
  const out = [];
  // Look at elements that typically hold a course heading.
  $('h1,h2,h3,h4,h5,a,li,dt,strong,p,span').each((_, el) => {
    const text = clean($(el).text());
    if (text.length < 6 || text.length > 200) return;
    const m = text.match(
      /^([A-Z]{1,5}(?:[ ./-][A-Z]{0,4})?\s?\d{1,3}[A-Z]{0,2})\s*[-–—:·.]\s*(.+)$/
    );
    if (!m) return;
    if (!/\d/.test(m[1])) return;
    const title = clean(m[2]).replace(/\(\s*[\d.]+\s*units?\s*\)/i, '').trim();
    if (title.length < 3 || title.length > 160) return;
    const modalityHit = MODALITY_WORD.test(text) ? text : '';
    out.push({
      code: clean(m[1]),
      title,
      modality: modalityHit ? normalizeModality(modalityHit) : null,
    });
  });
  return out;
}

// Returns { courses, modalityCoverage } where coverage = fraction with a real modality.
export function extractCourses(html, { pageUrl = null } = {}) {
  const $ = cheerio.load(html);
  // Drop obvious nav/script noise.
  $('script,style,nav,footer,header').remove();

  const merged = [...fromTables($), ...fromEmbeddedRows($), ...fromTextBlocks($)];

  // Dedupe by code+title.
  const seen = new Map();
  for (const c of merged) {
    const key = `${c.code}::${c.title}`.toLowerCase();
    const prev = seen.get(key);
    // Prefer the variant that has a known modality.
    if (!prev || (!prev.modality && c.modality)) seen.set(key, c);
  }
  const courses = [...seen.values()].map((c) => ({
    code: c.code,
    title: c.title,
    modality: c.modality || 'in_person', // default when the page doesn't say
    modalityKnown: !!c.modality,
    term: null,
    units: null,
    instructor: null,
    section: null,
    description: null,
    url: pageUrl,
  }));

  const known = courses.filter((c) => c.modalityKnown).length;
  return {
    courses,
    modalityCoverage: courses.length ? known / courses.length : 0,
  };
}

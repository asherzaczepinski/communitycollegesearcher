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

function isCode(s) {
  const t = clean(s).toUpperCase();
  return CODE_ANCHORED.test(t) && /\d/.test(t) && t.length <= 12;
}

// Strategy 1: table rows.
function fromTables($) {
  const out = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td, th').map((__, c) => clean($(c).text())).get().filter(Boolean);
    if (cells.length < 2) return;
    const codeCell = cells.find(isCode);
    if (!codeCell) return;
    const rowText = cells.join(' | ');
    // Title = the longest non-code, non-modality, non-numeric cell.
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

  const merged = [...fromTables($), ...fromTextBlocks($)];

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

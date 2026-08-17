// C-ID (Course Identification Numbering System) loader.
//
// C-ID (c-idsystem.org) is California's statewide "common course" system: a
// course that carries a C-ID designation has been reviewed and approved as
// equivalent to a common descriptor, which is the backbone of ADT / transfer
// articulation. In plain terms: a course WITH a C-ID is the "acceptable",
// transfer-ready version. We attach that designation to our own course rows so
// the UI can show a "C-ID: MATH 110" badge and filter to transfer-approved
// courses.
//
// Data comes from two public bulk CSV exports (no auth, no browser):
//   https://data-c-idsystem.org/descriptors/final/csv   (C-ID # -> title/description)
//   https://data-c-idsystem.org/courses/csv             (approved college courses)
// Download them with `npm run cid:fetch`; they're cached under src/data/cid/.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { slugify } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CID_DIR = join(__dirname, 'data', 'cid');
export const COURSES_CSV = join(CID_DIR, 'courses.csv');
export const DESCRIPTORS_CSV = join(CID_DIR, 'descriptors.csv');

// A handful of colleges are named slightly differently in the C-ID export than
// in our colleges.json. Map C-ID's slug -> our slug so their courses match.
const SLUG_ALIASES = {
  'coastline-community-college': 'coastline-college',
  'lassen-community-college': 'lassen-college',
  'los-angeles-trade-technical-college': 'los-angeles-trade-tech-college',
};

// Minimal RFC-4180 CSV line parser (handles quoted fields + escaped quotes).
function parseLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  // Rows can contain embedded newlines inside quoted fields, so split on record
  // boundaries by tracking quote parity rather than naive line splitting.
  const rows = [];
  let field = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Normalize a course code so "CS 1H", "CS-1H", "cs1h" all compare equal, and so
// C-ID's separate (Dept Name, Dept Number) columns join to our single `code`.
export function normCode(...parts) {
  return parts.join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

let _index = null;

// Build (and memoize) the lookup index:
//   collegeSlug -> Map(normalizedCode -> { cId, descriptor, cIdTitle })
// Returns { index, descriptors, stats } or null if the CSVs aren't downloaded.
export function loadCid() {
  if (_index) return _index;
  if (!existsSync(COURSES_CSV)) return null;

  // Descriptor metadata: C-ID # -> { title, description }.
  const descriptors = new Map();
  if (existsSync(DESCRIPTORS_CSV)) {
    const rows = parseCsv(readFileSync(DESCRIPTORS_CSV, 'utf8'));
    const h = rows[0];
    const iCid = h.indexOf('C-ID Descriptor');
    const iTitle = h.indexOf('Title');
    const iDesc = h.indexOf('Description');
    for (let r = 1; r < rows.length; r++) {
      const cid = (rows[r][iCid] || '').trim();
      if (cid) descriptors.set(cid, {
        title: (rows[r][iTitle] || '').trim(),
        description: (rows[r][iDesc] || '').trim() || null,
      });
    }
  }

  const rows = parseCsv(readFileSync(COURSES_CSV, 'utf8'));
  const h = rows[0];
  const iCollege = h.indexOf('College');
  const iCid = h.indexOf('C-ID #');
  const iDept = h.indexOf('Dept Name');
  const iNum = h.indexOf('Dept Number');
  const index = new Map();
  let rowsUsed = 0;
  for (let r = 1; r < rows.length; r++) {
    const f = rows[r];
    const collegeName = (f[iCollege] || '').trim();
    const cId = (f[iCid] || '').trim();
    const key = normCode(f[iDept] || '', f[iNum] || '');
    if (!collegeName || !cId || !key) continue;
    let slug = slugify(collegeName);
    slug = SLUG_ALIASES[slug] || slug;
    if (!index.has(slug)) index.set(slug, new Map());
    // A course can appear under multiple effective terms; first C-ID wins.
    const bySlug = index.get(slug);
    if (!bySlug.has(key)) {
      const d = descriptors.get(cId);
      bySlug.set(key, {
        cId,
        descriptor: cId,
        cIdTitle: d?.title || null,
        cIdDescription: d?.description || null,
      });
      rowsUsed++;
    }
  }
  _index = { index, descriptors, stats: { colleges: index.size, courses: rowsUsed } };
  return _index;
}

// Look up the C-ID designation for one course. Returns { cId, cIdTitle } or null.
export function cIdFor(collegeSlug, code) {
  const data = loadCid();
  if (!data || !code) return null;
  const bySlug = data.index.get(collegeSlug);
  if (!bySlug) return null;
  return bySlug.get(normCode(code)) || null;
}

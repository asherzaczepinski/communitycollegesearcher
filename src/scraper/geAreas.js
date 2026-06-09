// GE / "A–G" transfer-area tagging for CVC courses.
//
// The course CARD shows only the top-level transferability (IGETC / Cal-GETC /
// CSU BREADTH). The SPECIFIC areas a course satisfies (CSU GE A1, B2, …; IGETC
// 1A, 5B, …; Cal-GETC 3A, …) come from the requirement search mode:
//   filter[search_type]=csu_req|igetc_req|cal_getc_req
//   filter[requirement_ids][]=<areaId>
// We run each area statewide (online only) and collect the CVC course ids it
// returns, building a cvcCourseId -> {csu:[],igetc:[],calGetc:[]} map that we
// cache to disk and join onto our courses' meta.geAreas. Survives re-pulls
// because the map lives in a file, not the DB.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { fetchText } from './fetch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const GE_AREA_FILE = join(__dirname, '..', 'data', 'cvc-ge-areas.json');
const HOST = 'https://search.cvc.edu';

// requirement_ids harvested from the live req-search forms (stable ids).
export const AREAS = {
  csu: [
    [13042, 'A1 Oral Communication'], [13043, 'A2 Written Communication'], [13044, 'A3 Critical Thinking'],
    [13045, 'B1 Physical Science'], [13046, 'B2 Life Science'], [13047, 'B3 Laboratory Activity'],
    [13048, 'B4 Mathematics/Quantitative Reasoning'], [13049, 'C1 Arts'], [13050, 'C2 Humanities'],
    [13051, 'D Social Sciences'], [14842, 'D0 Sociology/Criminology'], [14844, 'D1 Anthropology/Archeology'],
    [14845, 'D2 Economics'], [14849, 'D3 Ethnic Studies'], [14852, 'D4 Gender Studies'], [14847, 'D5 Geography'],
    [14848, 'D6 History'], [14846, 'D7 Interdisciplinary Social/Behavioral'], [14843, 'D8 Political Science'],
    [14851, 'D9 Psychology'], [13052, 'E Lifelong Learning'],
  ],
  igetc: [
    [13053, '1A English Composition'], [13054, '1B Critical Thinking-English'], [13055, '1C Oral Communication'],
    [13056, '2A Math'], [13057, '3A Arts'], [13058, '3B Humanities'], [13073, '4 Social Sciences'],
    [13059, '4A Anthropology/Archaeology'], [13060, '4B Economics'], [13066, '4C Ethnic Studies'],
    [13067, '4D Gender Studies'], [13061, '4E Geography'], [13062, '4F History'],
    [13074, '4G Interdisciplinary Social/Behavioral'], [13063, '4H Political Science'], [13064, '4I Psychology'],
    [13065, '4J Sociology/Criminology'], [13068, '5A Physical Science'], [13069, '5B Biological Science'],
    [13070, '5C Science Laboratory'],
  ],
  calGetc: [
    [179433, '1A English Composition'], [179444, '1B Critical Thinking & Composition'], [179441, '1C Oral Communication'],
    [179445, '2 Math/Quantitative Reasoning'], [179442, '3A Arts'], [179436, '3B Humanities'],
    [179431, '4 Social & Behavioral Sciences'], [179435, '5A Physical Science'], [179434, '5B Biological Science'],
    [179430, '5C Laboratory'],
  ],
};

const SEARCH_TYPE = { csu: 'csu_req', igetc: 'igetc_req', calGetc: 'cal_getc_req' };

function areaUrl(system, areaId, page) {
  const p = new URLSearchParams();
  p.append('filter[university_id]', '757');
  p.append('filter[search_type]', SEARCH_TYPE[system]);
  p.append('filter[requirement_ids][]', String(areaId));
  p.append('filter[search_all_universities]', 'true');
  p.append('filter[delivery_methods][]', 'Online'); // match our online dataset, cut volume
  p.append('commit', 'Find Classes');
  if (page > 1) p.append('page', String(page));
  return `${HOST}/search?${p.toString()}`;
}

function courseIdsOnPage(html) {
  const $ = cheerio.load(html);
  const ids = [];
  $('a.course-details-link').each((_, a) => {
    const m = ($(a).attr('href') || '').match(/\/courses\/(\d+)/);
    if (m) ids.push(m[1]);
  });
  return ids;
}

// Build the full map: cvcCourseId -> { csu:Set, igetc:Set, calGetc:Set }.
export async function buildGeAreaMap({ maxPages = 60, onProgress = null } = {}) {
  const map = new Map();
  const add = (id, system, label) => {
    if (!map.has(id)) map.set(id, { csu: new Set(), igetc: new Set(), calGetc: new Set() });
    map.get(id)[system].add(label);
  };
  for (const [system, areas] of Object.entries(AREAS)) {
    for (const [areaId, label] of areas) {
      for (let page = 1; page <= maxPages; page++) {
        const res = await fetchText(areaUrl(system, areaId, page), { timeoutMs: 25000, retries: 2 });
        if (!res.ok) break;
        const ids = courseIdsOnPage(res.body);
        if (!ids.length) break;
        ids.forEach((id) => add(id, system, label));
        if (onProgress) onProgress({ system, area: label, page, courses: map.size });
        if (ids.length < 10) break;
      }
    }
  }
  return map;
}

// Serialize the Map of Sets to a plain JSON object and save it.
export function saveGeAreaMap(map) {
  const obj = {};
  for (const [id, sys] of map) {
    obj[id] = { csu: [...sys.csu], igetc: [...sys.igetc], calGetc: [...sys.calGetc] };
  }
  writeFileSync(GE_AREA_FILE, JSON.stringify(obj));
  return Object.keys(obj).length;
}

let _cache = null;
// Load the cached map as a plain object { cvcCourseId: {csu,igetc,calGetc} }.
export function loadGeAreaMap() {
  if (_cache) return _cache;
  if (!existsSync(GE_AREA_FILE)) return {};
  try { _cache = JSON.parse(readFileSync(GE_AREA_FILE, 'utf8')); } catch { _cache = {}; }
  return _cache;
}

// The GE areas for one CVC course id, or null if none/unknown.
export function geAreasFor(cvcCourseId) {
  const m = loadGeAreaMap()[cvcCourseId];
  if (!m) return null;
  const any = (m.csu?.length || 0) + (m.igetc?.length || 0) + (m.calGetc?.length || 0);
  return any ? m : null;
}

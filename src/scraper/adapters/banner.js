// Real adapter for Ellucian Banner "Student Registration Self-Service" — the
// public class-search many CA community colleges run. No browser needed: it
// exposes a JSON API once you establish a session and pick a term.
//
// Flow:
//   1. GET .../ssb/term/termSelection?mode=search   -> session cookie
//   2. GET .../ssb/classSearch/getTerms             -> available terms
//   3. POST .../ssb/term/search   (term=CODE)       -> lock the term into session
//   4. GET .../ssb/searchResults/searchResults      -> paged JSON of sections
//
// Each section carries instructionalMethodDescription + campusDescription, which
// is REAL modality (in-person / online / hybrid).
import { normalizeModality } from '../modality.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0 Safari/537.36';

// Minimal cookie jar over fetch (Node's fetch doesn't persist cookies).
function makeJar() {
  const jar = new Map();
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb: (res) => {
      const set = res.headers.getSetCookie?.() || [];
      for (const c of set) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
  };
}

async function jfetch(jar, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Cookie: jar.header(),
      ...(opts.headers || {}),
    },
    redirect: 'follow',
  });
  jar.absorb(res);
  return res;
}

function bannerModality(method, campus) {
  const t = `${method || ''} ${campus || ''}`.toLowerCase();
  if (/hybrid|hyflex|blend/.test(t)) return 'hybrid';
  if (/online|internet|dist\.?\s*ed|distance|virtual|remote|web[- ]?based/.test(t)) return 'online';
  // Fall back to the shared normalizer, then default to in-person.
  return normalizeModality(`${method} ${campus}`);
}

// Pick the newest registerable term (skip "View Only" history terms when possible).
function chooseTerm(terms) {
  if (!Array.isArray(terms) || !terms.length) return null;
  const live = terms.find((t) => !/view only/i.test(t.description || ''));
  return (live || terms[0]);
}

export async function bannerCourses(base, { maxSections = 6000, pageSize = 500 } = {}) {
  const jar = makeJar();

  // 1. session
  await jfetch(jar, `${base}/ssb/term/termSelection?mode=search`);

  // 2. terms
  const termsRes = await jfetch(jar, `${base}/ssb/classSearch/getTerms?searchTerm=&offset=1&max=10`);
  const terms = await termsRes.json().catch(() => []);
  const term = chooseTerm(terms);
  if (!term) throw new Error('Banner: no terms returned');

  // 3. lock term
  await jfetch(jar, `${base}/ssb/term/search?mode=search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ term: term.code, studyPath: '', studyPathText: '', startDatepicker: '', endDatepicker: '' }),
  });

  // 4. paged results
  const sections = [];
  for (let offset = 0; offset < maxSections; offset += pageSize) {
    const url =
      `${base}/ssb/searchResults/searchResults?txt_term=${term.code}` +
      `&pageOffset=${offset}&pageMaxSize=${pageSize}` +
      `&sortColumn=subjectDescription&sortDirection=asc`;
    const res = await jfetch(jar, url);
    const json = await res.json().catch(() => null);
    if (!json || !Array.isArray(json.data) || json.data.length === 0) break;
    sections.push(...json.data);
    if (json.totalCount && sections.length >= json.totalCount) break;
  }

  if (!sections.length) throw new Error('Banner: 0 sections (term may be closed or API changed)');

  return sections.map((s) => {
    const instructor = (s.faculty || []).find((f) => f.primaryIndicator)?.displayName
      || (s.faculty || [])[0]?.displayName || null;
    return {
      code: `${s.subject || ''} ${s.courseNumber || ''}`.trim(),
      title: s.courseTitle ? String(s.courseTitle).trim() : `${s.subject} ${s.courseNumber}`,
      modality: bannerModality(s.instructionalMethodDescription, s.campusDescription),
      term: term.description || null,
      units: s.creditHourLow != null ? String(s.creditHourLow) : null,
      instructor,
      section: s.sequenceNumber || s.courseReferenceNumber || null,
      description: [s.instructionalMethodDescription, s.campusDescription].filter(Boolean).join(' · ') || null,
      url: `${base}/ssb/classSearch/classSearch`,
    };
  });
}

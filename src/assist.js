// ASSIST.org client — UC transferability (UC Transfer Course Agreement) lists.
//
// ASSIST is the official statewide articulation database. Its public JSON API
// needs a small XSRF handshake: GET https://assist.org/ once to receive the
// XSRF cookies, then echo the X-XSRF-TOKEN cookie value back as the
// X-XSRF-TOKEN header on every /api/* call.
//
// The endpoint we care about:
//   /api/transferability/courses?institutionId=<id>&academicYearId=<id>&listType=UC
// returns the college's full UC TCA — every course UC accepts for transfer
// credit that year — with an isCsuTransferable flag per course as a bonus.

const HOST = 'https://assist.org';
const UA = 'Mozilla/5.0 (CommunityCollegeSearcher; course transferability tagging)';

let session = null; // { cookie, token }

async function handshake() {
  const res = await fetch(`${HOST}/`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`assist.org handshake failed: HTTP ${res.status}`);
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const jar = {};
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  const token = jar['X-XSRF-TOKEN'] || jar['XSRF-TOKEN'];
  if (!token) throw new Error('assist.org handshake: no XSRF token cookie');
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  session = { cookie, token };
}

export async function assistGet(path, { retries = 2 } = {}) {
  if (!session) await handshake();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${HOST}${path}`, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          Cookie: session.cookie,
          'X-XSRF-TOKEN': session.token,
        },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 403 && attempt <= retries) { session = null; await handshake(); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw new Error(`assist.org ${path}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

// Current display name of an ASSIST institution (names carry fromYear history).
export function institutionName(inst) {
  const names = inst.names || [];
  let best = null;
  for (const n of names) {
    if (!best || (n.fromYear || 0) > (best.fromYear || 0)) best = n;
  }
  return best ? best.name : null;
}

export async function getInstitutions() {
  return assistGet('/api/institutions');
}

// The academic year whose fall term matches `fallYear` (e.g. 2026 -> "2026-2027").
export async function getAcademicYearId(fallYear) {
  const years = await assistGet('/api/AcademicYears');
  const hit = years.find((y) => y.fallYear === fallYear);
  return hit ? hit.id : null;
}

// A college's UC Transfer Course Agreement list for one academic year.
// Every course in courseInformationList is UC-transferable that year.
export async function getUcTransferableCourses(institutionId, academicYearId) {
  const data = await assistGet(
    `/api/transferability/courses?institutionId=${institutionId}&academicYearId=${academicYearId}&listType=UC`,
  );
  return data && Array.isArray(data.courseInformationList) ? data : null;
}

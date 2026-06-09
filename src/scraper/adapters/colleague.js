// Colleague Self-Service adapter: real, login-free full course catalog for
// colleges confirmed to run Ellucian Colleague Self-Service (see ../colleague.js
// for the client and the COLLEAGUE_HOSTS map). Preferred over the CVC fallback
// because it returns the FULL catalog (in-person + online), not online-only.
import { fetchColleagueCourses, colleagueHost } from '../colleague.js';

export async function colleagueCourses(college) {
  const host = colleagueHost(college.slug);
  if (!host) throw new Error('no known Colleague Self-Service host for this college');
  const courses = await fetchColleagueCourses(host);
  if (!courses.length) throw new Error('Colleague Self-Service returned 0 courses');
  return courses;
}

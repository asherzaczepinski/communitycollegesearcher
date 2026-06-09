// CVC adapter: real online-course data from the statewide CVC Exchange.
//
// Used as a fallback BEFORE sample data: any college we can't otherwise scrape
// but that exists on search.cvc.edu gets real (online-only) course rows instead
// of placeholder samples. See ../cvc.js for the client and the data model.
//
// Online-only is a real limitation — these rows carry modality 'online' and no
// in-person sections — but real partial data beats fabricated samples.
import { fetchCvcCourses } from '../cvc.js';

export async function cvcCourses(college) {
  const courses = await fetchCvcCourses(college.slug);
  if (!courses.length) throw new Error('CVC has no online courses for this college');
  // strip the internal `_`-prefixed fields the client attaches for the validator
  return courses.map(({ _college, _transfer, _tuition, ...c }) => c);
}

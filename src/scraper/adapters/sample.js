// Sample-data adapter.
//
// Real per-college scraping has to be built site-by-site (118 different course
// systems). So the app ships with a deterministic sample generator: every
// college gets a realistic-looking catalog spread across in-person / online /
// hybrid, so the search frontend works end-to-end on day one. Replace a
// college's data by giving it a real adapter ('html') and re-scraping.
import { MODALITIES } from '../modality.js';

const SUBJECTS = [
  ['CIS', 'Computer Information Systems', ['Introduction to Computer Science', 'Programming in Python', 'Data Structures', 'Web Development', 'Databases', 'Cybersecurity Fundamentals', 'JavaScript Programming', 'Networking Essentials']],
  ['MATH', 'Mathematics', ['College Algebra', 'Precalculus', 'Calculus I', 'Calculus II', 'Statistics', 'Trigonometry', 'Linear Algebra', 'Discrete Mathematics']],
  ['ENGL', 'English', ['College Composition', 'Critical Thinking', 'Creative Writing', 'American Literature', 'Technical Writing', 'Introduction to Poetry']],
  ['BIOL', 'Biology', ['General Biology', 'Human Anatomy', 'Microbiology', 'Physiology', 'Marine Biology', 'Genetics']],
  ['CHEM', 'Chemistry', ['General Chemistry', 'Organic Chemistry', 'Introductory Chemistry', 'Biochemistry']],
  ['PSYC', 'Psychology', ['Introduction to Psychology', 'Developmental Psychology', 'Abnormal Psychology', 'Social Psychology']],
  ['BUS', 'Business', ['Introduction to Business', 'Principles of Management', 'Marketing', 'Business Law', 'Accounting Principles', 'Entrepreneurship']],
  ['ART', 'Art', ['Art History', 'Drawing I', 'Digital Photography', 'Ceramics', 'Graphic Design']],
  ['HIST', 'History', ['US History', 'World History', 'California History', 'History of Western Civilization']],
  ['COMM', 'Communication Studies', ['Public Speaking', 'Interpersonal Communication', 'Mass Media', 'Small Group Communication']],
  ['SPAN', 'Spanish', ['Elementary Spanish', 'Intermediate Spanish', 'Spanish for Heritage Speakers']],
  ['NURS', 'Nursing', ['Fundamentals of Nursing', 'Medical-Surgical Nursing', 'Pharmacology', 'Maternal-Newborn Nursing']],
  ['KIN', 'Kinesiology', ['Introduction to Kinesiology', 'Personal Fitness', 'Yoga', 'First Aid and CPR']],
  ['ECON', 'Economics', ['Macroeconomics', 'Microeconomics']],
  ['PHYS', 'Physics', ['General Physics', 'Physics for Scientists and Engineers', 'Astronomy']],
];

const INSTRUCTORS = ['Garcia', 'Nguyen', 'Smith', 'Patel', 'Johnson', 'Lee', 'Martinez', 'Brown', 'Khan', 'Davis', 'Rivera', 'Chen', 'Wong', 'Lopez', 'Anderson'];
const TERM = 'Fall 2026';

// Simple deterministic PRNG so each college's catalog is stable across runs.
function makeRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function sampleCourses(college) {
  const rng = makeRng(college.slug);
  const courses = [];
  for (const [code, subjectName, titles] of SUBJECTS) {
    // Each college offers a random subset of subjects/sections.
    if (rng() < 0.2) continue;
    const offered = titles.filter(() => rng() < 0.7);
    for (const title of offered) {
      const num = 100 + Math.floor(rng() * 200);
      // 1-3 sections per course, each potentially a different modality.
      const sectionCount = 1 + Math.floor(rng() * 3);
      for (let s = 0; s < sectionCount; s++) {
        const modality = pick(rng, MODALITIES);
        courses.push({
          code: `${code} ${num}`,
          title,
          modality,
          term: TERM,
          units: String(1 + Math.floor(rng() * 5)),
          instructor: pick(rng, INSTRUCTORS),
          section: `${String(s + 1).padStart(2, '0')}${pick(rng, ['', 'W', 'H', 'N'])}`,
          description: `${title} — ${subjectName} at ${college.name}.`,
          url: college.url,
        });
      }
    }
  }
  return courses;
}

// Shared SQL predicates that define which courses the searcher is allowed to
// surface. The goal: only show courses we're CONFIDENT about, so the site never
// looks like it's missing a college's catalog.
//
// Two gates, both applied everywhere (search results AND the college dropdown),
// so the counts a user sees always match what the results actually contain.

// A course is TRUSTWORTHY only when it comes from an authoritative statewide
// source — never from a per-college website scrape (those grabbed wrong pages:
// Wikipedia, "new courses" lists, term schedules, PDF viewers):
//   • 'assist' — ASSIST.org, the official CA transferable-course database, or
//   • 'cvc'    — search.cvc.edu, the official statewide online course exchange.
// Assumes the row alias used across the API: `co` = courses.
export const CONFIDENT_COURSE_SQL = `co.source IN ('assist','cvc')`;

// A row is DISPLAYABLE when it has a real title AND a real, clickable link — so
// every course a user clicks goes straight to its class page. Filters out scrape
// artifacts (PDF links, CRNs / section numbers as titles, modality-as-title).
export const VALID_COURSE_SQL = `(
  co.title ~ '[A-Za-z][A-Za-z]'
  AND lower(trim(co.title)) <> 'pdf'
  AND co.title !~* '^(in.?person|online (a?synchronous)|hybrid,)'
  AND co.url LIKE 'http%'
)`;

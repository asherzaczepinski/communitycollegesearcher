// CVC cross-check / "is it really live?" validator.
//
// Idea: search.cvc.edu (the statewide online course exchange) is an independent,
// login-free source of truth for what ONLINE courses each CA community college
// actually offers. A college's online courses are a subset of its full catalog,
// so if our scraper is genuinely live for a college, our scraped course codes
// should contain most of the codes CVC lists online. If CVC shows real online
// courses but our data is empty or barely overlaps, our "scrape" is not live —
// it's stale, sample, or wrong — and CVC can backfill it.
//
// Usage:
//   node src/cvcValidate.js                 # all CVC colleges, quick probe
//   node src/cvcValidate.js citrus-college  # one or more specific slugs
//   node src/cvcValidate.js --full          # full subject sweep (slow, exhaustive)
//   node src/cvcValidate.js --probe 12      # use first N subjects as the probe
//
// Writes a JSON report to src/data/cvc-validation.json and prints a table.
// It does NOT mutate the DB — it reports; acting on "not live" is a separate step.
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { CVC_IDS, SUBJECTS, fetchCvcCourses } from './scraper/cvc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT = join(__dirname, 'data', 'cvc-validation.json');

// Normalize a code for comparison: uppercase, drop non-alphanumerics.
const normCode = (c) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Normalize a title for comparison: uppercase letters+digits only. Titles are
// the reliable join key across sources — CVC mints its own C-ID-style codes
// (BIOLOGY25, PSYCC1000) that never match a college's local codes (BIO 10), but
// course *titles* ("General Biology") line up.
const normTitle = (t) => (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Our scraped data for a college: normalized code + title sets, and row count.
function ourData(slug) {
  const rows = db.prepare(`
    SELECT co.code, co.title FROM courses co
    JOIN colleges c ON c.id = co.college_id
    WHERE c.slug = ?
  `).all(slug);
  const codes = new Set(), titles = new Set();
  for (const r of rows) {
    const c = normCode(r.code); if (c) codes.add(c);
    const t = normTitle(r.title); if (t) titles.add(t);
  }
  return { codes, titles, total: rows.length };
}

function scrapeTypeOf(slug) {
  const r = db.prepare('SELECT scrape_type FROM colleges WHERE slug = ?').get(slug);
  return r ? r.scrape_type : null;
}

// Decide the verdict for one college from CVC + our data.
//
// Overlap is the fraction of CVC's online courses whose TITLE appears in our
// data (CVC online courses are a subset of the full catalog, so a live college
// should contain most of them). We take the better of title- and code-overlap,
// but title is what actually matches across the two code schemes.
//   live        — we contain most of CVC's online titles (real & current)
//   suspect     — we have lots of rows but they barely overlap CVC (stale or
//                 malformed data, e.g. titles polluted with location text)
//   not-live    — we have ~no rows while CVC has real online courses (backfill)
//   unknown     — CVC probe returned nothing, can't judge from here
function classify({ cvc, our, scrapeType }) {
  const real = scrapeType && !['sample', 'none'].includes(scrapeType);
  if (cvc.length === 0) return { verdict: real && our.total > 0 ? 'live' : 'unknown', overlap: null };

  const cvcTitles = new Set(cvc.map((c) => normTitle(c.title)).filter(Boolean));
  const cvcCodes = new Set(cvc.map((c) => normCode(c.code)).filter(Boolean));
  const titleHit = [...cvcTitles].filter((t) => our.titles.has(t)).length;
  const codeHit = [...cvcCodes].filter((c) => our.codes.has(c)).length;
  const overlap = Math.max(
    cvcTitles.size ? titleHit / cvcTitles.size : 0,
    cvcCodes.size ? codeHit / cvcCodes.size : 0,
  );
  const matched = Math.max(titleHit, codeHit);

  if (our.total === 0) return { verdict: 'not-live', overlap: 0, matched };
  if (overlap >= 0.3) return { verdict: 'live', overlap, matched };
  // We have data but it doesn't reflect CVC. A big catalog that disagrees is
  // "suspect" (likely malformed/stale); a thin one is just not live.
  return { verdict: our.total >= 100 ? 'suspect' : 'not-live', overlap, matched };
}

async function run() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const probeIdx = args.indexOf('--probe');
  const probeN = probeIdx >= 0 ? Number(args[probeIdx + 1]) : 6;
  const slugArgs = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

  const subjects = full ? SUBJECTS : SUBJECTS.slice(0, probeN);
  const slugs = slugArgs.length ? slugArgs : Object.keys(CVC_IDS);

  console.log(`CVC validation — ${slugs.length} colleges, ${subjects.length} subject probe${full ? ' (FULL sweep)' : ''}\n`);
  console.log('VERDICT      CVC   OURS  OVERLAP  COLLEGE');
  console.log('-------      ---   ----  -------  -------');

  const report = [];
  for (const slug of slugs) {
    if (!CVC_IDS[slug]) { console.log(`no-cvc         -      -        -  ${slug}`); report.push({ slug, verdict: 'no-cvc' }); continue; }
    let cvc = [];
    try {
      cvc = await fetchCvcCourses(slug, { subjects });
    } catch (e) {
      console.log(`error          -      -        -  ${slug}  (${e.message})`);
      report.push({ slug, verdict: 'error', error: e.message });
      continue;
    }
    const our = ourData(slug);
    const scrapeType = scrapeTypeOf(slug);
    const { verdict, overlap, matched } = classify({ cvc, our, scrapeType });
    const ov = overlap == null ? '   -  ' : `${(overlap * 100).toFixed(0).padStart(3)}%  `;
    console.log(`${verdict.padEnd(12)} ${String(cvc.length).padStart(4)}  ${String(our.total).padStart(5)}   ${ov}  ${slug}`);
    report.push({ slug, verdict, cvcOnline: cvc.length, ours: our.total, ourScrapeType: scrapeType, overlap, matched: matched ?? null });
  }

  const summary = report.reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {});
  writeFileSync(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), probe: subjects, summary, colleges: report }, null, 2));
  console.log(`\nSummary: ${JSON.stringify(summary)}`);
  const notLive = report.filter((r) => r.verdict === 'not-live');
  if (notLive.length) {
    console.log(`\nNOT LIVE (CVC has online courses we don't reflect) — ${notLive.length}:`);
    for (const r of notLive) console.log(`  ${r.slug}  (CVC ${r.cvcOnline} online, we have ${r.ours})`);
  }
  console.log(`\nReport written to ${REPORT}`);
}

run().catch((e) => { console.error(e); process.exit(1); });

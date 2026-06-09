// Build the CVC GE / A–G area map and stamp it onto every CVC course already in
// the DB. Run after a CVC pull (or any time) to add `meta.geAreas` — the specific
// CSU GE / IGETC / Cal-GETC areas each course satisfies.
//
//   node src/cvcGeAreas.js            # build map + apply to DB
//   node src/cvcGeAreas.js --build    # only (re)build the cached map
//   node src/cvcGeAreas.js --apply    # only apply the cached map to the DB
import { db } from './db.js';
import { buildGeAreaMap, saveGeAreaMap, loadGeAreaMap } from './scraper/geAreas.js';

async function build() {
  console.log('Building GE area map (CSU + IGETC + Cal-GETC, online, statewide)…');
  let lastArea = '';
  const map = await buildGeAreaMap({
    onProgress: ({ system, area, page, courses }) => {
      if (area !== lastArea) { process.stdout.write(`\n  ${system} ${area}`); lastArea = area; }
      process.stdout.write(`\r  ${system} ${area} — p${page}, ${courses} courses tagged   `);
    },
  });
  const n = saveGeAreaMap(map);
  console.log(`\nSaved area map for ${n} courses.`);
  return map;
}

function apply() {
  const map = loadGeAreaMap();
  const ids = Object.keys(map);
  if (!ids.length) { console.log('No GE area map on disk — run with --build first.'); return; }
  console.log(`Applying GE areas to DB courses (map has ${ids.length} courses)…`);

  // Walk CVC courses that carry a cvcCourseId in their meta, stamp geAreas in.
  const rows = db.prepare(`SELECT id, meta FROM courses WHERE source='cvc' AND meta IS NOT NULL`).all();
  const upd = db.prepare('UPDATE courses SET meta=? WHERE id=?');
  let updated = 0;
  db.prepare('BEGIN').run();
  try {
    for (const r of rows) {
      let meta; try { meta = JSON.parse(r.meta); } catch { continue; }
      const id = meta.cvcCourseId;
      const areas = id && map[id];
      if (!areas) continue;
      const ga = {
        csu: areas.csu || [], igetc: areas.igetc || [], calGetc: areas.calGetc || [],
      };
      if ((ga.csu.length + ga.igetc.length + ga.calGetc.length) === 0) continue;
      meta.geAreas = ga;
      upd.run(JSON.stringify(meta), r.id);
      updated++;
    }
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  console.log(`Stamped geAreas onto ${updated} courses.`);
}

async function run() {
  const args = process.argv.slice(2);
  const onlyBuild = args.includes('--build');
  const onlyApply = args.includes('--apply');
  if (!onlyApply) await build();
  if (!onlyBuild) apply();
}

run().catch((e) => { console.error(e); process.exit(1); });

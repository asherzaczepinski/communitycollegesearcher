// One-shot cleanup of the CURRENT database, no re-scrape needed:
//
//  1. Notes out of titles — a few catalogs jammed "…-NOTE: <text>" into the
//     course title. Move <text> to meta.note and restore the clean title.
//     Applies to every source.
//
//  2. One row per teacher (CVC) — CVC listed a multi-instructor course as a
//     single row with "A, B, C" joined in `instructor`. Split it into one row
//     per distinct professor (using the per-section professor already stored in
//     meta.sections), matching how schedule-sourced colleges list courses. Each
//     split row KEEPS every meta tag (UC/C-ID/GE/transfer), so no re-tag needed.
//     Site rows are left alone: their commas are "Last, First" (a single name).
//
//   node src/fixExisting.js
import { db, getColleges, splitTitleNote } from './db.js';

// --- 1. Notes out of titles ------------------------------------------------
function fixNotes() {
  const rows = db.prepare("SELECT id, title, meta FROM courses WHERE title LIKE '%NOTE:%'").all();
  const upd = db.prepare('UPDATE courses SET title = ?, meta = ? WHERE id = ?');
  let n = 0;
  db.prepare('BEGIN').run();
  try {
    for (const row of rows) {
      let meta = null;
      if (row.meta) { try { meta = JSON.parse(row.meta); } catch { meta = null; } }
      const res = splitTitleNote(row.title, meta);
      if (res.title === row.title) continue; // note-only title, left as-is
      upd.run(res.title, res.meta && Object.keys(res.meta).length ? JSON.stringify(res.meta) : null, row.id);
      n++;
    }
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  console.log(`Notes: moved a note out of ${n} title(s).`);
}

// --- 2. One CVC row per teacher --------------------------------------------
const insert = db.prepare(`
  INSERT INTO courses (college_id, code, title, modality, term, units, instructor, section, description, url, source, meta, updated_at)
  VALUES (@college_id, @code, @title, @modality, @term, @units, @instructor, @section, @description, @url, @source, @meta, @updated_at)
  ON CONFLICT(college_id, code, title, modality, term, section) DO NOTHING
`);

function splitTeachers() {
  const colleges = getColleges();
  let split = 0, added = 0, collegesTouched = 0;
  for (const college of colleges) {
    const rows = db.prepare("SELECT * FROM courses WHERE college_id = ? AND source = 'cvc'").all(college.id);
    const toSplit = [];
    for (const row of rows) {
      if (!row.instructor || !row.instructor.includes(', ')) continue;
      let meta = {};
      if (row.meta) { try { meta = JSON.parse(row.meta); } catch { meta = {}; } }
      const secs = meta.sections || [];
      const byProf = new Map();
      for (const s of secs) {
        const key = s.professor || '';
        if (!byProf.has(key)) byProf.set(key, []);
        byProf.get(key).push(s);
      }
      // Only split when the section data actually names >1 distinct professor.
      const realProfs = [...byProf.keys()].filter(Boolean);
      if (realProfs.length < 2) continue;
      toSplit.push({ row, meta, byProf });
    }
    if (!toSplit.length) continue;

    db.prepare('BEGIN').run();
    try {
      for (const { row, meta, byProf } of toSplit) {
        db.prepare('DELETE FROM courses WHERE id = ?').run(row.id);
        let i = 0;
        for (const [prof, sections] of byProf) {
          i++;
          const rowMeta = {
            ...meta,
            professors: prof ? [prof] : [],
            formats: [...new Set(sections.map((s) => s.format).filter(Boolean))],
            sections,
            sectionCount: sections.length,
          };
          insert.run({
            college_id: college.id,
            code: row.code,
            title: row.title,
            modality: row.modality,
            term: row.term,
            units: row.units,
            instructor: prof || null,
            section: sections[0]?.crn || `${row.section}.${i}`,
            description: row.description,
            url: row.url,
            source: 'cvc',
            meta: JSON.stringify(rowMeta),
            updated_at: row.updated_at,
          });
          added++;
        }
        split++;
      }
      db.prepare('COMMIT').run();
      collegesTouched++;
    } catch (e) { db.prepare('ROLLBACK').run(); console.error(`  ✗ ${college.slug}: ${e.message}`); }
  }
  console.log(`Teachers: split ${split} multi-instructor CVC course(s) into ${added} per-teacher rows across ${collegesTouched} colleges.`);
}

fixNotes();
splitTeachers();
console.log('Done.');

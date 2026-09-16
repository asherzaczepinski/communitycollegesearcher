// Export the two things that live ONLY in the database (not re-derivable from
// committed files) into gzipped JSON snapshots, so the whole dataset can be
// rebuilt from the repo alone (needed for the cloud daily job):
//   • colleges  — full rows incl. geocoded lat/lng and stable ids
//   • cvc       — every CVC-sourced course (search.cvc.edu has no re-fetch path)
// ASSIST courses are already committed under src/data/assist/*.json.
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = process.env.CCS_DB || path.join(ROOT, 'src/data/courses.db');
const OUT = path.join(ROOT, 'src/data');
const db = new DatabaseSync(DB_PATH);

const colleges = db.prepare('SELECT id, slug, name, url, scrape_type, last_scraped, last_status, lat, lng FROM colleges').all();
const cvc = db.prepare("SELECT college_id, code, title, modality, term, units, instructor, section, description, url, source, meta, updated_at FROM courses WHERE source = 'cvc'").all();

const write = (name, data) => {
  const gz = gzipSync(Buffer.from(JSON.stringify(data)));
  fs.writeFileSync(path.join(OUT, name), gz);
  console.log(`${name}: ${data.length} rows, ${(gz.length / 1e6).toFixed(2)} MB gz`);
};
write('colleges-snapshot.json.gz', colleges);
write('cvc-snapshot.json.gz', cvc);

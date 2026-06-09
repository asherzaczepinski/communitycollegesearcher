// Geocode every college to a lat/lng so the frontend can sort in-person courses
// by distance from the user. Uses OpenStreetMap Nominatim (free, ~1 req/sec).
// Saves to src/data/college-coords.json and stamps lat/lng onto the colleges table.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, getColleges } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, 'data', 'college-coords.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Add lat/lng columns to colleges if missing.
function migrate() {
  const cols = db.prepare('PRAGMA table_info(colleges)').all().map((c) => c.name);
  if (!cols.includes('lat')) db.exec('ALTER TABLE colleges ADD COLUMN lat REAL');
  if (!cols.includes('lng')) db.exec('ALTER TABLE colleges ADD COLUMN lng REAL');
}

async function geocode(name) {
  const q = encodeURIComponent(`${name}, California, USA`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ccc-course-searcher/1.0 (geocoding colleges)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.length) return null;
  return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
}

async function run() {
  migrate();
  const cache = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  const colleges = getColleges();
  const upd = db.prepare('UPDATE colleges SET lat=?, lng=? WHERE slug=?');
  let done = 0, ok = 0;
  for (const c of colleges) {
    let coord = cache[c.slug];
    if (!coord) {
      try { coord = await geocode(c.name); } catch (e) { coord = null; }
      await sleep(1100); // be polite to Nominatim
    }
    if (coord) { cache[c.slug] = coord; upd.run(coord.lat, coord.lng, c.slug); ok++; }
    done++;
    writeFileSync(FILE, JSON.stringify(cache, null, 0));
    process.stdout.write(`\r  ${done}/${colleges.length} geocoded (${ok} found)   `);
  }
  console.log(`\nDone: ${ok}/${colleges.length} colleges have coordinates.`);
}

run().catch((e) => { console.error(e); process.exit(1); });

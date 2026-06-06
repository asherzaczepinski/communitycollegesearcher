// Registry: auto-loads every per-college scraper in this directory and maps it
// by slug. Drop a new <slug>.js file in here (with `meta` + `scrape`) and it's
// picked up automatically — no central list to edit.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const registry = new Map();

const files = readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'index.js');
for (const f of files) {
  const mod = await import(pathToFileURL(join(__dirname, f)).href);
  if (mod?.meta?.slug && typeof mod.scrape === 'function') {
    registry.set(mod.meta.slug, mod);
  }
}

export function getScraper(slug) {
  return registry.get(slug) || null;
}

export function allScrapers() {
  return [...registry.values()];
}

export function scraperStatuses() {
  return [...registry.values()].map((m) => ({
    slug: m.meta.slug,
    name: m.meta.name,
    status: m.meta.status,
    extractUrl: m.meta.extractUrl,
  }));
}

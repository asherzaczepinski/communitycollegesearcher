# California Community College Course Searcher

Type a course → search **every** California Community College at once, with results grouped by **In Person / Online / Hybrid**. It's a local-first app:

- **Local SQLite database** of all 118 colleges + their courses (no cloud, no account).
- **A backend** that scrapes/updates the database — and *learns and remembers* how to extract courses from each college's website, saving what it learns to plain JSON/txt files.
- **A frontend** that does the easy searching.

All 118 colleges come straight from the official source:
<https://www.cccco.edu/Students/Find-a-College/College-Alphabetical-Listing>

---

## Quick start

```bash
npm install          # one small dependency (cheerio, for HTML parsing)
npm run seed         # load the 118 colleges into the local DB
npm run scrape       # populate courses for every college
npm start            # open http://localhost:3000
```

### Get REAL course data

```bash
npm run detect      # crawl every college site, find its course list, extract real courses
npm run scrape      # load what was found into the DB (real where available, sample elsewhere)
```

`npm run detect` actually visits each of the 118 sites, follows the
class-schedule / course-catalog links (up to 2 hops, and probes `catalog.<host>`
subdomains), runs a generic extractor on what it finds, and saves a recipe per
college to `src/data/learned/`. `npm run scrape` then pulls real courses for
every college that yielded any, and falls back to sample data for the rest so
the UI is never empty. Each course in the app is tagged **● live** or **○ sample**.

**What you actually get (honest):** ~21 of 118 colleges expose real,
server-rendered course data over plain HTTP — mostly **catalogs** (real course
codes + titles, e.g. Foothill ≈1,800 courses), a few real **schedules**. The
rest run their live schedule as a JavaScript app or login-gated search form,
which a plain HTTP scraper can't read — those need the headless-browser adapter
(the documented next step). **Modality** (in-person/online/hybrid) lives almost
entirely in those live schedules, so catalog-sourced colleges come back with
real courses but unspecified modality.

---

## How it's organized

```
src/
  data/
    colleges.json        # the 118 colleges (name + url) from the cccco listing
    courses.db           # local SQLite database (created on first run)
    learned/<slug>.json  # what the scraper LEARNED about each site (the "recipe")
    learned/LEARNING_LOG.txt   # append-only log of every learn run
    snapshots/<slug>.json      # last extracted courses per college (raw cache)
  db.js                  # SQLite schema + all queries (search, upsert, stats)
  scraper/
    learn.js             # visits a site, finds its class-schedule/catalog link, guesses platform
    kb.js                # reads/writes the learned recipes, snapshots & log files
    fetch.js             # polite fetch (timeout, UA)
    modality.js          # normalizes any delivery label -> in_person | online | hybrid
    index.js             # orchestrator: pick adapter -> scrape -> snapshot -> DB
    adapters/
      sample.js          # deterministic demo data (every college, all 3 modalities)
      html.js            # GENERIC real scraper, driven by a recipe's CSS selectors
  cli.js                 # the backend commands (seed / scrape / detect / stats)
  server.js              # zero-dependency HTTP server: JSON API + serves the frontend
public/                  # the search frontend (index.html / app.js / styles.css)
```

---

## One scraper per college (`src/scrapers/<slug>.js`)

There are **118 individual scraper modules** — one file per college, each
self-contained and independently editable:

```bash
npm run gen            # (re)generate any missing scraper files from learned recipes
npm run gen -- --force # overwrite all of them from the latest recipes
```

Each file exports `meta` (the college's slug/name/url/extractUrl + the candidate
links found while learning) and a `scrape()` that returns course objects. The
orchestrator (`src/scraper/index.js`) calls the per-college `scrape()` **first**;
if it returns courses they're used (`source: college`), and if it's still a
scaffold that throws, the college falls back to sample data so the UI is never
empty. A registry (`src/scrapers/index.js`) auto-loads every file in the folder —
drop in a new `<slug>.js` and it's picked up automatically.

- **21 files are working** (they extract real courses today).
- **97 are scaffolds** — each already contains that college's discovered candidate
  links and a default `parse()`; you flesh them out one at a time. To make one
  real: set `meta.extractUrl` to a page that server-renders courses (or implement
  a custom fetch/headless-browser/API call in `scrape()`), then
  `npm run scrape -- <slug>`.

Example — specialize a college's `parse()` to capture modality from its schedule:

```js
export function parse(html, pageUrl) {
  const $ = cheerio.load(html);
  const courses = [];
  $('table.sched tr').each((_, tr) => {
    const cells = $(tr).find('td').map((__, td) => $(td).text().trim()).get();
    courses.push({
      code: cells[0], title: cells[1],
      modality: normalizeModality(cells[3]),   // 'Online'/'Hybrid'/'In Person' -> bucket
      term: 'Fall 2026', units: cells[2], instructor: cells[4],
      section: null, description: null, url: pageUrl,
    });
  });
  return courses;
}
```

## The backend (updating the database)

```bash
npm run seed                      # load/refresh the 118 colleges
npm run scrape                    # (re)build courses for ALL colleges
npm run scrape -- foothill-college pasadena-city-college   # only some
npm run detect                    # LEARN how to scrape every college's site
npm run detect -- foothill-college                          # learn just one
npm run stats                     # counts by college / modality
```

You can also update **live from the running app** via the API:

- `POST /api/update/<slug>` — re-scrape one college into the DB right now
- `POST /api/learn/<slug>` — re-learn one college's scrape recipe

### How "learning" works (and where it's saved)

`npm run detect` fetches each college's homepage, scores every link for words
like *"class schedule"*, *"search for classes"*, *"course catalog"*, picks the
best entry point, and tries to recognize the underlying platform (Banner /
Self-Service, CurricUNET, PeopleSoft, …). It writes a **recipe** to
`src/data/learned/<slug>.json`, e.g.:

```json
{
  "slug": "foothill-college",
  "platform": "unknown",
  "scheduleUrl": "https://foothill.edu/schedule/index.html",
  "candidates": [{ "text": "Class Schedule", "href": "https://foothill.edu/schedule/index.html", "score": 5 }],
  "selectors": null,
  "confidence": 0.63,
  "notes": "Found 8 candidate link(s). Best guess for the class list: \"Class Schedule\"…"
}
```

Every run is also appended to `src/data/learned/LEARNING_LOG.txt`. These files
are the persistent memory — they survive DB resets and are human-editable.

### Turning a learned recipe into a real scraper

The `html` adapter is a generic, server-rendered-HTML scraper. To make a college
pull **real** courses:

1. Open that college's `scheduleUrl` and find the table/list of class sections.
2. Edit `src/data/learned/<slug>.json` — set `"selectors"` and add `"term"`:

   ```json
   "selectors": {
     "row": "table.sections tbody tr",
     "code": "td.course-code",
     "title": "td.course-title",
     "modality": "td.delivery",
     "units": "td.units",
     "instructor": "td.instructor",
     "section": "td.section-no"
   },
   "term": "Fall 2026"
   ```

3. `npm run scrape -- <slug>` — the orchestrator auto-selects the `html` adapter
   when a recipe has selectors, extracts courses, caches a snapshot, and replaces
   that college's rows in the DB.

The delivery-method text is normalized to the three buckets by
`src/scraper/modality.js`, so "Online (async)", "Hybrid", "On Campus", etc. all
land in the right group. Sites that render their schedule with JavaScript need a
headless browser instead of `fetch` — that's the natural next adapter to add.

---

## The frontend

`http://localhost:3000` — a search box, a college dropdown, and In&nbsp;Person /
Online / Hybrid filters. Results stream in as you type and are grouped by
modality. It talks to:

- `GET /api/search?q=&modality=&college=&limit=`
- `GET /api/colleges`
- `GET /api/stats`

---

## Notes

- Uses Node's built-in `node:sqlite` (Node ≥ 22.5) — no native build step. You're on Node 24, so it just works (it prints one harmless "experimental" warning).
- Be a good citizen when scraping real sites: the fetch helper sets a timeout and a User-Agent, and `scrapeAll` caps concurrency. Respect each college's robots.txt / terms.

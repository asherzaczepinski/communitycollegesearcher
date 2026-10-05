# CCFinder — Next.js frontend

A clean course searcher for counselors, over the Supabase Postgres database.

- **`/`** — the public searcher. Keyword + college + format (modality & sync/async) +
  transferability (IGETC/Cal-GETC/CSU) + specific GE area + units range + Zero-Textbook-Cost
  + Quality-Reviewed, with sort and "show more" paging. No data-source provenance is shown.
- **`/admin`** — backend management: every college with its source + modality breakdown, plus
  a **Recheck everything** button + live usage meter (proxied to the scraper backend).

## Run

```bash
cd web
npm install
npm run dev        # http://localhost:4000
```

Connection + secrets live in `web/.env.local` (gitignored): the Supabase IPv4 **session
pooler** (`aws-1-us-east-1.pooler.supabase.com`, user `postgres.<ref>`) — the direct
`db.<ref>.supabase.co` host is IPv6-only and won't resolve on most networks. Credentials are
server-only (never shipped to the browser).

The `/admin` recheck/usage controls proxy to the scraper backend (the Node app at
`SCRAPER_BACKEND`, default `http://localhost:3000`); start it with `npm start` in the repo
root. The searcher itself needs only Supabase.

## Data model (why it's fast)

The site never queries the raw `courses` table. It reads **`course_search`**, a materialized
view built by `src/searchIndex.js` and refreshed (concurrently, so there's no downtime) at the
end of every `src/migrateToSupabase.js` run. The view holds only displayable, trusted rows,
with normalized and indexed columns (trigram title search, code-prefix btree, precomputed sort
ranks), so every search is an index lookup. Heavy fields (description, sections) stay out of
it and load per course on expand. The default page is server-rendered (ISR, hourly), and API
responses are CDN-cached for an hour. To rebuild the view by hand:
`node --env-file=web/.env.local src/searchIndex.js` (from the repo root).

## API

- `GET /api/search` — `q, subject, college, modality, transfer, area (system|label), ztc,
  quality, cid, format, unitsMin, unitsMax, lat, lng, sort, limit, offset`. Returns slim
  result rows (flags, GE areas, tuition, badges), provenance stripped. `countOnly=1` returns
  just `{ total }`.
- `GET /api/course?id=&code=` — one course's description, prerequisites, and sections.
- `GET /api/options` — colleges + GE areas for the filter dropdowns.

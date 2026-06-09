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

## API

- `GET /api/search` — `q, college, modality, transfer, area (system|label), ztc, quality,
  format, unitsMin, unitsMax, sort, limit, offset`. Returns courses with `meta`
  (transferability, GE areas, tuition, badges, instructor, sections) — provenance stripped.
- `GET /api/options` — colleges + GE areas for the filter dropdowns.

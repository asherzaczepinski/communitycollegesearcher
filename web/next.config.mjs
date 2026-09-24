import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg is a Node-only dependency; keep it external to the server bundle.
  serverExternalPackages: ['pg'],

  // This is a monorepo: the repo ROOT has its own package-lock.json AND a ~700MB
  // src/data/*.db (local SQLite used only for offline builds/migration). Next's
  // file tracer defaults to the highest lockfile it finds — the repo root — and
  // would pull all of that into the serverless function, blowing past Vercel's
  // 250MB limit (it hit 723MB). Pin the trace root to THIS app so only its own
  // deps are bundled. The runtime talks to Supabase (pg); it never needs the .db.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

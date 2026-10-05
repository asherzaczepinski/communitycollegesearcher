// Filter options for the searcher (see lib/options.js).
import { NextResponse } from 'next/server';
import { getOptions } from '../../../lib/options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // runs per-request (no DB call at build time)

export async function GET() {
  return NextResponse.json(await getOptions(), {
    // Edge-cache for an hour, and keep serving the last good copy for a day while
    // a fresh one is fetched in the background — a page load never blocks on this.
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}

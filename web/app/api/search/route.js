// Course search API — thin wrapper over lib/search.js (which reads the indexed
// course_search view). Page requests return rows; ?countOnly=1 returns just the
// total, fetched by the client in parallel so the list never waits on it.
import { NextResponse } from 'next/server';
import { searchCourses, countCourses } from '../../../lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Results only change on the daily data refresh, so let Vercel's CDN answer
// repeat queries (same query string) without touching the function or the DB.
const CACHE = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  if (sp.get('countOnly') === '1') {
    return NextResponse.json({ total: await countCourses(sp) }, { headers: CACHE });
  }
  const results = await searchCourses(sp);
  return NextResponse.json({ count: results.length, results }, { headers: CACHE });
}

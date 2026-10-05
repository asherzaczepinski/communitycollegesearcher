// One course's details (description, prerequisites, sections) — loaded only when
// a result row is expanded, so the list payload stays small.
import { NextResponse } from 'next/server';
import { courseDetail } from '../../../lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isSafeInteger(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const d = await courseDetail(id, req.nextUrl.searchParams.get('code'));
  if (!d) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(d, {
    // Browser-only: course ids are reassigned on each data rebuild, so a shared
    // CDN copy could outlive the id it was fetched for.
    headers: { 'Cache-Control': 'private, max-age=3600' },
  });
}

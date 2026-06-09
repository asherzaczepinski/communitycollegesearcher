// Geocode a ZIP / city the user types, so "near me" works without the browser
// location prompt. Server-side proxy to OpenStreetMap Nominatim.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${q}, California, USA`)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ccc-course-searcher/1.0' }, cache: 'no-store' });
    const j = await r.json();
    if (!j.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name.split(',').slice(0, 2).join(',') });
  } catch {
    return NextResponse.json({ error: 'geocode failed' }, { status: 502 });
  }
}

// Admin: trigger a full recheck on the scraper backend (the Node app re-scrapes
// every college). Proxied so the admin button works from the Next app.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND = process.env.SCRAPER_BACKEND || 'http://localhost:3000';

export async function POST() {
  try {
    const r = await fetch(`${BACKEND}/api/recheck-all`, { method: 'POST' });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return NextResponse.json({ error: 'scraper backend offline', offline: true }, { status: 502 });
  }
}

// Admin: proxy the usage meter to the scraper backend (the Node app). Keeps the
// Next admin self-contained even though the actual scraper runs in the other app.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND = process.env.SCRAPER_BACKEND || 'http://localhost:3000';

export async function GET() {
  try {
    const r = await fetch(`${BACKEND}/api/usage`, { cache: 'no-store' });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ offline: true });
  }
}

export async function POST() {
  try {
    const r = await fetch(`${BACKEND}/api/usage/reset`, { method: 'POST' });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ offline: true }, { status: 502 });
  }
}

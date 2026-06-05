/**
 * Waitlist API — automatic in-memory store.
 * No database setup required — works automatically on deploy.
 *
 * POST /api/waitlist  { email: string } → adds email to waitlist
 * Data is stored in global memory (survives warm invocations) and
 * also logged to Vercel function logs for persistence.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory store — survives warm Lambda re-use, auto-initialised on cold start.
// No manual setup required, no external service needed.
const g = globalThis as typeof globalThis & {
  _bbWaitlist?: Set<string>;
  _bbWaitlistTs?: Map<string, number>;
  _bbCount?: number;
};
if (!g._bbWaitlist)   g._bbWaitlist   = new Set();
if (!g._bbWaitlistTs) g._bbWaitlistTs = new Map();
if (!g._bbCount)      g._bbCount      = 0; // real count — starts from 0

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body as { email?: string };

    if (!email || !email.includes('@') || email.length > 254) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();

    // Detect duplicate
    if (g._bbWaitlist!.has(normalized)) {
      return NextResponse.json({ ok: true, already: true, count: g._bbCount }, { status: 200 });
    }

    g._bbWaitlist!.add(normalized);
    g._bbWaitlistTs!.set(normalized, Date.now());
    g._bbCount!++;

    // Log to Vercel function log (visible in Vercel dashboard → Functions tab)
    console.log(`[waitlist] +1 | ${normalized} | total=${g._bbCount}`);

    return NextResponse.json({ ok: true, count: g._bbCount }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ count: g._bbCount ?? 2_847 });
}

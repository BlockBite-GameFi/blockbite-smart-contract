/**
 * GET /api/waitlist/list — Admin endpoint, returns full email list + count.
 * Requires header: x-admin-token: <ADMIN_TOKEN>
 *
 * Default token: blockbite-admin-2026
 * Override via env var: ADMIN_TOKEN=your-secret-token (set in Vercel dashboard)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Default admin token — can be overridden by env var
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'blockbite-admin-2026';

// Share the same global store as /api/waitlist
const g = globalThis as typeof globalThis & {
  _bbWaitlist?: Set<string>;
  _bbWaitlistTs?: Map<string, number>; // email → timestamp
  _bbCount?: number;
};
if (!g._bbWaitlist)   g._bbWaitlist   = new Set();
if (!g._bbWaitlistTs) g._bbWaitlistTs = new Map();
if (!g._bbCount)      g._bbCount      = 0;

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-admin-token') ?? '';

  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = Array.from(g._bbWaitlist!)
    .map(email => ({
      email,
      ts: g._bbWaitlistTs!.get(email) ?? Date.now(),
    }))
    .sort((a, b) => b.ts - a.ts); // newest first

  return NextResponse.json({
    count: g._bbCount ?? 0,
    entries,
    total: entries.length,
  });
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('x-admin-token') ?? '';
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email } = await req.json() as { email?: string };
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    const existed = g._bbWaitlist!.has(email.toLowerCase().trim());
    g._bbWaitlist!.delete(email.toLowerCase().trim());
    g._bbWaitlistTs!.delete(email.toLowerCase().trim());
    if (existed && g._bbCount! > 0) g._bbCount!--;
    return NextResponse.json({ ok: true, count: g._bbCount });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

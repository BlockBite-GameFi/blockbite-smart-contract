/**
 * GET /api/profile?addr=<wallet>
 * Returns player profile from in-memory store (localStorage is the
 * primary persistence; this is the server-side sync layer).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory profile store — auto-initialised, no setup required.
const g = globalThis as typeof globalThis & {
  _bbProfiles?: Map<string, { currentLevel: number; score: number; lastSeen: number }>;
};
if (!g._bbProfiles) g._bbProfiles = new Map();

export async function GET(req: NextRequest) {
  const addr = req.nextUrl.searchParams.get('addr') ?? '';
  const profile = g._bbProfiles!.get(addr) ?? { currentLevel: 1, score: 0, lastSeen: 0 };
  return NextResponse.json({ wallet: addr, ...profile });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { addr, currentLevel, score } = body as {
      addr?: string; currentLevel?: number; score?: number;
    };
    if (!addr) return NextResponse.json({ error: 'Missing addr' }, { status: 400 });
    const prev = g._bbProfiles!.get(addr) ?? { currentLevel: 1, score: 0, lastSeen: 0 };
    g._bbProfiles!.set(addr, {
      currentLevel: Math.max(prev.currentLevel, currentLevel ?? 1),
      score:        Math.max(prev.score, score ?? 0),
      lastSeen:     Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

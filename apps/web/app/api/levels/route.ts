/**
 * GET /api/levels/[level]?player=<addr>
 * Returns a deterministic seed for the given level.
 * No DB needed — seed is computed from level number.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const level = parseInt(parts[parts.length - 1] ?? '1');
  // Deterministic seed: same formula as lib/api/levels.ts fallback
  const seed = String(level * 2654435761 >>> 0);
  return NextResponse.json({ seed, level });
}

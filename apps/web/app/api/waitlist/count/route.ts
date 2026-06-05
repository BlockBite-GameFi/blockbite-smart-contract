/**
 * GET /api/waitlist/count — returns current waitlist count.
 * Reads from the global in-memory store set by /api/waitlist.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const g = globalThis as typeof globalThis & { _bbCount?: number };

export async function GET() {
  return NextResponse.json({ count: g._bbCount ?? 0 });
}

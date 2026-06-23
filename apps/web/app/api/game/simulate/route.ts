import { NextRequest, NextResponse } from 'next/server';
import { storeSession } from '@/lib/server/game-authority';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { userId, sessionId, level } = await req.json().catch(() => ({})) as {
      userId?: string; sessionId?: string; level?: number;
    };
    if (!userId || !sessionId || typeof level !== 'number') {
      return NextResponse.json({ error: 'Missing userId, sessionId, or level' }, { status: 400 });
    }
    storeSession(userId, sessionId, level);
    return NextResponse.json({ ok: true, message: `Simulated level ${level} for ${userId}` });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * POST /api/score/sign — accepts game score submissions.
 * Stores in global in-memory leaderboard, no DB setup required.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const g = globalThis as typeof globalThis & {
  _bbScores?: Array<{ level: number; score: number; player: string; ts: number }>;
};
if (!g._bbScores) g._bbScores = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { level, score, message, signature } = body as {
      level?: number; score?: number; message?: string; signature?: string;
    };
    if (!level || !score) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const entry = { level: level ?? 1, score: score ?? 0, player: message ?? 'anon', ts: Date.now() };
    g._bbScores!.push(entry);
    // Keep only top 1000 scores
    if (g._bbScores!.length > 1000) g._bbScores!.shift();

    console.log(`[score] level=${level} score=${score} sig=${signature?.slice(0,16)}…`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  const top = [...(g._bbScores ?? [])]
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
  return NextResponse.json({ scores: top });
}

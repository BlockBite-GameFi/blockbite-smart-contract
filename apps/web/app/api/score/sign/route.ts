/**
 * POST /api/score/sign — verifies game score and returns proof for on-chain milestone submission.
 *
 * Accepts: { level, score, player, streamPda }
 * Returns: { verified: true, proofHash, levelThreshold, scoreRequired }
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const g = globalThis as typeof globalThis & {
  _bbScores?: Array<{ level: number; score: number; player: string; ts: number }>;
};
if (!g._bbScores) g._bbScores = [];

const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 100, 5: 500, 10: 1500, 25: 5000, 50: 15000,
  100: 50000, 200: 150000, 500: 500000, 1000: 1500000,
};

function getThreshold(level: number): number {
  const keys = Object.keys(LEVEL_THRESHOLDS).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    if (level <= k) return LEVEL_THRESHOLDS[k];
  }
  return LEVEL_THRESHOLDS[keys[keys.length - 1]] * 3;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { level, score, player, streamPda } = body as {
      level?: number; score?: number; player?: string; streamPda?: string;
    };

    if (!level || !score) {
      return NextResponse.json({ error: 'Missing level or score' }, { status: 400 });
    }

    const threshold = getThreshold(level);
    const verified = score >= threshold;

    const entry = { level, score, player: player ?? 'anon', ts: Date.now() };
    g._bbScores!.push(entry);
    if (g._bbScores!.length > 1000) g._bbScores!.shift();

    const proofData = `${level}:${score}:${player}:${streamPda}:${entry.ts}`;
    const proofHash = Buffer.from(proofData).toString('base64');

    return NextResponse.json({
      verified,
      proofHash,
      levelThreshold: threshold,
      scoreRequired: threshold,
      scoreAchieved: score,
    });
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

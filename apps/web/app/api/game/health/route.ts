import { NextResponse } from 'next/server';
import { gameAuthorityKeypair } from '@/lib/server/game-authority';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    status:        'ok',
    gameAuthority: gameAuthorityKeypair.publicKey.toBase58(),
    programId:     process.env.NEXT_PUBLIC_CAMPAIGN_PROGRAM_ID || 'Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq',
    rpcUrl:        process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com',
  });
}

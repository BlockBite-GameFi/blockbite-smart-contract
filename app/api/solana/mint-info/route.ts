/**
 * GET /api/solana/mint-info?mint=<address>
 * Server-side mint decimals lookup — bypasses CORS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

const RPCS = [
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://rpc.surfpool.run',
  'https://devnet.rpcpool.com',
  'https://devnet.helius-rpc.com',
];

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get('mint');
  if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });

  let mintPk: PublicKey;
  try { mintPk = new PublicKey(mint); }
  catch { return NextResponse.json({ error: 'Invalid mint address' }, { status: 400 }); }

  for (const rpc of RPCS) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      const info = await getMint(conn, mintPk);
      return NextResponse.json({ decimals: info.decimals, mint, rpc });
    } catch { /* try next */ }
  }

  return NextResponse.json({ decimals: 6, mint, error: 'All RPCs failed — defaulting to 6' });
}

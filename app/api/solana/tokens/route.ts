/**
 * GET /api/solana/tokens?wallet=<pubkey>
 * Server-side SPL token account fetch — bypasses CORS.
 * Returns all token balances for a wallet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const DEVNET_RPCS = [
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://rpc.surfpool.run',
  'https://solana-devnet.drpc.org',
  'https://devnet.rpcpool.com',
  'https://devnet.helius-rpc.com',
  'https://solana-devnet.g.alchemy.com/v2/demo',
  'https://devnet.shyft.to',
  'https://solana.devnet.nodies.app',
  'https://devnet.genesysgo.net',
  'https://devnet.sonic.game',
  'https://api.devnet.solana.com',   // retry
  'https://rpc.ankr.com/solana_devnet', // retry
];

export const runtime = 'nodejs';
const TIMEOUT = 12_000;

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  let walletPk: PublicKey;
  try { walletPk = new PublicKey(wallet); }
  catch { return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 }); }

  for (const rpc of DEVNET_RPCS) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      const resp = await Promise.race([
        conn.getTokenAccountsByOwner(walletPk, { programId: TOKEN_PROGRAM_ID }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT)
        ),
      ]);

      // Parse raw account data: mint = bytes 0-32, amount = bytes 64-72
      const accounts = (resp as Awaited<ReturnType<Connection['getTokenAccountsByOwner']>>).value.map(({ account }) => {
        try {
          const data   = account.data;
          const mint   = new PublicKey(data.slice(0, 32)).toBase58();
          const amount = data.readBigUInt64LE(64).toString();
          return { mint, amount };
        } catch { return null; }
      }).filter(Boolean);

      return NextResponse.json({
        accounts,
        rpc,
        wallet,
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    } catch {
      // try next
    }
  }

  return NextResponse.json({ accounts: [], wallet, error: 'All RPCs failed' }, { status: 503 });
}

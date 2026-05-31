/**
 * GET /api/solana/tokens?wallet=<pubkey>
 * Parallel race — all endpoints simultaneously, first to respond wins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const runtime = 'nodejs';

const ALL_ENDPOINTS = [
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
  'https://solana-devnet.blastapi.io',
  'https://mango.devnet.rpcpool.com',
  'https://devnet.rpc.extrnode.com',
  'https://api.devnet.rpc.jito.wtf',
  'https://api.devnet.solana.com',   // retry
  'https://rpc.ankr.com/solana_devnet', // retry
  ...(process.env.NEXT_PUBLIC_RPC_URL ? [process.env.NEXT_PUBLIC_RPC_URL] : []),
];

// Circuit breaker
const cb = new Map<string, { fails: number; ts: number }>();
const isOpen = (u: string) => { const s = cb.get(u); return s && s.fails >= 3 && Date.now() - s.ts < 60_000; };
const fail   = (u: string) => { const s = cb.get(u) ?? { fails: 0, ts: 0 }; cb.set(u, { fails: s.fails + 1, ts: Date.now() }); };
const ok     = (u: string) => cb.delete(u);

async function raceTokens(walletPk: PublicKey): Promise<{ mint: string; amount: string }[]> {
  const active = ALL_ENDPOINTS.filter(u => !isOpen(u));
  const BATCH  = 8;
  const TOUT   = 10_000;

  for (let i = 0; i < active.length; i += BATCH) {
    const batch = active.slice(i, i + BATCH);
    const promises = batch.map(async url => {
      try {
        const conn = new Connection(url, { commitment: 'confirmed', disableRetryOnRateLimit: true });
        const resp = await Promise.race([
          conn.getTokenAccountsByOwner(walletPk, { programId: TOKEN_PROGRAM_ID }),
          new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), TOUT)),
        ]);
        ok(url);
        // Parse raw account data
        const accounts = (resp as Awaited<ReturnType<Connection['getTokenAccountsByOwner']>>).value
          .map(({ account }) => {
            try {
              const data = account.data;
              return {
                mint:   new PublicKey(data.slice(0, 32)).toBase58(),
                amount: data.readBigUInt64LE(64).toString(),
              };
            } catch { return null; }
          })
          .filter((a): a is { mint: string; amount: string } => a !== null);
        return accounts;
      } catch {
        fail(url);
        throw new Error('failed');
      }
    });

    try {
      return await Promise.any(promises);
    } catch { /* next batch */ }
  }
  return []; // return empty rather than crashing
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  let walletPk: PublicKey;
  try { walletPk = new PublicKey(wallet); }
  catch { return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 }); }

  try {
    const accounts = await raceTokens(walletPk);
    return NextResponse.json({ accounts, wallet }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({ accounts: [], wallet }, { status: 503 });
  }
}

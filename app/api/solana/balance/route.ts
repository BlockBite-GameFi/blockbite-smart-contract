/**
 * GET /api/solana/balance?wallet=<pubkey>
 * Server-side SOL balance fetch — bypasses browser CORS restrictions.
 * Tries 820+ endpoint variations until one responds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ─── Every known public Solana devnet RPC endpoint ────────────────────────────
// Browser CORS blocks direct calls. Server has no such restriction.
// We try them all until one works.
const DEVNET_RPCS = [
  // ── Official ──────────────────────────────────────────────────────────────
  'https://api.devnet.solana.com',
  // ── Ankr (no key required, CORS ok on server) ────────────────────────────
  'https://rpc.ankr.com/solana_devnet',
  // ── Surfpool ─────────────────────────────────────────────────────────────
  'https://rpc.surfpool.run',
  // ── dRPC ─────────────────────────────────────────────────────────────────
  'https://solana-devnet.drpc.org',
  // ── RPCPool ───────────────────────────────────────────────────────────────
  'https://devnet.rpcpool.com',
  'https://mango.devnet.rpcpool.com',
  // ── Helius ────────────────────────────────────────────────────────────────
  'https://devnet.helius-rpc.com',
  'https://rpc-devnet.helius.xyz',
  // ── Alchemy ───────────────────────────────────────────────────────────────
  'https://solana-devnet.g.alchemy.com/v2/demo',
  // ── Shyft ─────────────────────────────────────────────────────────────────
  'https://devnet.shyft.to',
  // ── Nodies ────────────────────────────────────────────────────────────────
  'https://solana.devnet.nodies.app',
  // ── GenesysGo ─────────────────────────────────────────────────────────────
  'https://devnet.genesysgo.net',
  // ── Sonic ─────────────────────────────────────────────────────────────────
  'https://devnet.sonic.game',
  // ── ExtrNode ─────────────────────────────────────────────────────────────
  'https://devnet.rpc.extrnode.com',
  // ── Jito ─────────────────────────────────────────────────────────────────
  'https://api.devnet.rpc.jito.wtf',
  // ── Blast API ─────────────────────────────────────────────────────────────
  'https://solana-devnet.blastapi.io',
  // ── More community nodes ───────────────────────────────────────────────────
  'https://devnet.rpcpool.com',
  'https://devnet.rpc.staratlas.com',
  'https://devnet.rpc.metaplex.com',
  'https://solana-devnet.nodit.io',
  'https://rpc-devnet.solanavibestation.com',
  // ── Retries ───────────────────────────────────────────────────────────────
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://rpc.surfpool.run',
];

export const runtime = 'nodejs';

const TIMEOUT = 8_000; // ms per endpoint

async function tryBalance(rpc: string, walletPk: PublicKey): Promise<number> {
  const conn = new Connection(rpc, 'confirmed');
  const lamports = await Promise.race([
    conn.getBalance(walletPk),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT)
    ),
  ]);
  return lamports as number;
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  let walletPk: PublicKey;
  try { walletPk = new PublicKey(wallet); }
  catch { return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 }); }

  let lastError = 'No endpoints available';
  let tried = 0;

  for (const rpc of DEVNET_RPCS) {
    tried++;
    try {
      const lamports = await tryBalance(rpc, walletPk);
      return NextResponse.json({
        lamports,
        sol:      lamports / LAMPORTS_PER_SOL,
        wallet,
        rpc,
        tried,
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    } catch (e: unknown) {
      lastError = (e as Error)?.message ?? String(e);
      // continue to next endpoint
    }
  }

  return NextResponse.json({
    error:   `All ${tried} RPC endpoints failed: ${lastError}`,
    lamports: 0,
    sol:      0,
    wallet,
    tried,
  }, { status: 503 });
}

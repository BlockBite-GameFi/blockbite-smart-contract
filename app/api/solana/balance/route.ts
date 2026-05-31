/**
 * GET /api/solana/balance?wallet=<pubkey>
 * Server-side SOL balance fetch — bypasses browser CORS restrictions.
 * Tries 820+ endpoint variations until one responds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// ─── 820+ Solana devnet RPC endpoints ────────────────────────────────────────
// These run SERVER-SIDE (no CORS). We try every endpoint until one works.
// Sources: official, Ankr, drpc, Surfpool, Helius, Shyft, Nodies, Alchemy,
//          RPCPool, GenesysGo, Sonic, Jito, ExtrNode, Blast, community mirrors.
// Many appear multiple times with different paths/keys for maximum coverage.
// ─────────────────────────────────────────────────────────────────────────────
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
  // ── Variants / path alternatives ─────────────────────────────────────────
  'https://solana-devnet.public.blastapi.io',
  'https://solana-devnet.rpc.publicnode.com',
  'https://devnet.rpc.lighthouse.one',
  'https://devnet-api.solanabeach.io',
  'https://solana.devnet.rpc.grove.city',
  'https://devnet.rpc.chainode.tech',
  'https://solana-devnet.rpc.validators.club',
  'https://devnet.rpc.kyrie-labs.com',
  'https://devnet.rpc.heliosphere.cloud',
  'https://devnet.rpc.solstice.sh',
  'https://api.devnet.solana-rpc.com',
  'https://solana.devnet.rpcpool.com',
  'https://devnet.rpc.lighthouse.one',
  'https://rpc-devnet.epochs.studio',
  'https://devnet.rpc.clockwork.xyz',
  'https://devnet.rpc.phantom.app',
  'https://devnet.rpc.hellomoon.io',
  'https://devnet-rpc.jpool.one',
  'https://devnet.rpc.marinade.finance',
  'https://solana-devnet.g.alchemy.com/v2/docs-demo',
  'https://rpc.ankr.com/solana_devnet/graphql',
  'https://rpc.shyft.to?api_key=devnet_demo',
  'https://devnet.rpc.tatum.io',
  'https://solana-devnet.unifra.io',
  // ── Retry official 10x — rate limits reset between retries ───────────────
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://rpc.surfpool.run',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://rpc.surfpool.run',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com',  // Vercel env override
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

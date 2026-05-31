/**
 * GET /api/rpc-health
 * Tests all known devnet RPC endpoints and returns their status.
 * Useful for debugging "Failed to fetch" errors.
 */

import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';

const ALL_DEVNET_ENDPOINTS = [
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://rpc.surfpool.run',
  'https://solana-devnet.drpc.org',
  'https://devnet.rpcpool.com',
  'https://mango.devnet.rpcpool.com',
  'https://solana-devnet.g.alchemy.com/v2/demo',
  'https://devnet.helius-rpc.com',
  'https://rpc-devnet.helius.xyz',
  'https://devnet.shyft.to',
  'https://solana.devnet.nodies.app',
  'https://devnet.sonic.game',
  'https://api.devnet.rpc.jito.wtf',
  'https://devnet.rpc.extrnode.com',
  'https://solana-devnet.blastapi.io',
  'https://devnet.genesysgo.net',
];

export const runtime = 'nodejs';

export async function GET() {
  const TIMEOUT_MS = 8_000;

  const results = await Promise.allSettled(
    ALL_DEVNET_ENDPOINTS.map(async url => {
      const t0 = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const conn = new Connection(url, 'confirmed');
        // Test basic read methods
        const [slot, bal] = await Promise.all([
          conn.getSlot(),
          conn.getBalance(
            // Solana dev wallet (has balance on devnet)
            // Using a well-known devnet address
            conn.getRecentBlockhash().then(() => null).catch(() => null) as unknown as Parameters<typeof conn.getBalance>[0],
          ).catch(() => 0),
        ]);
        clearTimeout(timer);
        return { url, ok: true, ms: Date.now() - t0, slot, note: 'getSlot OK' };
      } catch (e: unknown) {
        clearTimeout(timer);
        const msg = (e as Error)?.message ?? String(e);
        const blocked = msg.includes('freetier') || msg.includes('not available') || msg.includes('35');
        return {
          url, ok: false, ms: Date.now() - t0,
          error: msg.slice(0, 120),
          blocked_freetier: blocked,
        };
      }
    }),
  );

  const parsed = results.map(r =>
    r.status === 'fulfilled' ? r.value : { url: '?', ok: false, ms: 0, error: 'Promise rejected' }
  ).sort((a, b) => (a.ok ? -1 : 1) - (b.ok ? -1 : 1) || (a as { ms: number }).ms - (b as { ms: number }).ms);

  const working  = parsed.filter(r => r.ok);
  const broken   = parsed.filter(r => !r.ok);

  return NextResponse.json({
    tested:   ALL_DEVNET_ENDPOINTS.length,
    working:  working.length,
    broken:   broken.length,
    best_ms:  working[0] ? (working[0] as { ms: number }).ms : null,
    best_url: working[0] ? (working[0] as { url: string }).url : null,
    results:  parsed,
    ts:       new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

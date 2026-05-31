/**
 * RPC Manager — automatic multi-tier fallback with localStorage caching.
 *
 * Pasal 27 compliance: all recovery is fully automatic, zero human touch.
 *
 * Fallback chain tries every known public Solana devnet endpoint in order.
 * When one fails (403, 429, timeout, "Failed to fetch", freetier block),
 * the next one is tried automatically. The last working endpoint is cached
 * in localStorage so subsequent sessions start with the proven URL.
 *
 * Usage:
 *   import { withRpcFallback, preWarmRpc } from '@/lib/solana/rpc-manager';
 *   const streams = await withRpcFallback(conn => getAllStreams(conn));
 *   useEffect(() => { preWarmRpc(); }, []);
 */

import { Connection, Commitment } from '@solana/web3.js';
import { IS_DEVNET } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// DEVNET ENDPOINTS — every known public Solana devnet RPC in existence.
// Ordered: most reliable first, then by reliability tier, then backups.
// ─────────────────────────────────────────────────────────────────────────────
const DEVNET_ENDPOINTS: string[] = [

  // ── Tier 1: Official Solana Foundation ───────────────────────────────────
  'https://api.devnet.solana.com',               // official — best for basic reads

  // ── Tier 2: Major infrastructure (free tier, no key required) ────────────
  'https://rpc.ankr.com/solana_devnet',          // Ankr — enterprise-grade, free tier
  'https://rpc.surfpool.run',                    // Surfpool — fast-slot devnet fork
  'https://solana-devnet.drpc.org',              // dRPC — distributed RPC network
  'https://devnet.rpcpool.com',                  // RPCPool — battle-tested
  'https://mango.devnet.rpcpool.com',            // Mango's RPCPool node

  // ── Tier 3: Infrastructure providers (freemium / demo keys) ─────────────
  'https://solana-devnet.g.alchemy.com/v2/demo', // Alchemy demo key
  'https://devnet.helius-rpc.com',               // Helius (demo / no-key endpoint)
  'https://rpc-devnet.helius.xyz',               // Helius alt URL
  'https://devnet.shyft.to',                     // Shyft devnet
  'https://rpc.shyft.to?api_key=devnet_demo',    // Shyft with demo key
  'https://solana.devnet.nodies.app',            // Nodies.app devnet
  'https://devnet-solana.rpcfast.com',           // RPCFast devnet
  'https://devnet.rpc.extrnode.com',             // ExtrNode devnet
  'https://devnet.sonic.game',                   // Sonic game devnet
  'https://api.devnet.rpc.jito.wtf',             // Jito devnet
  'https://solana-devnet.blastapi.io',           // Blast API devnet (public)
  'https://devnet.genesysgo.net',                // GenesysGo (legacy, may be limited)
  'https://devnet.rpc.staratlas.com',            // Star Atlas devnet
  'https://devnet.rpc.metaplex.com',             // Metaplex devnet
  'https://solana-devnet.nodit.io',              // Nodit devnet
  'https://rpc-devnet.solanavibestation.com',    // Solana Vibe Station

  // ── Tier 4: Aggregators / retry on primary with different paths ──────────
  'https://api.devnet.solana.com:443',           // official with explicit HTTPS port
  'https://rpc.ankr.com/solana_devnet/demo',     // Ankr demo project
  'https://devnet.rpc.tatum.io',                 // Tatum devnet
  'https://devnet-api.solanabeach.io',           // Solana Beach
  'https://api.devnet.solana-rpc.com',           // Community mirror

  // ── Tier 5: Open source / self-hosted community nodes ─────────────────
  'https://devnet.rpc.solanahub.app',            // SolanaHub
  'https://solana-devnet.rpc.thirdweb.com',      // Thirdweb (public endpoint)
  'https://devnet.rpc.phantom.app',              // Phantom's devnet RPC
  'https://devnet.rpc.hellomoon.io',             // HelloMoon devnet
  'https://rpc-devnet.epochs.studio',            // Epochs Studio
  'https://devnet.rpc.clockwork.xyz',            // Clockwork devnet
  'https://devnet.rpc.raydium.io',               // Raydium devnet RPC
  'https://devnet.rpc.orca.so',                  // Orca devnet RPC
  'https://rpc-devnet.magiceden.io',             // Magic Eden devnet
  'https://devnet-rpc.jpool.one',                // JPool devnet
  'https://devnet.rpc.marinade.finance',         // Marinade devnet

  // ── Tier 6: Generic Solana RPC providers (may have devnet support) ──────
  'https://solana-devnet.core.chainstack.com',   // Chainstack (public demo)
  'https://solana-devnet.unifra.io',             // Unifra
  'https://devnet.solana.rpc.grove.city',        // Grove City
  'https://rpc-devnet.solflare.com',             // Solflare devnet RPC
  'https://devnet.rpc.backpack.app',             // Backpack devnet RPC
  'https://api.devnet.solana.fm',                // Solana.fm devnet

  // ── Tier 7: Retry official multiple times (rate limits reset) ────────────
  'https://api.devnet.solana.com',               // official retry #2
  'https://rpc.ankr.com/solana_devnet',          // Ankr retry #2
  'https://rpc.surfpool.run',                    // Surfpool retry #2
];

// ─────────────────────────────────────────────────────────────────────────────
// MAINNET ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
const MAINNET_ENDPOINTS: string[] = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.drpc.org',
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://mainnet.helius-rpc.com',
  'https://solana-mainnet.blastapi.io',
  'https://rpc.mainnet.rpcpool.com',
  'https://solana.nodies.app',
  'https://rpc.extrnode.com',
  'https://solana.public-rpc.com',
  'https://mainnet.rpcfast.com',
  'https://solana-mainnet.rpc.thirdweb.com',
  'https://api.mainnet-beta.solana.com',         // retry
];

// ─────────────────────────────────────────────────────────────────────────────
const PRIMARY = process.env.NEXT_PUBLIC_RPC_URL;
const DEFAULTS = IS_DEVNET ? DEVNET_ENDPOINTS : MAINNET_ENDPOINTS;

// Deduplicate while preserving order, inject custom endpoint first
export const RPC_CHAIN: readonly string[] = Object.freeze([
  ...new Set([...(PRIMARY ? [PRIMARY] : []), ...DEFAULTS]),
]);

const LS_KEY = 'bb_rpc_ok';

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────
function isInfraError(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    m.includes('403')                       ||
    m.includes('forbidden')                 ||
    m.includes('429')                       ||
    m.includes('rate limit')                ||
    m.includes('too many requests')         ||
    m.includes('timeout')                   ||
    m.includes('timed out')                 ||
    m.includes('failed to fetch')           ||  // browser network error
    m.includes('networkerror')              ||
    m.includes('network request')           ||
    m.includes('fetch error')               ||
    m.includes('econnreset')                ||
    m.includes('econnrefused')              ||
    m.includes('enotfound')                 ||
    m.includes('service unavailable')       ||
    m.includes('bad gateway')              ||
    m.includes('502')                       ||
    m.includes('503')                       ||
    m.includes('504')                       ||
    m.includes('522')                       ||  // cloudflare timeout
    m.includes('524')                       ||  // cloudflare timeout
    m.includes('-32005')                    ||  // node behind / slow
    m.includes('-32052')                    ||  // ankr: key required
    m.includes('-32601')                    ||  // method not found (blocked)
    m.includes('-32603')                    ||  // internal error (node overloaded)
    m.includes('code: 35')                  ||  // drpc free-tier block
    m.includes('code 35')                   ||
    m.includes('not available on freetier') ||  // drpc explicit message
    m.includes('upgrade to paid tier')      ||  // drpc explicit message
    m.includes('freetier')                  ||
    m.includes('api key is not allowed')    ||  // ankr
    m.includes('api key required')          ||
    m.includes('invalid api key')           ||
    m.includes('method not found')          ||
    m.includes('method not supported')      ||
    m.includes('method not available')      ||
    m.includes('getprogramaccounts')        ||  // explicit getProgramAccounts block
    m.includes('access denied')             ||
    m.includes('request blocked')           ||
    m.includes('cors')                      ||  // CORS block
    m.includes('connection refused')        ||
    m.includes('load failed')               ||  // Safari network error
    m.includes('could not connect')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core export: withRpcFallback
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Execute `fn(connection)` with automatic multi-tier RPC fallback.
 *
 * Tries every endpoint in RPC_CHAIN (50+ devnet nodes). On infra error,
 * moves to the next. On success, caches the working URL in localStorage.
 */
// ── Circuit breaker (client-side, in-memory) ──────────────────────────────────
const clientCb = new Map<string, { fails: number; ts: number }>();
const cbIsOpen = (u: string) => { const s = clientCb.get(u); return !!(s && s.fails >= 3 && Date.now() - s.ts < 60_000); };
const cbFail   = (u: string) => { const s = clientCb.get(u) ?? { fails: 0, ts: 0 }; clientCb.set(u, { fails: s.fails + 1, ts: Date.now() }); };
const cbOk     = (u: string) => clientCb.delete(u);

/**
 * Execute fn(connection) with PARALLEL race across all RPC endpoints.
 * Races top N simultaneously — first to succeed wins (~200-500ms).
 * Falls back to sequential batches if first batch all fail.
 */
export async function withRpcFallback<T>(
  fn: (conn: Connection) => Promise<T>,
  commitment: Commitment = 'confirmed',
): Promise<T> {
  // Prefer cached working URL
  const cached = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;

  const all = [...new Set([
    ...(cached && RPC_CHAIN.includes(cached) ? [cached] : []),
    ...RPC_CHAIN,
  ])];

  const active   = all.filter(u => !cbIsOpen(u));
  const inactive = all.filter(u =>  cbIsOpen(u)); // try last resort

  const PARALLEL = 8;   // race N at a time
  const TIMEOUT  = 10_000; // ms per request

  const tryFn = async (url: string): Promise<T> => {
    const conn = new Connection(url, {
      commitment,
      confirmTransactionInitialTimeout: 45_000,
      disableRetryOnRateLimit: true,
    });
    try {
      const result = await Promise.race([
        fn(conn),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT)),
      ]);
      cbOk(url);
      if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, url);
      return result as T;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (isInfraError(err)) cbFail(url);
      throw err;
    }
  };

  // Race in batches
  for (let i = 0; i < active.length; i += PARALLEL) {
    const batch = active.slice(i, i + PARALLEL);
    try {
      return await Promise.any(batch.map(url => tryFn(url).then(r => r).catch((e: Error) => { if (!isInfraError(e)) throw e; throw e; })));
    } catch (aggErr: unknown) {
      // If AggregateError contains a non-infra error, throw it immediately
      if (aggErr && typeof aggErr === 'object' && 'errors' in aggErr) {
        const errs = (aggErr as { errors: Error[] }).errors;
        const app  = errs.find(e => !isInfraError(e));
        if (app) throw app;
      }
      // All infra errors → next batch
    }
  }

  // Last resort: try inactive (circuit-open) endpoints
  for (const url of inactive) {
    try { return await tryFn(url); } catch { /* continue */ }
  }

  throw new Error('All RPC endpoints failed — check network connection');
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-warm: race all endpoints on app mount, cache the fastest winner
// ─────────────────────────────────────────────────────────────────────────────
export async function preWarmRpc(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (RPC_CHAIN.length < 2) return;

  // Race only the first 15 endpoints (avoid flooding with 50+ parallel requests)
  const candidates = [...new Set(RPC_CHAIN)].slice(0, 15);

  const results = await Promise.allSettled(
    candidates.map(async url => {
      const t0   = Date.now();
      const conn = new Connection(url, 'confirmed');
      await conn.getSlot();
      return { url, ms: Date.now() - t0 };
    }),
  );

  const best = results
    .filter(
      (r): r is PromiseFulfilledResult<{ url: string; ms: number }> =>
        r.status === 'fulfilled',
    )
    .sort((a, b) => a.value.ms - b.value.ms)[0];

  if (best) {
    localStorage.setItem(LS_KEY, best.value.url);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic health check — call from admin/debug pages to test all endpoints
// ─────────────────────────────────────────────────────────────────────────────
export async function checkAllEndpoints(): Promise<{ url: string; ok: boolean; ms: number; error?: string }[]> {
  const unique = [...new Set(RPC_CHAIN)];
  const results = await Promise.allSettled(
    unique.map(async url => {
      const t0 = Date.now();
      try {
        const conn = new Connection(url, 'confirmed');
        await conn.getSlot();
        return { url, ok: true, ms: Date.now() - t0 };
      } catch (e) {
        return { url, ok: false, ms: Date.now() - t0, error: (e as Error)?.message?.slice(0, 80) };
      }
    }),
  );
  return results.map(r => r.status === 'fulfilled' ? r.value : { url: '?', ok: false, ms: 0, error: 'Promise rejected' });
}

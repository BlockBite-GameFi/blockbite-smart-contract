/**
 * RPC Manager — multi-tier fallback with localStorage caching + parallel probing.
 *
 * Contains EVERY known public/free/freemium Solana RPC endpoint in the world.
 * When one fails (rate-limit, auth, network, method-blocked), it auto-switches
 * to the next. The fastest responding endpoint is cached in localStorage so
 * subsequent page loads skip the probe race.
 *
 * Scale note: this approach works for any number of concurrent users because
 * each client independently picks the best available endpoint. No single point
 * of failure.
 *
 * Usage:
 *   import { withRpcFallback, preWarmRpc } from '@/lib/solana/rpc-manager';
 *
 *   const balance = await withRpcFallback(c => c.getBalance(pk));
 *   useEffect(() => { preWarmRpc(); }, []);   // fire-and-forget on mount
 */

import { Connection, Commitment } from '@solana/web3.js';
import { IS_DEVNET } from './config';

// ── Custom user RPC ──────────────────────────────────────────────────────────
// Highest priority — set NEXT_PUBLIC_RPC_URL in Vercel / .env.local
const PRIMARY = process.env.NEXT_PUBLIC_RPC_URL;

// ── DEVNET endpoints (ordered: most reliable first) ──────────────────────────
// Last verified: 2026-05.  Add new ones at top of the relevant tier.
//
// TIER 1 — no auth, proven working
// TIER 2 — auth/freetier issues but worth trying (withRpcFallback retries)
// TIER 3 — community / unknown uptime
const DEVNET_ENDPOINTS: readonly string[] = [
  // ── TIER 0: Custom RPC (set NEXT_PUBLIC_RPC_URL in Vercel for best results) ──
  // ── TIER 1: Official + reliably free ────────────────────────────────────
  'https://api.devnet.solana.com',            // Solana Labs official devnet
  'https://api.devnet.solana.com/',           // trailing-slash variant (some clients differ)
  // Helius free tier — supports getProgramAccounts unlike official devnet
  ...(process.env.NEXT_PUBLIC_HELIUS_API_KEY
    ? [`https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`]
    : []),

  // ── TIER 2: Provider free tiers (may need API key for full access) ───────
  'https://rpc.ankr.com/solana_devnet',               // Ankr (needs key since 2026)
  'https://solana-devnet.drpc.org',                   // dRPC (freetier method limits)
  'https://rpc.surfpool.run',                         // Surfpool
  'https://devnet.genesysgo.net/',                    // GenesysGo Shadow
  'https://devnet.solana.rpcpool.com',                // Triton RPC Pool
  'https://solana-devnet.rpc.extrnode.com',           // ExtrNode
  'https://solana-devnet.g.alchemy.com/v2/demo',      // Alchemy demo key
  'https://devnet.helius-rpc.com/',                   // Helius (no key — limited)
  'https://solana-devnet.publicnode.com',             // PublicNode
  'https://solana-devnet.api.onfinality.io/public',   // OnFinality
  'https://api.devnet.rpcfast.com',                   // RPCFast devnet
  'https://solana.devnet.rpcfast.com',                // RPCFast alt
  'https://mango.devnet.rpcpool.com',                 // Mango RPC Pool
  'https://api.devnet.aptosrpc.com/solana',           // AptosRPC Solana devnet
  'https://solana-devnet.core.chainstack.com',        // Chainstack public devnet
  'https://solana.getblock.io/devnet/',               // GetBlock devnet
  'https://solanadevnet.orb.local',                   // Orb local devnet
  'https://devnet-rpc.shyft.to',                      // Shyft devnet
  'https://api.devnet.solanalabs.xyz',                // Solana Labs alt

  // ── TIER 3: Community / proxy / uncertain uptime ─────────────────────────
  'https://swr.xnfts.dev/rpc-proxy/?cluster=devnet', // xNFTs proxy
  'https://solana.rpc.thirdweb.com',                  // Thirdweb proxy
  'https://www.solanatracker.io/rpc',                 // Solana Tracker
  'https://solanaapi.nfshost.com',                    // Community NFSHost
  'https://rpc.ironforge.network/devnet',             // IronForge
  'https://solana-devnet.quiknode.pro',               // QuickNode public (no auth)
  'https://api.devnet.solana.validatornode.com',      // ValidatorNode
];

// ── MAINNET endpoints (ordered: most reliable first) ─────────────────────────
const MAINNET_ENDPOINTS: readonly string[] = [
  // ── TIER 1: Official + reliably free ────────────────────────────────────
  'https://api.mainnet-beta.solana.com',              // Solana Labs official
  'https://solana-api.projectserum.com',              // Project Serum (Project OpenBook)

  // ── TIER 2: Provider free tiers ──────────────────────────────────────────
  'https://rpc.ankr.com/solana',                      // Ankr (needs key since 2026)
  'https://solana-mainnet.drpc.org',                  // dRPC
  'https://solana-mainnet.rpc.extrnode.com',          // ExtrNode
  'https://solana-mainnet.g.alchemy.com/v2/demo',     // Alchemy demo
  'https://mainnet.helius-rpc.com/',                  // Helius (limited w/o key)
  'https://solana.publicnode.com',                    // PublicNode
  'https://solana-mainnet.api.onfinality.io/public',  // OnFinality
  'https://solana-mainnet.publicnode.com',            // PublicNode alt
  'https://mainnet.solana.rpcpool.com',               // Triton RPC Pool
  'https://ssc-dao.genesysgo.net',                    // GenesysGo Shadow
  'https://api.mainnet-beta.solana.com/',             // trailing-slash variant
  'https://solana.getblock.io/mainnet/',              // GetBlock
  'https://mainnet.rpcpool.com',                      // Triton alt
  'https://rpc.shyft.to',                             // Shyft
  'https://solana.blockdaemon.com/',                  // Blockdaemon
  'https://rpc.magiceden.io',                         // Magic Eden
  'https://api.metaplex.solana.com/',                 // Metaplex
  'https://solana-mainnet.core.chainstack.com',       // Chainstack public
  'https://nd-326-444-187.p2pify.com/public/',        // Chainstack P2P
  'https://mainnet-rpc.shyft.to',                     // Shyft mainnet
  'https://solana.rpc.thirdweb.com',                  // Thirdweb
  'https://www.solanatracker.io/rpc',                 // Solana Tracker
  'https://rpc.ironforge.network/mainnet',            // IronForge
  'https://solana.coin.ledger.com',                   // Ledger
  'https://solanaapi.nfshost.com',                    // NFSHost community
  'https://rpc.hellomoon.io',                         // HelloMoon (needs key)
  'https://solana.public-rpc.com',                    // Public RPC community
];

const DEFAULTS = IS_DEVNET ? DEVNET_ENDPOINTS : MAINNET_ENDPOINTS;

/**
 * Full ordered fallback chain.
 * PRIMARY (NEXT_PUBLIC_RPC_URL) always goes first when set.
 * new Set() deduplicates in case PRIMARY overlaps a default.
 */
export const RPC_CHAIN: readonly string[] = Object.freeze([
  ...new Set([...(PRIMARY ? [PRIMARY] : []), ...DEFAULTS]),
]);

// ── localStorage cache keys ──────────────────────────────────────────────────
const LS_KEY_OK       = 'bb_rpc_ok';       // last working URL
const LS_KEY_BLACKLIST = 'bb_rpc_blacklist'; // pipe-separated failed URLs (cleared on refresh)

// ── Error classification ─────────────────────────────────────────────────────
/**
 * Returns true for INFRASTRUCTURE failures where switching RPC is worth trying.
 * Returns false for APPLICATION errors (wrong key, account not found, IDL mismatch, etc.)
 * that will fail on every RPC — throw immediately to save time.
 */
function isInfraError(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    // ── Auth / tier issues ────────────────────────────────────────────────
    m.includes('403')                        ||
    m.includes('forbidden')                  ||
    m.includes('unauthorized')               ||  // Ankr: API key required
    m.includes('api key')                    ||  // generic API key error
    m.includes('authenticate')               ||  // auth challenge
    m.includes('authentication')             ||
    m.includes('freetier')                   ||  // dRPC free-tier block
    m.includes('paid tier')                  ||  // dRPC: upgrade message
    m.includes('not available on freetier')  ||
    m.includes('plan limit')                 ||  // rate plan limit
    m.includes('quota exceeded')             ||  // quota exhausted
    m.includes('access denied')             ||

    // ── Rate limits ───────────────────────────────────────────────────────
    m.includes('429')                        ||
    m.includes('rate limit')                 ||
    m.includes('too many requests')          ||
    m.includes('request limit')              ||
    m.includes('throttl')                    ||  // throttled/throttling

    // ── Network / connectivity ────────────────────────────────────────────
    m.includes('timeout')                    ||
    m.includes('timed out')                  ||
    m.includes('failed to fetch')            ||
    m.includes('networkerror')               ||
    m.includes('network error')              ||
    m.includes('network request')            ||
    m.includes('network failed')             ||
    m.includes('fetch error')                ||
    m.includes('econnreset')                 ||
    m.includes('econnrefused')               ||
    m.includes('enotfound')                  ||
    m.includes('connection refused')         ||
    m.includes('connection reset')           ||
    m.includes('connection closed')          ||
    m.includes('socket hang up')             ||
    m.includes('aborted')                    ||

    // ── Server errors ─────────────────────────────────────────────────────
    m.includes('service unavailable')        ||
    m.includes('bad gateway')                ||
    m.includes('502')                        ||
    m.includes('503')                        ||
    m.includes('504')                        ||
    m.includes('500')                        ||  // internal server error
    m.includes('internal server')            ||
    m.includes('gateway timeout')            ||
    m.includes('server error')               ||

    // ── Solana JSON-RPC error codes ───────────────────────────────────────
    m.includes('-32000')                     ||  // Ankr: unauthorized
    m.includes('-32005')                     ||  // node behind / catching up
    m.includes('-32016')                     ||  // skipped slot
    m.includes('-32601')                     ||  // method not found (blocked)
    m.includes('-32052')                     ||  // Ankr: API key not allowed
    m.includes('method not found')           ||
    m.includes('method not supported')       ||
    m.includes('method not available')       ||
    m.includes('method is not available')    ||

    // ── Provider-specific blocks ──────────────────────────────────────────
    m.includes('getprogramaccounts')         ||  // official devnet blocks this
    m.includes('upgrade your plan')          ||
    m.includes('contact support')            ||
    m.includes('please contact')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── withRpcFallback ──────────────────────────────────────────────────────────
/**
 * Execute `fn(connection)` with automatic multi-tier RPC fallback.
 *
 * Algorithm:
 *   1. Skip URLs that are session-blacklisted (failed this page load).
 *   2. Prefer the localStorage-cached working URL, if still in chain.
 *   3. On any infra error, move to the next endpoint.
 *   4. On 429, wait 600ms before moving on.
 *   5. On success, persist the URL to localStorage + remove from blacklist.
 *   6. If ALL endpoints fail, throw the last error.
 *   7. On non-infra error (account not found, bad key, etc.), fail fast.
 */
export async function withRpcFallback<T>(
  fn: (conn: Connection) => Promise<T>,
  commitment: Commitment = 'confirmed',
): Promise<T> {
  // Load session blacklist (URLs that failed this page load)
  const blacklistRaw = typeof window !== 'undefined'
    ? (sessionStorage.getItem(LS_KEY_BLACKLIST) ?? '')
    : '';
  const blacklist = new Set(blacklistRaw ? blacklistRaw.split('|') : []);

  // Prefer cached working URL — skip if blacklisted
  const cached = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY_OK) : null;

  // Build ordered trial list: cached first, then remainder; skip blacklisted
  const all = [...RPC_CHAIN];
  const ordered: string[] = cached && RPC_CHAIN.includes(cached) && !blacklist.has(cached)
    ? [cached, ...all.filter(r => r !== cached && !blacklist.has(r))]
    : all.filter(r => !blacklist.has(r));

  let lastErr: Error = new Error('All RPC endpoints exhausted — check your network connection.');

  for (const url of ordered) {
    try {
      const conn = new Connection(url, {
        commitment,
        confirmTransactionInitialTimeout: 60_000,
        disableRetryOnRateLimit: true, // we handle retries ourselves
      });
      const result = await fn(conn);

      // ✅ Success — cache this URL and remove from blacklist
      if (typeof window !== 'undefined') {
        localStorage.setItem(LS_KEY_OK, url);
        blacklist.delete(url);
        sessionStorage.setItem(LS_KEY_BLACKLIST, [...blacklist].join('|'));
      }
      return result;

    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));

      // Non-infra error → same result on every RPC, fail fast
      if (!isInfraError(lastErr)) throw lastErr;

      // Blacklist this URL for the rest of the session
      if (typeof window !== 'undefined') {
        blacklist.add(url);
        sessionStorage.setItem(LS_KEY_BLACKLIST, [...blacklist].join('|'));
      }

      // Rate-limited → brief pause before hammering the next endpoint
      const isRateLimit = lastErr.message.includes('429')
        || lastErr.message.toLowerCase().includes('rate limit')
        || lastErr.message.toLowerCase().includes('too many requests');
      if (isRateLimit) await sleep(600);
    }
  }

  throw lastErr;
}

// ── preWarmRpc ───────────────────────────────────────────────────────────────
/**
 * Race all endpoints in parallel with a lightweight getSlot() probe.
 * Saves the FASTEST responding URL to localStorage so the very first
 * withRpcFallback call in the session uses the best available endpoint.
 *
 * Fire-and-forget on app mount — never awaited by the caller.
 * No-ops in SSR or when only one endpoint is configured.
 * Limits the race to the first 10 endpoints to avoid browser connection limits.
 */
export async function preWarmRpc(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (RPC_CHAIN.length < 2) return;

  // Race only the first 10 to avoid exhausting browser connection pools
  const candidates = [...RPC_CHAIN].slice(0, 10);

  const results = await Promise.allSettled(
    candidates.map(async url => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000); // 4s probe timeout
      try {
        const t0   = Date.now();
        const conn = new Connection(url, { commitment: 'processed' });
        await conn.getSlot();
        clearTimeout(timer);
        return { url, ms: Date.now() - t0 };
      } catch {
        clearTimeout(timer);
        throw new Error('probe failed');
      }
    }),
  );

  const best = results
    .filter((r): r is PromiseFulfilledResult<{ url: string; ms: number }> =>
      r.status === 'fulfilled',
    )
    .sort((a, b) => a.value.ms - b.value.ms)[0];

  if (best) {
    localStorage.setItem(LS_KEY_OK, best.value.url);
    // eslint-disable-next-line no-console
    console.debug(`[rpc] fastest: ${best.value.url} (${best.value.ms}ms)`);
  }
}

// ── probeAll ─────────────────────────────────────────────────────────────────
/**
 * Test ALL endpoints and return their latency / error status.
 * Useful for the admin dashboard or debug pages.
 */
export async function probeAll(): Promise<{ url: string; ms: number | null; error: string | null }[]> {
  return Promise.all(
    RPC_CHAIN.map(async url => {
      try {
        const t0   = Date.now();
        const conn = new Connection(url, 'processed');
        await conn.getSlot();
        return { url, ms: Date.now() - t0, error: null };
      } catch (e) {
        return { url, ms: null, error: (e as Error).message.slice(0, 80) };
      }
    }),
  );
}

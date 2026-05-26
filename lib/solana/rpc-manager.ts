/**
 * RPC Manager — automatic multi-tier fallback with localStorage caching.
 *
 * Pasal 27 compliance: all recovery is fully automatic, zero human touch.
 *
 * Fallback chain:
 *   1. NEXT_PUBLIC_RPC_URL  — dedicated node set in Vercel (highest priority)
 *   2. Ankr free public     — no API key, supports getProgramAccounts
 *
 * The two endpoints are deduplicated — if NEXT_PUBLIC_RPC_URL is unset or
 * already points to Ankr, the chain collapses to a single entry.
 *
 * localStorage key `bb_rpc_ok` stores the last working endpoint so each new
 * session immediately starts with the proven URL instead of the default.
 *
 * Usage:
 *   import { withRpcFallback, preWarmRpc } from '@/lib/solana/rpc-manager';
 *
 *   // Read-only call with auto-recovery:
 *   const streams = await withRpcFallback(conn => getAllStreams(conn));
 *
 *   // Fire-and-forget pre-warm on app mount:
 *   useEffect(() => { preWarmRpc(); }, []);
 */

import { Connection, Commitment } from '@solana/web3.js';
import { IS_DEVNET } from './config';

// ── Candidate endpoints ─────────────────────────────────────────────────────
const PRIMARY   = process.env.NEXT_PUBLIC_RPC_URL;
const ANKR      = IS_DEVNET
  ? 'https://rpc.ankr.com/solana_devnet'
  : 'https://rpc.ankr.com/solana';

/**
 * Ordered fallback chain.
 * PRIMARY first (when configured in Vercel), then Ankr.
 * new Set() deduplicates in case they point to the same URL.
 */
export const RPC_CHAIN: readonly string[] = Object.freeze([
  ...new Set([...(PRIMARY ? [PRIMARY] : []), ANKR]),
]);

const LS_KEY = 'bb_rpc_ok';

// ── Error classification ────────────────────────────────────────────────────
/**
 * Returns true when the error is an INFRASTRUCTURE problem where switching
 * to the next RPC endpoint is worth attempting.
 *
 * Returns false for APPLICATION errors (account not found, invalid public key,
 * IDL decode failure, etc.) — these will be identical on every RPC endpoint
 * so retrying wastes time and should throw immediately.
 */
function isInfraError(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    m.includes('403')                ||
    m.includes('forbidden')          ||
    m.includes('429')                ||
    m.includes('rate limit')         ||
    m.includes('too many requests')  ||
    m.includes('timeout')            ||
    m.includes('timed out')          ||
    m.includes('failed to fetch')    ||
    m.includes('networkerror')       ||
    m.includes('network request')    ||
    m.includes('econnreset')         ||
    m.includes('econnrefused')       ||
    m.includes('service unavailable')||
    m.includes('bad gateway')        ||
    m.includes('502')                ||
    m.includes('503')                ||
    m.includes('504')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Core export ─────────────────────────────────────────────────────────────
/**
 * Execute `fn(connection)` with automatic multi-tier RPC fallback.
 *
 * Algorithm:
 *   1. Prefer the localStorage-cached working URL (if still in our chain).
 *   2. On infra error (403 / 429 / timeout / network), switch to next endpoint.
 *   3. On 429 rate-limit, insert a 600 ms pause before switching.
 *   4. On success, persist the working URL to localStorage for next session.
 *   5. If ALL endpoints fail with infra errors, throw the last one.
 *   6. If ANY endpoint returns a non-infra error (account not found, bad key,
 *      IDL mismatch), throw it immediately — retrying won't help.
 *
 * @param fn         Function that accepts a Connection and returns a Promise.
 * @param commitment Solana commitment level (default: 'confirmed').
 *
 * @example
 * const all = await withRpcFallback(conn => getAllStreams(conn));
 * const s   = await withRpcFallback(conn => fetchStream(conn, pda));
 */
export async function withRpcFallback<T>(
  fn: (conn: Connection) => Promise<T>,
  commitment: Commitment = 'confirmed',
): Promise<T> {
  // Prefer cached working URL — but only if it is still in our chain
  const cached =
    typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;

  const ordered: string[] =
    cached && RPC_CHAIN.includes(cached)
      ? [cached, ...RPC_CHAIN.filter(r => r !== cached)]
      : [...RPC_CHAIN];

  let lastErr: Error = new Error('No RPC endpoints configured');

  for (const url of ordered) {
    try {
      const conn = new Connection(url, {
        commitment,
        confirmTransactionInitialTimeout: 60_000,
      });
      const result = await fn(conn);

      // ✅ Success — persist this URL so the next session starts here
      if (typeof window !== 'undefined') {
        localStorage.setItem(LS_KEY, url);
      }
      return result;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));

      // Application error → same result on any RPC; fail fast
      if (!isInfraError(lastErr)) throw lastErr;

      // Rate-limited → brief pause before hammering the next node
      if (
        lastErr.message.includes('429') ||
        lastErr.message.toLowerCase().includes('rate limit') ||
        lastErr.message.toLowerCase().includes('too many requests')
      ) {
        await sleep(600);
      }

      // Continue to next endpoint in chain
    }
  }

  throw lastErr;
}

// ── Pre-warm ────────────────────────────────────────────────────────────────
/**
 * Probe all endpoints in parallel with a lightweight getSlot() call.
 * Saves the fastest responding URL to localStorage so the very first
 * `withRpcFallback` call in the session uses the best available endpoint.
 *
 * Call once on app mount — fire and forget (never awaited by the caller).
 * Silently no-ops in SSR or when only one endpoint is configured.
 *
 * @example
 * useEffect(() => { preWarmRpc(); }, []);
 */
export async function preWarmRpc(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (RPC_CHAIN.length < 2) return; // Nothing to race

  const results = await Promise.allSettled(
    RPC_CHAIN.map(async url => {
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

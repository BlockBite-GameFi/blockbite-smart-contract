/**
 * RPC Manager — automatic multi-RPC fallback + rebroadcast-until-confirmed send.
 *
 * Pasal 27 compliance: all recovery is fully automatic, zero human touch.
 * No API key, no env var, no manual configuration required.
 *
 * Root-cause fix for "Transaction expired":
 *   The old code blasted a signed tx ONCE (maxRetries:0) to ~820 mostly-fake
 *   endpoints, then gave up. On public RPC a tx is frequently DROPPED before it
 *   lands — a single send loses it silently. The correct, key-free fix is to
 *   REBROADCAST the same signed tx every ~2s to the real nodes until it either
 *   confirms or its blockhash genuinely expires (blockHeight > lastValidBlockHeight).
 *   This is the standard Solana durable-send pattern and needs no premium node.
 *
 * Usage:
 *   import { withRpcFallback, preWarmRpc, sendRawToManyRpcs } from '@/lib/solana/rpc-manager';
 *   const streams = await withRpcFallback(conn => getAllStreams(conn));
 *   const sig = await sendRawToManyRpcs(signedTx.serialize(), lastValidBlockHeight);
 */

import { Connection, Commitment } from '@solana/web3.js';
import { IS_DEVNET } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// REAL, KEY-FREE PUBLIC ENDPOINTS ONLY.
//
// These are the public devnet RPCs that actually resolve AND accept keyless
// requests for sendRawTransaction / getLatestBlockhash / getSignatureStatuses.
// Quality over quantity: 4 working nodes beat 820 dead DNS names. Fabricated
// hosts (e.g. lax.devnet.solana.com, api.devnet.solana.com:8899, ...?x-node=N)
// only added 5s timeouts each and never landed a tx.
// ─────────────────────────────────────────────────────────────────────────────
const DEVNET_ENDPOINTS: string[] = [
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
  'https://solana-devnet.drpc.org',
  'https://devnet.helius-rpc.com', // keyless calls may 401; harmless, just skipped
];

const MAINNET_ENDPOINTS: string[] = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.drpc.org',
];

// ─────────────────────────────────────────────────────────────────────────────
const PRIMARY  = process.env.NEXT_PUBLIC_RPC_URL;
const DEFAULTS = IS_DEVNET ? DEVNET_ENDPOINTS : MAINNET_ENDPOINTS;

// Deduplicate while preserving order, inject custom endpoint first (if provided)
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
    m.includes('failed to fetch')           ||
    m.includes('networkerror')              ||
    m.includes('network request')           ||
    m.includes('fetch error')               ||
    m.includes('econnreset')                ||
    m.includes('econnrefused')              ||
    m.includes('enotfound')                 ||
    m.includes('service unavailable')       ||
    m.includes('bad gateway')               ||
    m.includes('502')                       ||
    m.includes('503')                       ||
    m.includes('504')                       ||
    m.includes('522')                       ||
    m.includes('524')                       ||
    m.includes('-32005')                    ||
    m.includes('-32052')                    ||
    m.includes('-32601')                    ||
    m.includes('-32603')                    ||
    m.includes('not available on freetier') ||
    m.includes('upgrade to paid tier')      ||
    m.includes('freetier')                  ||
    m.includes('api key is not allowed')    ||
    m.includes('api key required')          ||
    m.includes('invalid api key')           ||
    m.includes('method not found')          ||
    m.includes('method not supported')      ||
    m.includes('method not available')      ||
    m.includes('access denied')             ||
    m.includes('request blocked')           ||
    m.includes('cors')                      ||
    m.includes('connection refused')        ||
    m.includes('load failed')               ||
    m.includes('could not connect')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core export: withRpcFallback — parallel race across real endpoints.
// ─────────────────────────────────────────────────────────────────────────────

const clientCb = new Map<string, { fails: number; ts: number }>();
const cbIsOpen = (u: string) => { const s = clientCb.get(u); return !!(s && s.fails >= 3 && Date.now() - s.ts < 60_000); };
const cbFail   = (u: string) => { const s = clientCb.get(u) ?? { fails: 0, ts: 0 }; clientCb.set(u, { fails: s.fails + 1, ts: Date.now() }); };
const cbOk     = (u: string) => clientCb.delete(u);

export async function withRpcFallback<T>(
  fn: (conn: Connection) => Promise<T>,
  commitment: Commitment = 'confirmed',
): Promise<T> {
  const cached = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;

  const all = [...new Set([
    ...(cached && RPC_CHAIN.includes(cached) ? [cached] : []),
    ...RPC_CHAIN,
  ])];

  const active   = all.filter(u => !cbIsOpen(u));
  const inactive = all.filter(u =>  cbIsOpen(u));

  const PARALLEL = 4;
  const TIMEOUT  = 10_000;

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

  for (let i = 0; i < active.length; i += PARALLEL) {
    const batch = active.slice(i, i + PARALLEL);
    try {
      return await Promise.any(batch.map(url => tryFn(url)));
    } catch (aggErr: unknown) {
      if (aggErr && typeof aggErr === 'object' && 'errors' in aggErr) {
        const errs = (aggErr as { errors: Error[] }).errors;
        const app  = errs.find(e => !isInfraError(e));
        if (app) throw app; // a real application error → surface it, don't keep falling back
      }
    }
  }

  for (const url of inactive) {
    try { return await tryFn(url); } catch { /* continue */ }
  }

  throw new Error('All RPC endpoints failed — check network connection');
}

// ─────────────────────────────────────────────────────────────────────────────
// sendRawToManyRpcs — durable send: rebroadcast the signed tx to every real
// node until confirmed OR the blockhash expires.
//
// `lastValidBlockHeight` (from getLatestBlockhash) lets us detect TRUE expiry
// instead of guessing with a timer. If you don't pass it, we fall back to a
// 90s wall-clock deadline.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendRawToManyRpcs(
  rawTx: Uint8Array | Buffer,
  lastValidBlockHeight?: number,
  commitment: Commitment = 'confirmed',
): Promise<string> {
  const endpoints = [...new Set(RPC_CHAIN)];
  const conns = endpoints.map(u => new Connection(u, commitment));

  const sendOnce = async (c: Connection): Promise<string> =>
    Promise.race([
      c.sendRawTransaction(rawTx as Buffer, { skipPreflight: true, maxRetries: 0 }),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('rpc-timeout')), 5_000)),
    ]);

  // Initial submit — fan out to all real nodes, take the first signature back.
  let sig: string | null = null;
  try {
    sig = await Promise.any(conns.map(sendOnce));
  } catch {
    // every node rejected the very first send — try once more after a tick
    await sleep(800);
    try { sig = await Promise.any(conns.map(sendOnce)); } catch { /* fall through */ }
  }

  if (!sig) {
    throw new Error('All RPCs rejected the transaction on submit — check wallet balance / inputs');
  }

  // Rebroadcast + confirm loop. Keeps the tx alive against drops on public RPC.
  const WALL_DEADLINE = Date.now() + 90_000;
  let lastRebroadcast = Date.now();

  while (Date.now() < WALL_DEADLINE) {
    // 1) Check confirmation across nodes
    for (const c of conns) {
      try {
        const { value } = await c.getSignatureStatuses([sig]);
        const st = value[0];
        if (st) {
          if (st.err) throw new Error(`On-chain error: ${JSON.stringify(st.err)}`);
          if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') {
            return sig;
          }
        }
      } catch (e) {
        const m = ((e as Error)?.message ?? '').toLowerCase();
        // a real on-chain error must propagate; ignore transient network noise
        if (m.includes('on-chain error')) throw e;
        if (!m.includes('fetch') && !m.includes('429') && !m.includes('timeout')) { /* ignore */ }
      }
    }

    // 2) True expiry check (only when we know lastValidBlockHeight)
    if (typeof lastValidBlockHeight === 'number') {
      try {
        const h = await conns[0].getBlockHeight(commitment);
        if (h > lastValidBlockHeight) {
          throw new Error('Transaction expired — blockhash no longer valid');
        }
      } catch (e) {
        if (((e as Error)?.message ?? '').includes('expired')) throw e;
        // network hiccup reading height → ignore, keep trying
      }
    }

    // 3) Rebroadcast the SAME signed tx every ~2s (this is what beats drops)
    if (Date.now() - lastRebroadcast > 2_000) {
      lastRebroadcast = Date.now();
      conns.forEach(c => { void sendOnce(c).catch(() => {}); });
    }

    await sleep(1_500);
  }

  throw new Error('Transaction not confirmed after 90s — check /streams for status');
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-warm: race endpoints on app mount, cache the fastest winner
// ─────────────────────────────────────────────────────────────────────────────
export async function preWarmRpc(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (RPC_CHAIN.length < 2) return;

  const candidates = [...new Set(RPC_CHAIN)];

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

/** Expose the total RPC count for display */
export const RPC_COUNT = RPC_CHAIN.length;

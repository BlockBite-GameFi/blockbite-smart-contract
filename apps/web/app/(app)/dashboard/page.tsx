'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  VESTING_PROGRAM_ID, deriveStreamPDA, deriveVaultPDA,
  fetchStream, cancelStream,
  getAllStreams, getStreamsByAuthority, getStreamsByBeneficiary,
  StreamInfo,
} from '@/lib/anchor/vesting-client';
import { withRpcFallback } from '@/lib/solana/rpc-manager';
import { KNOWN_DEVNET_TOKENS } from '@/lib/solana/token-registry';

// ── Brand tokens ────────────────────────────────────────────────────────────
const MAGENTA = '#b12c84';
const TEAL    = '#3d7c91';
const GOLD    = '#e1a438';
const PURPLE  = '#7c80e8';
const RED     = '#c0392b';
const BG      = '#08080f';

// ── Types ────────────────────────────────────────────────────────────────────
interface StreamRow {
  pda: PublicKey;
  vault: PublicKey;
  authority: PublicKey;
  beneficiary: PublicKey;
  mint: PublicKey;
  amountTotal: BN;
  amountWithdrawn: BN;
  startTs: number;
  cliffTs: number;
  endTs: number;
  streamId: BN;
  cancelled: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Infer mint decimals from the known-token registry; default 9 for unknowns. */
function mintDecimals(mint: PublicKey): number {
  const entry = KNOWN_DEVNET_TOKENS[mint.toBase58()];
  return entry ? entry.decimals : 9;
}

function fmtTokens(raw: BN, decimals: number): string {
  return (Number(raw.toString()) / 10 ** decimals).toFixed(2);
}

function calcUnlockedFrac(row: StreamRow, nowSec: number): number {
  if (row.cancelled) return 0;
  if (nowSec < row.cliffTs) return 0;
  if (nowSec >= row.endTs) return 1;
  return (nowSec - row.startTs) / (row.endTs - row.startTs);
}

function timeRemaining(endTs: number, nowSec: number): string {
  const diff = endTs - nowSec;
  if (diff <= 0) return 'Fully vested';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function shortPk(pk: PublicKey) {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function cliffLabel(row: StreamRow): string {
  if (row.cliffTs > row.startTs) return 'CLIFF';
  return 'LINEAR';
}

// ── StreamCard ────────────────────────────────────────────────────────────────
function StreamCard({ row, nowSec, walletKey, onCancel, cancelling }: {
  row: StreamRow;
  nowSec: number;
  walletKey: PublicKey | null;
  onCancel: (r: StreamRow) => void;
  cancelling: boolean;
}) {
  const [copiedCA, setCopiedCA] = useState(false);
  const [copiedBenef, setCopiedBenef] = useState(false);

  const decimals  = mintDecimals(row.mint);
  const frac      = calcUnlockedFrac(row, nowSec);
  const pct       = Math.round(frac * 100);
  const total     = Number(row.amountTotal.toString());
  const taken     = Number(row.amountWithdrawn.toString());
  const claimable = Math.max(0, Math.floor(total * frac) - taken);
  const isCreator  = walletKey?.equals(row.authority);
  const isBenef    = walletKey?.equals(row.beneficiary);
  const beforeCliff = nowSec < row.cliffTs;
  const canCancel   = isCreator && !row.cancelled && nowSec < row.endTs;

  const status = row.cancelled   ? 'CANCELLED'
    : nowSec >= row.endTs        ? 'FULLY VESTED'
    : beforeCliff                ? 'CLIFF PENDING'
    : 'STREAMING';

  const statusColor = row.cancelled ? '#555'
    : nowSec >= row.endTs           ? GOLD
    : beforeCliff                   ? PURPLE
    : TEAL;

  const copyText = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 1600);
    });
  };

  return (
    <div style={{
      background: '#0b0b18', border: `1px solid ${canCancel ? '#2a1a1a' : '#18182a'}`,
      borderRadius: 10, padding: '16px 20px', marginBottom: 10,
    }}>
      {/* Row 1: ID, cliff label, status, time remaining */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#555' }}>
          #{row.streamId.toString()}
        </span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600,
          color: PURPLE, background: `${PURPLE}20`, padding: '2px 7px', borderRadius: 4,
        }}>
          {cliffLabel(row)}
        </span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
          color: statusColor, background: `${statusColor}18`,
          padding: '2px 7px', borderRadius: 4,
        }}>
          {status}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#444' }}>
          {pct}% · {timeRemaining(row.endTs, nowSec)}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ background: '#151525', borderRadius: 3, height: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: row.cancelled ? '#2a2a2a' : `linear-gradient(90deg, ${TEAL}, ${GOLD})`,
        }} />
      </div>

      {/* Row 2: From wallet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#444', width: 36 }}>FROM</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#666' }}>
          {shortPk(row.authority)}
        </span>
        <button
          onClick={() => copyText(row.authority.toBase58(), setCopiedBenef)}
          style={{
            padding: '2px 8px', background: 'transparent', border: '1px solid #252535',
            borderRadius: 4, color: '#444', fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, cursor: 'pointer',
          }}
        >
          {copiedBenef ? '✓' : '⎘'}
        </button>
      </div>

      {/* Row 3: Recipient wallet + Cancel button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#444', width: 36 }}>TO</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#aaa', fontWeight: 600 }}>
          {row.beneficiary.toBase58()}
        </span>
        {canCancel && (
          <button
            onClick={() => onCancel(row)}
            disabled={cancelling}
            style={{
              marginLeft: 'auto', padding: '4px 14px',
              background: cancelling ? 'transparent' : `${RED}22`,
              border: `1px solid ${RED}66`, borderRadius: 6,
              color: RED, fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 700, fontSize: 12, cursor: cancelling ? 'wait' : 'pointer',
              opacity: cancelling ? 0.5 : 1, whiteSpace: 'nowrap',
            }}
          >
            {cancelling ? '...' : '✕ Cancel'}
          </button>
        )}
      </div>

      {/* Row 4: Token info + Copy CA + Claim */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#666' }}>
          {fmtTokens(row.amountTotal, decimals)} total
        </span>
        <span style={{ color: '#2a2a3e' }}>·</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#555' }}>
          {fmtTokens(row.amountWithdrawn, decimals)} claimed
        </span>
        {claimable > 0 && (
          <>
            <span style={{ color: '#2a2a3e' }}>·</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: GOLD }}>
              {(claimable / 10 ** decimals).toFixed(2)} unlocked
            </span>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => copyText(row.mint.toBase58(), setCopiedCA)}
            style={{
              padding: '4px 10px', background: 'transparent',
              border: `1px solid ${GOLD}44`, borderRadius: 6,
              color: copiedCA ? GOLD : '#666', fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, cursor: 'pointer',
            }}
          >
            {copiedCA ? '✓ CA Copied' : '◈ Copy CA'}
          </button>
          {isBenef && !row.cancelled && (
            <Link
              href={`/claim/${row.pda.toBase58()}`}
              style={{
                padding: '4px 12px',
                background: claimable > 0 ? `linear-gradient(135deg, ${TEAL}, ${GOLD})` : 'transparent',
                border: claimable > 0 ? 'none' : '1px solid #2a2a3e',
                borderRadius: 6, color: claimable > 0 ? '#000' : '#555',
                fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 11,
                textDecoration: 'none',
              }}
            >
              {claimable > 0 ? `CLAIM` : 'CLAIM'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const { sendTransaction } = useWallet();

  const [streams,    setStreams]    = useState<StreamRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const [nowSec,     setNowSec]     = useState(Math.floor(Date.now() / 1000));
  const [tab,        setTab]        = useState<'mine' | 'all'>('mine');

  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      // All reads go through the single sterile endpoint (withRpcFallback now
      // retries the same endpoint, no provider switching — Pasal 87). Fetching
      // the wallet's streams AND the global set here is what makes the "ALL
      // STREAMS" tab show the same set as the /streams page: previously the
      // dashboard only ever queried the wallet's own streams, so "ALL" was a
      // misnomer and the two pages disagreed.
      const [asCreator, asRecipient, allGlobal] = await Promise.all([
        withRpcFallback(conn => getStreamsByAuthority(conn, publicKey)),
        withRpcFallback(conn => getStreamsByBeneficiary(conn, publicKey)),
        withRpcFallback(conn => getAllStreams(conn)).catch(() => [] as StreamInfo[]),
      ]);

      // Deduplicate the wallet's streams, then append the rest of the global
      // set (mine first) so both tabs read from one consistent list.
      const seen = new Set<string>();
      const ordered: StreamInfo[] = [];
      for (const s of [...asCreator, ...asRecipient]) {
        const key = s.pubkey.toBase58();
        if (!seen.has(key)) { seen.add(key); ordered.push(s); }
      }
      for (const s of allGlobal) {
        const key = s.pubkey.toBase58();
        if (!seen.has(key)) { seen.add(key); ordered.push(s); }
      }

      const found: StreamRow[] = ordered.map(data => {
        const [vault] = deriveVaultPDA(data.authority, data.beneficiary, data.streamId);
        return {
          pda:  data.pubkey,
          vault,
          authority:       data.authority,
          beneficiary:     data.beneficiary,
          mint:            data.mint,
          amountTotal:     data.amountTotal,
          amountWithdrawn: data.amountWithdrawn,
          startTs:  data.startTs.toNumber(),
          cliffTs:  data.cliffTs.toNumber(),
          endTs:    data.endTs.toNumber(),
          streamId: data.streamId,
          cancelled: data.cancelled,
        };
      });
      setStreams(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCancel = useCallback(async (row: StreamRow) => {
    if (!publicKey) return;
    if (!confirm(`Cancel stream #${row.streamId.toString()}? Unvested tokens return to you; vested-but-unclaimed go to recipient.`)) return;
    setCancelBusy(row.pda.toBase58());
    setError(null);
    try {
      const authorityAta   = await getAssociatedTokenAddress(row.mint, publicKey);
      const beneficiaryAta = await getAssociatedTokenAddress(row.mint, row.beneficiary);
      await cancelStream({
        connection,
        authority:      publicKey,
        beneficiary:    row.beneficiary,
        stream:         row.pda,
        vault:          row.vault,
        authorityAta,
        beneficiaryAta,
        sendTransaction,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelBusy(null);
    }
  }, [publicKey, sendTransaction, connection, refresh]);

  // The wallet's own streams — used for the headline KPI cards so they stay
  // user-scoped (matching the /streams page), regardless of the MY/ALL tab.
  const myStreams = streams.filter(s => publicKey && (s.authority.equals(publicKey) || s.beneficiary.equals(publicKey)));

  const filtered = tab === 'mine' ? myStreams : streams;

  // Sum amounts per stream using per-mint decimals — avoids mixing 9-decimal
  // wSOL with 6-decimal USDC/BBT in a single raw total.
  const totalLocked    = myStreams.reduce((a, s) => a + Number(s.amountTotal.toString())     / 10 ** mintDecimals(s.mint), 0);
  const totalWithdrawn = myStreams.reduce((a, s) => a + Number(s.amountWithdrawn.toString()) / 10 ** mintDecimals(s.mint), 0);
  const activeCount    = myStreams.filter(s => !s.cancelled).length;

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff' }}>

      {/* Hero */}
      <div style={{ padding: '88px 32px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: TEAL, letterSpacing: 2, marginBottom: 8 }}>
          TOKEN DISTRIBUTION PROTOCOL
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.1 }}>
          TDP Dashboard
        </h1>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#888', fontSize: 14, margin: 0 }}>
          Manage on-chain vesting streams. Cliff + Milestone + Linear unlock on Solana devnet.
        </p>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#333', marginTop: 6 }}>
          Program: {VESTING_PROGRAM_ID.toBase58()}
        </p>
      </div>

      {/* Stats */}
      <div style={{ padding: '0 32px 28px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: 'ACTIVE STREAMS', value: activeCount.toString() },
            { label: 'TOTAL LOCKED',   value: totalLocked.toFixed(2) },
            { label: 'TOTAL CLAIMED',  value: totalWithdrawn.toFixed(2) },
            { label: 'NETWORK',        value: 'Devnet' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#0d0d1a', border: '1px solid #1e1e3a', borderRadius: 10, padding: 16 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#555', marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 20, color: GOLD }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 32px 48px', maxWidth: 960, margin: '0 auto' }}>
        {!connected ? (
          <div style={{
            textAlign: 'center', padding: '72px 32px',
            background: '#0d0d1a', border: '1px solid #1e1e3a', borderRadius: 16,
          }}>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
              Connect your wallet
            </h2>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#666', fontSize: 14, marginBottom: 24 }}>
              Connect Phantom or Solflare to view and manage your TDP streams.
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '12px 32px', background: `linear-gradient(135deg, ${TEAL}, ${GOLD})`,
                border: 'none', borderRadius: 10, color: '#000',
                fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              Connect Wallet
            </button>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#333', marginTop: 14 }}>
              Phantom / Solflare / Coinbase / Trust
            </p>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
              {(['mine', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 20px',
                    background: tab === t ? `linear-gradient(135deg, ${MAGENTA}, ${PURPLE})` : 'transparent',
                    border: tab === t ? 'none' : '1px solid #2a2a3e',
                    borderRadius: 8, color: tab === t ? '#fff' : '#666',
                    fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {t === 'mine' ? 'MY STREAMS' : 'ALL STREAMS'}
                </button>
              ))}
              <button
                onClick={refresh}
                style={{
                  padding: '8px 14px', background: 'transparent',
                  border: '1px solid #2a2a3e', borderRadius: 8,
                  color: '#555', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, cursor: 'pointer',
                }}
              >
                {loading ? '...' : 'REFRESH'}
              </button>
              <div style={{ flex: 1 }} />
              <Link href="/new" style={{
                padding: '8px 20px', background: `linear-gradient(135deg, ${TEAL}, ${GOLD})`,
                border: 'none', borderRadius: 8, color: '#000',
                fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 13, textDecoration: 'none',
              }}>
                + NEW STREAM
              </Link>
            </div>

            {error && (
              <div style={{
                padding: 14, borderRadius: 10, marginBottom: 16,
                background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.4)',
                color: '#f472b6', fontSize: 12, fontFamily: 'monospace',
              }}>{error}</div>
            )}

            {loading && (
              <div style={{ padding: 40, textAlign: 'center', color: '#444', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
                Loading streams from devnet...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '56px 32px',
                background: '#0d0d1a', border: '1px solid #1e1e3a', borderRadius: 16, color: '#444',
              }}>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, marginBottom: 8 }}>No streams found</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, marginBottom: 24 }}>
                  Create a stream from /new — it will appear here
                </div>
                <Link href="/new" style={{
                  padding: '10px 22px', background: `linear-gradient(135deg, ${TEAL}, ${GOLD})`,
                  borderRadius: 8, color: '#000', fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 700, fontSize: 13, textDecoration: 'none',
                }}>
                  CREATE FIRST STREAM
                </Link>
              </div>
            )}

            {!loading && filtered.map((row) => (
              <StreamCard
                key={row.pda.toBase58()}
                row={row}
                nowSec={nowSec}
                walletKey={publicKey}
                onCancel={handleCancel}
                cancelling={cancelBusy === row.pda.toBase58()}
              />
            ))}
          </>
        )}
      </div>

      {/* How it works */}
      <div style={{ padding: '0 32px 60px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ background: '#0d0d1a', border: '1px solid #1e1e3a', borderRadius: 12, padding: 24 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: TEAL, marginBottom: 12 }}>
            HOW IT WORKS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {[
              { n: '01', t: 'Cliff Gate',        d: 'Zero tokens unlock before cliff_ts. Hard time floor.' },
              { n: '02', t: 'Milestone Gate',     d: 'required_tier > 0 gates on oracle proof (game, DAO vote, admin).' },
              { n: '03', t: 'Linear Streaming',   d: 'After cliff + milestone: tokens flow per-second, rate = amount / duration.' },
            ].map(({ n, t, d }) => (
              <div key={n}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, color: '#2a2a3e', marginBottom: 4 }}>{n}</div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 14, color: GOLD, marginBottom: 6 }}>{t}</div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 13, color: '#666', lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

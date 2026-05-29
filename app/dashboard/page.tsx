'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  VESTING_PROGRAM_ID, deriveStreamPDA, deriveVaultPDA,
  fetchStream, cancelStream,
} from '@/lib/anchor/vesting-client';
import { useApp } from '@/lib/useApp';
import { T } from '@/lib/theme';

// ── Semantic brand colors (not theme-specific) ───────────────────────────────
const TEAL    = '#3d7c91';
const GOLD    = '#e1a438';
const PURPLE  = '#7c80e8';
const MAGENTA = '#b12c84';

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
function fmtTokens(raw: BN, decimals = 6): string {
  return (Number(raw.toString()) / 10 ** decimals).toFixed(2);
}

function calcUnlockedFrac(row: StreamRow, nowSec: number): number {
  if (row.cancelled) return 0;
  if (nowSec < row.cliffTs) return 0;
  if (nowSec >= row.endTs) return 1;
  return (nowSec - row.startTs) / (row.endTs - row.startTs);
}

function timeRemaining(endTs: number, nowSec: number, isId: boolean): string {
  const diff = endTs - nowSec;
  if (diff <= 0) return isId ? 'Sepenuhnya vesting' : 'Fully vested';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (isId) {
    if (d > 0) return `${d}h ${h}j tersisa`;
    if (h > 0) return `${h}j ${m}m tersisa`;
    return `${m}m tersisa`;
  }
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function shortPk(pk: PublicKey) {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

// ── StreamCard ────────────────────────────────────────────────────────────────
function StreamCard({ row, nowSec, walletKey, onCancel, cancelling, lang }: {
  row: StreamRow;
  nowSec: number;
  walletKey: PublicKey | null;
  onCancel: (r: StreamRow) => void;
  cancelling: boolean;
  lang: 'en' | 'id';
}) {
  const isId    = lang === 'id';
  const frac    = calcUnlockedFrac(row, nowSec);
  const pct     = Math.round(frac * 100);
  const total   = Number(row.amountTotal.toString());
  const taken   = Number(row.amountWithdrawn.toString());
  const claimable = Math.max(0, Math.floor(total * frac) - taken);
  const isCreator = walletKey?.equals(row.authority);
  const isBenef   = walletKey?.equals(row.beneficiary);
  const beforeCliff = nowSec < row.cliffTs;

  const status = row.cancelled   ? (isId ? 'DIBATALKAN' : 'CANCELLED')
    : nowSec >= row.endTs        ? (isId ? 'FULLY VESTING' : 'FULLY VESTED')
    : beforeCliff                ? (isId ? 'MENUNGGU CLIFF' : 'CLIFF PENDING')
    : (isId ? 'BERJALAN' : 'STREAMING');

  const statusColor = row.cancelled ? T.textDim
    : nowSec >= row.endTs          ? GOLD
    : beforeCliff                  ? PURPLE
    : TEAL;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: '20px 24px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim }}>
            STREAM #{row.streamId.toString()}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: statusColor, background: `${statusColor}22`, padding: '2px 8px', borderRadius: 4 }}>
            {status}
          </span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim }}>{shortPk(row.pda)}</span>
      </div>

      <div style={{ background: T.surface2, borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: row.cancelled ? T.textDim : `linear-gradient(90deg, ${TEAL}, ${GOLD})`,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim }}>{pct}% {isId ? 'vesting' : 'vested'}</span>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim }}>{timeRemaining(row.endTs, nowSec, isId)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        {[
          { label: isId ? 'TOTAL' : 'TOTAL',       value: fmtTokens(row.amountTotal),     color: T.textDim },
          { label: isId ? 'DITARIK' : 'WITHDRAWN', value: fmtTokens(row.amountWithdrawn), color: T.textDim },
          { label: isId ? 'BISA DIKLAIM' : 'CLAIMABLE', value: (claimable / 1e6).toFixed(2), color: claimable > 0 ? GOLD : T.textDim },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: T.mono, fontSize: 16, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, fontFamily: T.mono, color: T.textDim, marginBottom: 12 }}>
        {isId ? 'DARI' : 'FROM'}: {shortPk(row.authority)} → {isId ? 'KE' : 'TO'}: {shortPk(row.beneficiary)}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {isBenef && !row.cancelled && (
          <Link
            href={`/claim/${row.pda.toBase58()}`}
            style={{
              flex: 1, padding: '10px 0', textAlign: 'center',
              background: claimable > 0 ? `linear-gradient(135deg, ${TEAL}, ${GOLD})` : T.surface2,
              border: claimable > 0 ? 'none' : `1px solid ${T.border}`,
              borderRadius: 8,
              color: claimable > 0 ? '#000' : T.textDim,
              fontFamily: T.serif, fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'block',
            }}
          >
            {claimable > 0
              ? (isId ? `KLAIM ${(claimable / 1e6).toFixed(2)}` : `CLAIM ${(claimable / 1e6).toFixed(2)}`)
              : beforeCliff
                ? (isId ? 'MENUNGGU CLIFF' : 'CLIFF PENDING')
                : (isId ? 'TIDAK ADA YANG DIKLAIM' : 'NOTHING TO CLAIM')}
          </Link>
        )}
        {isCreator && !row.cancelled && nowSec < row.endTs && (
          <button
            onClick={() => onCancel(row)}
            disabled={cancelling}
            style={{
              padding: '10px 16px', background: 'transparent',
              border: '1px solid rgba(244,114,182,0.3)', borderRadius: 8,
              color: '#f472b6', fontFamily: T.serif,
              fontWeight: 600, fontSize: 12, cursor: cancelling ? 'wait' : 'pointer',
              opacity: cancelling ? 0.5 : 1,
            }}
          >
            {cancelling ? '...' : (isId ? 'BATALKAN' : 'CANCEL')}
          </button>
        )}
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
  const { lang } = useApp();
  const isId = lang === 'id';

  const [streams,    setStreams]    = useState<StreamRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  const [nowSec,     setNowSec]     = useState(Math.floor(Date.now() / 1000));
  const [tab,        setTab]        = useState<'mine' | 'all'>('mine');

  useEffect(() => {
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const idxKey = `bb_streams_${publicKey.toBase58()}`;
      const stored = JSON.parse(localStorage.getItem(idxKey) ?? '[]') as string[];
      const found: StreamRow[] = [];
      for (const idStr of stored) {
        const streamIdBn = new BN(idStr);
        const [pda]   = deriveStreamPDA(publicKey, streamIdBn);
        const data    = await fetchStream(connection, pda);
        if (!data) continue;
        const [vault] = deriveVaultPDA(publicKey, streamIdBn);
        found.push({
          pda, vault,
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
        });
      }
      setStreams(found.sort((a, b) => b.startTs - a.startTs));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCancel = useCallback(async (row: StreamRow) => {
    if (!publicKey) return;
    const msg = isId
      ? `Batalkan stream #${row.streamId.toString()}? Token yang belum vesting kembali ke Anda; yang sudah vesting tapi belum diklaim pergi ke penerima.`
      : `Cancel stream #${row.streamId.toString()}? Unvested tokens return to you; vested-but-unclaimed go to recipient.`;
    if (!confirm(msg)) return;
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
  }, [publicKey, sendTransaction, connection, refresh, isId]);

  const filtered = tab === 'mine'
    ? streams.filter(s => publicKey && (s.authority.equals(publicKey) || s.beneficiary.equals(publicKey)))
    : streams;

  const totalLocked    = streams.reduce((a, s) => a + Number(s.amountTotal.toString()), 0);
  const totalWithdrawn = streams.reduce((a, s) => a + Number(s.amountWithdrawn.toString()), 0);
  const activeCount    = streams.filter(s => !s.cancelled).length;

  const howItWorks = isId ? [
    { n: '01', t: 'Gerbang Cliff',     d: 'Nol token terbuka sebelum cliff_ts. Pengunci waktu keras.' },
    { n: '02', t: 'Gerbang Milestone', d: 'required_tier > 0 mengunci berdasarkan bukti oracle (game, voting DAO, admin).' },
    { n: '03', t: 'Streaming Linear',  d: 'Setelah cliff + milestone: token mengalir per detik, rate = jumlah / durasi.' },
  ] : [
    { n: '01', t: 'Cliff Gate',       d: 'Zero tokens unlock before cliff_ts. Hard time floor.' },
    { n: '02', t: 'Milestone Gate',    d: 'required_tier > 0 gates on oracle proof (game, DAO vote, admin).' },
    { n: '03', t: 'Linear Streaming', d: 'After cliff + milestone: tokens flow per-second, rate = amount / duration.' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text }}>
      <Navbar />

      {/* Hero */}
      <div style={{ padding: '88px 32px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ fontFamily: T.mono, fontSize: 11, color: TEAL, letterSpacing: 2, marginBottom: 8 }}>
          {isId ? 'PROTOKOL DISTRIBUSI TOKEN' : 'TOKEN DISTRIBUTION PROTOCOL'}
        </div>
        <h1 style={{ fontFamily: T.serif, fontSize: 36, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.1 }}>
          {isId ? 'Dasbor TDP' : 'TDP Dashboard'}
        </h1>
        <p style={{ fontFamily: T.serif, color: T.textDim, fontSize: 14, margin: 0 }}>
          {isId
            ? 'Kelola stream vesting on-chain. Cliff + Milestone + Linear terbuka di Solana devnet.'
            : 'Manage on-chain vesting streams. Cliff + Milestone + Linear unlock on Solana devnet.'}
        </p>
        <p style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim, marginTop: 6 }}>
          Program: {VESTING_PROGRAM_ID.toBase58()}
        </p>
      </div>

      {/* Stats */}
      <div style={{ padding: '0 32px 28px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: isId ? 'STREAM AKTIF'  : 'ACTIVE STREAMS', value: activeCount.toString() },
            { label: isId ? 'TOTAL TERKUNCI': 'TOTAL LOCKED',   value: (totalLocked / 1e6).toFixed(2) },
            { label: isId ? 'TOTAL DIKLAIM' : 'TOTAL CLAIMED',  value: (totalWithdrawn / 1e6).toFixed(2) },
            { label: isId ? 'JARINGAN'      : 'NETWORK',        value: 'Devnet' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 20, color: GOLD }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 32px 48px', maxWidth: 960, margin: '0 auto' }}>
        {!connected ? (
          <div style={{
            textAlign: 'center', padding: '72px 32px',
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16,
          }}>
            <h2 style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
              {isId ? 'Hubungkan wallet Anda' : 'Connect your wallet'}
            </h2>
            <p style={{ fontFamily: T.serif, color: T.textDim, fontSize: 14, marginBottom: 24 }}>
              {isId
                ? 'Hubungkan Phantom atau Solflare untuk melihat dan mengelola stream TDP Anda.'
                : 'Connect Phantom or Solflare to view and manage your TDP streams.'}
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '12px 32px', background: `linear-gradient(135deg, ${TEAL}, ${GOLD})`,
                border: 'none', borderRadius: 10, color: '#000',
                fontFamily: T.serif, fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              {isId ? 'Hubungkan Wallet' : 'Connect Wallet'}
            </button>
            <p style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim, marginTop: 14 }}>
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
                    border: tab === t ? 'none' : `1px solid ${T.border}`,
                    borderRadius: 8, color: tab === t ? '#fff' : T.textDim,
                    fontFamily: T.serif, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {t === 'mine' ? (isId ? 'STREAM SAYA' : 'MY STREAMS') : (isId ? 'SEMUA STREAM' : 'ALL STREAMS')}
                </button>
              ))}
              <button
                onClick={refresh}
                style={{
                  padding: '8px 14px', background: 'transparent',
                  border: `1px solid ${T.border}`, borderRadius: 8,
                  color: T.textDim, fontFamily: T.mono, fontSize: 11, cursor: 'pointer',
                }}
              >
                {loading ? '...' : (isId ? 'SEGARKAN' : 'REFRESH')}
              </button>
              <div style={{ flex: 1 }} />
              <Link href="/distribute/new" style={{
                padding: '8px 20px', background: `linear-gradient(135deg, ${TEAL}, ${GOLD})`,
                border: 'none', borderRadius: 8, color: '#000',
                fontFamily: T.serif, fontWeight: 700, fontSize: 13, textDecoration: 'none',
              }}>
                {isId ? '+ STREAM BARU' : '+ NEW STREAM'}
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
              <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontFamily: T.mono, fontSize: 13 }}>
                {isId ? 'Memuat stream dari devnet...' : 'Loading streams from devnet...'}
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '56px 32px',
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, color: T.textDim,
              }}>
                <div style={{ fontFamily: T.serif, fontSize: 18, marginBottom: 8 }}>
                  {isId ? 'Tidak ada stream' : 'No streams found'}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 12, marginBottom: 24 }}>
                  {isId
                    ? 'Buat stream dari /distribute/new — akan muncul di sini'
                    : 'Create a stream from /distribute/new — it will appear here'}
                </div>
                <Link href="/distribute/new" style={{
                  padding: '10px 22px', background: `linear-gradient(135deg, ${TEAL}, ${GOLD})`,
                  borderRadius: 8, color: '#000', fontFamily: T.serif,
                  fontWeight: 700, fontSize: 13, textDecoration: 'none',
                }}>
                  {isId ? 'BUAT STREAM PERTAMA' : 'CREATE FIRST STREAM'}
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
                lang={lang}
              />
            ))}
          </>
        )}
      </div>

      {/* How it works */}
      <div style={{ padding: '0 32px 60px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: TEAL, marginBottom: 12 }}>
            {isId ? 'CARA KERJA' : 'HOW IT WORKS'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            {howItWorks.map(({ n, t, d }) => (
              <div key={n}>
                <div style={{ fontFamily: T.mono, fontSize: 22, color: T.border, marginBottom: 4 }}>{n}</div>
                <div style={{ fontFamily: T.serif, fontWeight: 700, fontSize: 14, color: GOLD, marginBottom: 6 }}>{t}</div>
                <div style={{ fontFamily: T.serif, fontSize: 13, color: T.textDim, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  getAllStreams,
  getStreamsByAuthority,
  getStreamsByBeneficiary,
  computeUnlocked,
  StreamInfo,
} from '@/lib/anchor/vesting-client';
import { BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { withRpcFallback } from '@/lib/solana/rpc-manager';
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

// ── Global: all streams on-chain ────────────────────────────────────────────
async function fetchAllGlobal(conn: Connection): Promise<StreamInfo[]> {
  const all = await getAllStreams(conn);
  return all.sort((a, b) => Number(b.startTs.toString()) - Number(a.startTs.toString()));
}

// ── User-specific: deduplicated by pubkey ────────────────────────────────────
async function fetchAndDedup(conn: Connection, walletKey: PublicKey): Promise<StreamInfo[]> {
  const [asCreator, asRecipient] = await Promise.all([
    getStreamsByAuthority(conn, walletKey),
    getStreamsByBeneficiary(conn, walletKey),
  ]);
  const seen = new Set<string>();
  const all: StreamInfo[] = [];
  for (const s of [...asCreator, ...asRecipient]) {
    const key = s.pubkey.toBase58();
    if (!seen.has(key)) { seen.add(key); all.push(s); }
  }
  return all.sort((a, b) => Number(b.startTs.toString()) - Number(a.startTs.toString()));
}

// ─── Design tokens ──────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  linear: T.accent, milestone: T.blue, cliff: T.gold,
};

function streamType(s: StreamInfo): string {
  // Hybrid (milestone+cliff) is reclassified as milestone for display
  if (s.milestoneCount > 0) return 'milestone';
  if (Number(s.cliffTs.toString()) > Number(s.startTs.toString())) return 'cliff';
  return 'linear';
}

function streamStatus(s: StreamInfo, nowSec: number): string {
  if (s.cancelled) return 'cancelled';
  if (nowSec < Number(s.cliffTs.toString())) return 'pending';
  if (nowSec >= Number(s.endTs.toString())) return 'completed';
  return 'active';
}

function timeLeft(s: StreamInfo, nowSec: number): string {
  if (s.cancelled) return 'Cancelled';
  const endTs   = Number(s.endTs.toString());
  const cliffTs = Number(s.cliffTs.toString());
  if (nowSec >= endTs) return 'Ended';
  if (nowSec < cliffTs) {
    const days = Math.ceil((cliffTs - nowSec) / 86400);
    return days > 1 ? `${days}d to cliff` : `<1d to cliff`;
  }
  const secs = endTs - nowSec;
  if (secs < 86400)     return `${Math.ceil(secs / 3600)}h left`;
  if (secs < 86400 * 7) return `${Math.ceil(secs / 86400)}d left`;
  return `${Math.ceil(secs / (86400 * 30))}mo left`;
}

function shortKey(pk: { toBase58(): string } | null): string {
  if (!pk) return '—';
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function fmtTokens(bn: BN): string {
  const n = Number(bn.toString()) / 1e6;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}

function fmtRaw(raw: number): string {
  const n = raw / 1e6;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '.04em', background: `color-mix(in srgb, ${color} 10%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
    }}>{label}</span>
  );
}

function StatusDot({ status }: { status: string }) {
  const col = ({ active: T.green, pending: T.gold, completed: T.textDim, cancelled: T.red } as Record<string, string>)[status] ?? T.textDim;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: col, boxShadow: `0 0 6px ${col}` }} />
      <span style={{ fontSize: 10.5, color: col, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{status}</span>
    </div>
  );
}

// ─── Column layout — sesuai perintah hakim ───────────────────────────────────
// Stream/Role | Type | Total Tokens | Creator/Team | Date Created | Status
const GRID = '2fr 90px 120px 140px 110px 90px';

const MOBILE_CSS = `
@media (max-width: 768px) {
  .sd-table-header { display: none !important; }
  .sd-table-row {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px;
    padding: 16px !important;
  }
  .sd-row-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .sd-row-amounts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .sd-col-hide { display: none !important; }
}
`;

export default function StreamsPage() {
  const { lang } = useApp();
  const tx = I18N.streams[lang];
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [streams,  setStreams]  = useState<StreamInfo[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState<'all' | 'active' | 'pending' | 'completed' | 'cancelled'>('all');
  const [nowSec,   setNowSec]   = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Public global dashboard: load ALL streams. If wallet connected, also
      // highlight user's streams. Falls back to empty if RPC blocks getProgramAccounts.
      if (publicKey) {
        const [all, mine] = await Promise.all([
          withRpcFallback(conn => fetchAllGlobal(conn)).catch(() => [] as StreamInfo[]),
          withRpcFallback(conn => fetchAndDedup(conn, publicKey)).catch(() => [] as StreamInfo[]),
        ]);
        // Merge: put user's streams first, then rest of global
        const myKeys = new Set(mine.map(s => s.pubkey.toBase58()));
        const rest   = all.filter(s => !myKeys.has(s.pubkey.toBase58()));
        setStreams([...mine, ...rest]);
      } else {
        // No wallet — show all public streams
        const all = await withRpcFallback(conn => fetchAllGlobal(conn)).catch(() => [] as StreamInfo[]);
        setStreams(all);
      }
    } catch {
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { load(); }, [load]);

  const filtered = streams.filter(s => {
    if (filter === 'all') return true;
    return streamStatus(s, nowSec) === filter;
  });

  const totalLocked    = streams.reduce((acc, s) => acc + Number(s.amountTotal.toString()), 0) / 1e6;
  const totalWithdrawn = streams.reduce((acc, s) => acc + Number(s.amountWithdrawn.toString()), 0) / 1e6;
  const activeCount    = streams.filter(s => streamStatus(s, nowSec) === 'active').length;

  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: MOBILE_CSS }} />
      <Navbar />

      {/* ── Header ── */}
      <div style={{ padding: '80px 24px 32px', background: T.header, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>{tx.badge}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(26px,5vw,44px)', fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 8, color: T.text }}>
                {tx.title}
              </h1>
              <p style={{ fontSize: 13, color: T.textDim, maxWidth: 520 }}>
                {tx.subtitle}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/demo" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                background: T.accentA1, color: T.accent,
                border: `1px solid ${T.border}`, borderRadius: 10,
                fontWeight: 600, fontSize: 12, textDecoration: 'none',
              }}>
                {tx.demoBtn}
              </Link>
              <Link href="/streams/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px',
                background: T.grad, color: T.text, borderRadius: 12,
                fontWeight: 700, fontSize: 13, textDecoration: 'none', boxShadow: `0 0 20px ${T.accentA4}`,
              }}>
                {tx.createBtn}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 100px' }}>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 32 }}>
          {[
            { label: tx.kpi.streams, value: String(streams.length),               sub: tx.kpi.streamsSub, color: T.accent },
            { label: tx.kpi.active,  value: String(activeCount),                  sub: tx.kpi.activeSub,  color: T.green  },
            { label: tx.kpi.locked,  value: totalLocked.toFixed(2) + ' TOKEN',    sub: tx.kpi.lockedSub,  color: T.gold   },
            { label: tx.kpi.claimed, value: totalWithdrawn.toFixed(2) + ' TOKEN', sub: tx.kpi.claimedSub, color: T.blue   },
          ].map(s => (
            <div key={s.label} style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: T.mono, fontSize: s.value.length > 10 ? 16 : 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Connect wallet CTA (soft, non-blocking) ── */}
        {!connected && (
          <div style={{ background: 'color-mix(in srgb, var(--p-accent) 5%, transparent)', border: `1px solid color-mix(in srgb, var(--p-accent) 18%, transparent)`, borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 13, color: T.textDim }}>
              Connect wallet to see your streams highlighted + create new streams
            </span>
            <button onClick={() => setVisible(true)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: T.grad, color: T.text, fontWeight: 700, fontSize: 12 }}>
              Connect Wallet
            </button>
          </div>
        )}

        {/* ── Error suppressed — RPC getProgramAccounts block handled silently ── */}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim, fontSize: 13 }}>
            {tx.loadingMsg}
          </div>
        )}

        {/* ── Streams table — public, no wallet gate ── */}
        {!loading && (
          <>
            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
              {([
                ['all',       tx.filterAll],
                ['active',    tx.filterActive],
                ['pending',   tx.filterPending],
                ['completed', tx.filterCompleted],
                ['cancelled', tx.filterCancelled],
              ] as const).map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  letterSpacing: '.04em', textTransform: 'uppercase',
                  background: filter === f ? T.accent : 'rgba(255,255,255,.06)',
                  color: filter === f ? T.text : T.textDim,
                }}>{label}</button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: T.textDim, alignSelf: 'center' }}>
                {tx.streamCount(filtered.length)}
              </span>
            </div>

            <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {/* Table header — hidden on mobile via MOBILE_CSS */}
              <div className="sd-table-header" style={{ display: 'grid', gridTemplateColumns: GRID, padding: '10px 20px', borderBottom: `1px solid ${T.border}`, background: 'rgba(255,255,255,.03)' }}>
                {tx.headers.map(h => (
                  <div key={h} style={{ fontSize: 9.5, color: T.textDim, fontWeight: 700, letterSpacing: '.06em' }}>{h}</div>
                ))}
              </div>

              {/* Empty state */}
              {filtered.length === 0 && (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: T.textDim, fontSize: 14 }}>
                  {streams.length === 0
                    ? <><Link href="/streams/new" style={{ color: T.accent }}>{tx.createFirst}</Link></>
                    : tx.noMatch
                  }
                </div>
              )}

              {/* Rows — click to open stream detail */}
              {filtered.map((s, i) => {
                const type       = streamType(s);
                const status     = streamStatus(s, nowSec);
                const typeCol    = TYPE_COLORS[type] ?? T.accent;
                const total      = Number(s.amountTotal.toString());
                const withdrawn  = Number(s.amountWithdrawn.toString());
                const claimable  = Number(computeUnlocked(s, nowSec));
                const isCreator  = publicKey && s.authority.toBase58() === publicKey.toBase58();
                const href       = `/streams/${s.pubkey.toBase58()}`;
                const tLeft      = timeLeft(s, nowSec);

                return (
                  <div
                    key={s.pubkey.toBase58()}
                    className="sd-table-row"
                    onClick={() => router.push(href)}
                    style={{
                      display: 'grid', gridTemplateColumns: GRID,
                      padding: '14px 20px',
                      borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                      background: i % 2 ? 'rgba(255,255,255,.01)' : 'transparent',
                      alignItems: 'center', cursor: 'pointer', transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.accentA1)}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 ? 'rgba(255,255,255,.01)' : 'transparent')}
                  >
                    {/* Col 1: Stream/Role — Project Name & Address */}
                    <div className="sd-row-meta">
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text, marginBottom: 2, fontWeight: 600 }}>
                          {shortKey(s.pubkey)}
                          {isCreator && <span style={{ marginLeft: 6, fontSize: 9, background: 'color-mix(in srgb, var(--p-accent) 15%, transparent)', color: T.accent, padding: '1px 5px', borderRadius: 4 }}>YOU</span>}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim }}>
                          → {shortKey(s.beneficiary)}
                          {s.milestoneCount > 0 && <span style={{ color: T.blue, marginLeft: 6 }}>· {s.milestoneCount} milestones</span>}
                        </div>
                      </div>
                      {/* Mobile: type + status inline */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge label={type.toUpperCase()} color={typeCol} />
                        <StatusDot status={status} />
                      </div>
                    </div>

                    {/* Col 2: Type */}
                    <div className="sd-col-hide"><Badge label={type.toUpperCase()} color={typeCol} /></div>

                    {/* Col 3: Total Tokens */}
                    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text, fontWeight: 600 }}>
                      {fmtTokens(s.amountTotal)}
                    </div>

                    {/* Col 4: Creator / Team */}
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: isCreator ? T.accent : T.textDim }}>
                      {shortKey(s.authority)}
                    </div>

                    {/* Col 5: Date Created (derived from startTs) */}
                    <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.textDim }}>
                      {new Date(Number(s.startTs.toString()) * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>

                    {/* Col 6: Status */}
                    <div><StatusDot status={status} /></div>
                  </div>
                );
              })}

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, background: 'rgba(255,255,255,.02)', fontSize: 11, color: T.textDim }}>
                {tx.tableFooter}
                {streams.length > 0 && (
                  <button onClick={load} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 11 }}>
                    {lang === 'id' ? '↻ Perbarui' : '↻ Refresh'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </main>
  );
}

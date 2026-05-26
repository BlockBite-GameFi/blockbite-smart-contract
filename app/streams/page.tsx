'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  getStreamsByAuthority,
  getStreamsByBeneficiary,
  computeUnlocked,
  StreamInfo,
} from '@/lib/anchor/vesting-client';
import { BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { withRpcFallback } from '@/lib/solana/rpc-manager';

// ── Stream fetch helper ──────────────────────────────────────────────────────
async function fetchAndDedup(
  conn: Connection,
  walletKey: PublicKey,
): Promise<StreamInfo[]> {
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
  all.sort((a, b) => Number(b.endTs.toString()) - Number(a.endTs.toString()));
  return all;
}

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  accent: '#a78bff', gold: '#f5c66a', green: '#5fd07a',
  blue: '#7ad7ff', red: '#ff3b6b', muted: 'rgba(232,225,248,.38)',
  border: 'rgba(167,139,255,.13)', bg0: '#05040d', bg1: '#09071a',
  mono: "'JetBrains Mono',monospace", serif: "'Space Grotesk',system-ui,sans-serif",
};

const TYPE_COLORS: Record<string, string> = {
  linear: C.accent, milestone: C.blue, cliff: C.gold, hybrid: '#c084fc',
};

function streamType(s: StreamInfo): string {
  if (s.milestoneCount > 0 && Number(s.cliffTs.toString()) > Number(s.startTs.toString())) return 'hybrid';
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
      letterSpacing: '.04em', background: `${color}1a`, color, border: `1px solid ${color}44`,
    }}>{label}</span>
  );
}

function StatusDot({ status }: { status: string }) {
  const col = ({ active: C.green, pending: C.gold, completed: C.muted, cancelled: C.red } as Record<string, string>)[status] ?? C.muted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: col, boxShadow: `0 0 6px ${col}` }} />
      <span style={{ fontSize: 10.5, color: col, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{status}</span>
    </div>
  );
}

// ─── Column layout (7 cols on desktop, card on mobile) ───────────────────────
const GRID = '1.8fr 90px 130px 130px 120px 110px 90px';
const HEADERS = ['STREAM / ROLE', 'TYPE', 'TOTAL', 'CLAIMED', 'UNLOCKED', 'TIME LEFT', 'STATUS'];

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
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [streams,  setStreams]  = useState<StreamInfo[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<'all' | 'active' | 'pending' | 'completed' | 'cancelled'>('all');
  const [nowSec,   setNowSec]   = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const all = await withRpcFallback(conn => fetchAndDedup(conn, publicKey));
      setStreams(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8' }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: MOBILE_CSS }} />
      <Navbar />

      {/* ── Header ── */}
      <div style={{ padding: '80px 24px 32px', background: 'linear-gradient(180deg,#0d0820 0%,#05040d 100%)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: C.accent, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>TDP Protocol · Devnet</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontFamily: C.serif, fontSize: 'clamp(26px,5vw,44px)', fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 8, color: '#fff' }}>
                Token Streams
              </h1>
              <p style={{ fontSize: 13, color: C.muted, maxWidth: 520 }}>
                Cliff · linear · milestone · hybrid vesting streams. Each stream is a PDA vault on Solana devnet.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/demo" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                background: 'rgba(167,139,255,.08)', color: C.accent,
                border: `1px solid ${C.border}`, borderRadius: 10,
                fontWeight: 600, fontSize: 12, textDecoration: 'none',
              }}>
                ◈ View Demo
              </Link>
              <Link href="/streams/new" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px',
                background: `linear-gradient(135deg,${C.accent},#5e35d4)`, color: '#fff', borderRadius: 12,
                fontWeight: 700, fontSize: 13, textDecoration: 'none', boxShadow: `0 0 20px ${C.accent}44`,
              }}>
                + Create Stream
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 100px' }}>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 32 }}>
          {[
            { label: 'Your Streams',    value: String(streams.length),               sub: 'as creator or recipient', color: C.accent },
            { label: 'Active',          value: String(activeCount),                  sub: 'currently streaming',     color: C.green  },
            { label: 'Total Locked',    value: totalLocked.toFixed(2) + ' TOKEN',    sub: 'across your streams',     color: C.gold   },
            { label: 'Total Claimed',   value: totalWithdrawn.toFixed(2) + ' TOKEN', sub: 'all-time withdrawn',      color: C.blue   },
          ].map(s => (
            <div key={s.label} style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: C.mono, fontSize: s.value.length > 10 ? 16 : 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Wallet gate ── */}
        {!connected && (
          <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Connect wallet to see your streams</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
              Your streams will appear here — streams you created and streams you&apos;re a beneficiary of.
            </div>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '11px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg,${C.accent},#5e35d4)`, color: '#fff',
                fontWeight: 700, fontSize: 13,
              }}
            >
              Connect Wallet
            </button>
            <div style={{ marginTop: 14 }}>
              <Link href="/demo" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>
                Or explore the demo →
              </Link>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{ background: '#ff3b6b1a', border: '1px solid #ff3b6b44', borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#ff3b6b' }}>
            ✗ {error} — <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 13 }}>Retry</button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: C.muted, fontSize: 13 }}>
            Loading streams from Solana devnet…
          </div>
        )}

        {/* ── Streams table ── */}
        {connected && !loading && (
          <>
            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
              {(['all', 'active', 'pending', 'completed', 'cancelled'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  letterSpacing: '.04em', textTransform: 'uppercase',
                  background: filter === f ? C.accent : 'rgba(255,255,255,.06)',
                  color: filter === f ? '#fff' : C.muted,
                }}>{f}</button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>
                {filtered.length} stream{filtered.length !== 1 ? 's' : ''} · click a row to view details
              </span>
            </div>

            <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {/* Table header — hidden on mobile via MOBILE_CSS */}
              <div className="sd-table-header" style={{ display: 'grid', gridTemplateColumns: GRID, padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,.03)' }}>
                {HEADERS.map(h => (
                  <div key={h} style={{ fontSize: 9.5, color: C.muted, fontWeight: 700, letterSpacing: '.06em' }}>{h}</div>
                ))}
              </div>

              {/* Empty state */}
              {filtered.length === 0 && (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
                  {streams.length === 0
                    ? <><Link href="/streams/new" style={{ color: C.accent }}>Create your first stream →</Link></>
                    : 'No streams match this filter.'
                  }
                </div>
              )}

              {/* Rows — click to open stream detail */}
              {filtered.map((s, i) => {
                const type       = streamType(s);
                const status     = streamStatus(s, nowSec);
                const typeCol    = TYPE_COLORS[type] ?? C.accent;
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
                      borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                      background: i % 2 ? 'rgba(255,255,255,.01)' : 'transparent',
                      alignItems: 'center', cursor: 'pointer', transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}09`)}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 ? 'rgba(255,255,255,.01)' : 'transparent')}
                  >
                    {/* Stream PDA + role — always visible */}
                    <div className="sd-row-meta">
                      <div>
                        <div style={{ fontFamily: C.mono, fontSize: 10.5, color: '#fff', marginBottom: 2 }}>
                          {shortKey(s.pubkey)}
                        </div>
                        <div style={{ fontSize: 10, color: isCreator ? C.accent : C.green }}>
                          {isCreator ? 'You created' : 'You receive'}
                          {s.milestoneCount > 0 && <span style={{ color: C.blue }}> · {s.milestoneCount} milestone{s.milestoneCount !== 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      {/* On mobile, show type + status inline */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge label={type.toUpperCase()} color={typeCol} />
                        <StatusDot status={status} />
                      </div>
                    </div>

                    {/* Type — hidden on mobile (shown above) */}
                    <div className="sd-col-hide"><Badge label={type.toUpperCase()} color={typeCol} /></div>

                    {/* Amounts row — shown as grid on mobile */}
                    <div className="sd-row-amounts">
                      <div style={{ fontFamily: C.mono, fontSize: 12, color: '#fff' }}>
                        <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>TOTAL</div>
                        {fmtTokens(s.amountTotal)}
                      </div>
                      <div style={{ fontFamily: C.mono, fontSize: 12, color: withdrawn > 0 ? C.green : C.muted }}>
                        <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>CLAIMED</div>
                        {fmtRaw(withdrawn)}
                      </div>
                      <div style={{ fontFamily: C.mono, fontSize: 12, color: claimable > 0 ? C.gold : C.muted }}>
                        <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>UNLOCKED</div>
                        {fmtRaw(claimable)}
                      </div>
                    </div>

                    {/* These 3 are hidden on mobile (merged into sd-row-amounts above) */}
                    <div className="sd-col-hide">
                      <div style={{ fontFamily: C.mono, fontSize: 12, color: withdrawn > 0 ? C.green : C.muted }}>{fmtRaw(withdrawn)}</div>
                      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{total > 0 ? `${Math.round((withdrawn / total) * 100)}% withdrawn` : '—'}</div>
                    </div>
                    <div className="sd-col-hide">
                      <div style={{ fontFamily: C.mono, fontSize: 12, color: claimable > 0 ? C.gold : C.muted }}>{fmtRaw(claimable)}</div>
                      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>claimable now</div>
                    </div>

                    {/* Time left */}
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: status === 'active' ? C.blue : C.muted }}>
                      {tLeft}
                    </div>

                    {/* Status — hidden on mobile (shown in meta row above) */}
                    <div className="sd-col-hide"><StatusDot status={status} /></div>
                  </div>
                );
              })}

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)', fontSize: 11, color: C.muted }}>
                Live on-chain data · Solana devnet · Click any row to view details, claim, or cancel
                {streams.length > 0 && (
                  <button onClick={load} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: C.accent, fontSize: 11 }}>
                    ↻ Refresh
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Quick Actions ── */}
        <div style={{ marginTop: 24, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 22px' }}>
          <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'Create New Stream',  href: '/streams/new',  col: C.accent, desc: 'Lock tokens into a PDA vault' },
              { label: 'Claim Tokens',       href: '/claim',        col: C.green,  desc: 'Withdraw vested tokens' },
              { label: 'Verify Milestone',   href: '/milestones',   col: C.blue,   desc: 'Unlock milestone allocation' },
              { label: 'Vesting Calculator', href: '/calculator',   col: C.gold,   desc: 'Model distribution schedule' },
              { label: 'View Demo',          href: '/demo',         col: C.muted,  desc: 'Simulated data walkthrough' },
            ].map(a => (
              <Link key={a.href} href={a.href} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 10, textDecoration: 'none', flex: '1 1 180px',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = a.col + '44'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.06)'; }}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.col, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{a.label}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{a.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

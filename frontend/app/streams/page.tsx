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
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

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
const TYPE_COLORS: Record<string, string> = {
  linear: T.accent, milestone: T.blue, cliff: T.gold, hybrid: '#c084fc',
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** Infer the correct decimal count from the stream's mint address. */
function mintDecimals(s: StreamInfo): number {
  try {
    return s.mint.toBase58() === WSOL_MINT ? 9 : 6;
  } catch { return 6; }
}

/**
 * Stream type classification — based on timestamps, not milestoneCount.
 *
 * Rules:
 *  cliff   = cliffTs > startTs AND endTs ≤ cliffTs + 60 s (instant full release)
 *  hybrid  = cliffTs > startTs AND endTs >> cliffTs (cliff gate + linear decay)
 *  milestone = milestoneCount > 0 (on-chain verified milestone gates)
 *  linear  = no cliff (endTs - startTs is the full window)
 *
 * NOTE: requiredTier (game gate) does NOT change the vesting *type* — it only
 * adds an unlock requirement on top. We show it as a separate badge in the row.
 */
function streamType(s: StreamInfo): string {
  const startTs = Number(s.startTs.toString());
  const cliffTs = Number(s.cliffTs.toString());
  const endTs   = Number(s.endTs.toString());
  const hasCliff = cliffTs > startTs;

  // Pure cliff: endTs is at most 60 seconds after cliffTs (instant full release)
  if (hasCliff && endTs - cliffTs <= 60) return 'cliff';

  // Hybrid: has a cliff gate AND a linear decay period after it
  if (hasCliff && s.milestoneCount > 0) return 'hybrid';

  // Milestone-only (no time cliff, but on-chain milestone percentage gates)
  if (s.milestoneCount > 0) return 'milestone';

  // Linear with cliff — cliff acts as a gate before linear decay begins
  if (hasCliff) return 'hybrid';

  // Pure linear
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

/** Format a BN amount using the correct decimal count for the stream's mint. */
function fmtTokens(bn: BN, dec = 6): string {
  const n = Number(bn.toString()) / 10 ** dec;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  // Show up to 4 significant decimals, trim trailing zeros
  return parseFloat(n.toFixed(4)).toString();
}

function fmtRaw(raw: number, dec = 6): string {
  const n = raw / 10 ** dec;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return parseFloat(n.toFixed(4)).toString();
}

/** Token symbol from mint address — fallback to generic label. */
function mintSymbol(s: StreamInfo): string {
  try {
    const addr = s.mint.toBase58();
    if (addr === WSOL_MINT) return 'SOL';
    if (addr === 'ZLkYWYvM4ZEDcPcvmcxmcgTgvsWRCXqg9ZYyQuf7njU') return 'USDC';
    if (addr === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') return 'USDC';
    if (addr === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') return 'USDC';
    if (addr === '9d4hVSzi4W6VoAp5dNgxsHNiFmZpq9RiK5vHtmip8asU') return 'BBT';
    return addr.slice(0, 4) + '…';
  } catch { return 'TOKEN'; }
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

// ─── Column layout (7 cols on desktop, card on mobile) ───────────────────────
const GRID = '1.8fr 90px 130px 130px 120px 110px 90px';

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

  // Sum locked/withdrawn normalised to 6-decimal base for display (mixed mints = approximate)
  const totalLocked    = streams.reduce((acc, s) => {
    const dec = mintDecimals(s);
    return acc + Number(s.amountTotal.toString()) / 10 ** dec;
  }, 0);
  const totalWithdrawn = streams.reduce((acc, s) => {
    const dec = mintDecimals(s);
    return acc + Number(s.amountWithdrawn.toString()) / 10 ** dec;
  }, 0);
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

        {/* ── Wallet gate ── */}
        {!connected && (
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>{tx.walletTitle}</div>
            <div style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
              {tx.walletSub}
            </div>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '11px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: T.grad, color: T.text,
                fontWeight: 700, fontSize: 13,
              }}
            >
              {tx.connectBtn}
            </button>
            <div style={{ marginTop: 14 }}>
              <Link href="/demo" style={{ fontSize: 12, color: T.accent, textDecoration: 'none' }}>
                {tx.orDemo}
              </Link>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{ background: T.redA1, border: `1px solid ${T.accentA4}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: T.red }}>
            ✗ {error} — <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 13 }}>Retry</button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim, fontSize: 13 }}>
            {tx.loadingMsg}
          </div>
        )}

        {/* ── Streams table ── */}
        {connected && !loading && (
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
                const dec        = mintDecimals(s);
                const sym        = mintSymbol(s);
                const total      = Number(s.amountTotal.toString());
                const withdrawn  = Number(s.amountWithdrawn.toString());
                const claimable  = Number(computeUnlocked(s, nowSec));
                const isCreator  = publicKey && s.authority.toBase58() === publicKey.toBase58();
                const href       = `/streams/${s.pubkey.toBase58()}`;
                const tLeft      = timeLeft(s, nowSec);
                const hasGameGate = (s as unknown as { requiredTier?: number }).requiredTier != null
                  && ((s as unknown as { requiredTier: number }).requiredTier > 0);

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
                    {/* Stream PDA + role — always visible */}
                    <div className="sd-row-meta">
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.text, marginBottom: 2 }}>
                          {shortKey(s.pubkey)}
                        </div>
                        <div style={{ fontSize: 10, color: isCreator ? T.accent : T.green, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {isCreator ? tx.youCreated : tx.youReceive}
                          {s.milestoneCount > 0 && <span style={{ color: T.blue }}> · {tx.milestone(s.milestoneCount)}</span>}
                          {hasGameGate && <span style={{ color: '#c084fc' }}> · 🎮 Game Gate</span>}
                          <span style={{ color: T.textDim, fontFamily: 'monospace', fontSize: 9 }}>· {sym}</span>
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
                      <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text }}>
                        <div style={{ fontSize: 9, color: T.textDim, marginBottom: 2 }}>TOTAL</div>
                        {fmtTokens(s.amountTotal, dec)} <span style={{ fontSize: 9, color: T.textDim }}>{sym}</span>
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 12, color: withdrawn > 0 ? T.green : T.textDim }}>
                        <div style={{ fontSize: 9, color: T.textDim, marginBottom: 2 }}>CLAIMED</div>
                        {fmtRaw(withdrawn, dec)}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 12, color: claimable > 0 ? T.gold : T.textDim }}>
                        <div style={{ fontSize: 9, color: T.textDim, marginBottom: 2 }}>UNLOCKED</div>
                        {fmtRaw(claimable, dec)}
                      </div>
                    </div>

                    {/* These 3 are hidden on mobile (merged into sd-row-amounts above) */}
                    <div className="sd-col-hide">
                      <div style={{ fontFamily: T.mono, fontSize: 12, color: withdrawn > 0 ? T.green : T.textDim }}>{fmtRaw(withdrawn, dec)}</div>
                      <div style={{ fontSize: 9.5, color: T.textDim, marginTop: 1 }}>{total > 0 ? `${Math.round((withdrawn / total) * 100)}% withdrawn` : '—'}</div>
                    </div>
                    <div className="sd-col-hide">
                      <div style={{ fontFamily: T.mono, fontSize: 12, color: claimable > 0 ? T.gold : T.textDim }}>{fmtRaw(claimable, dec)}</div>
                      <div style={{ fontSize: 9.5, color: T.textDim, marginTop: 1 }}>claimable now</div>
                    </div>

                    {/* Time left */}
                    <div style={{ fontFamily: T.mono, fontSize: 11, color: status === 'active' ? T.blue : T.textDim }}>
                      {tLeft}
                    </div>

                    {/* Status — hidden on mobile (shown in meta row above) */}
                    <div className="sd-col-hide"><StatusDot status={status} /></div>
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

        {/* ── Quick Actions ── */}
        <div style={{ marginTop: 24, background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 22px' }}>
          <div style={{ fontFamily: T.serif, fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>{tx.quickTitle}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {([
              { ...tx.quickItems[0], col: T.accent },
              { ...tx.quickItems[1], col: T.green  },
              { ...tx.quickItems[2], col: T.blue   },
              { ...tx.quickItems[3], col: T.gold   },
              { ...tx.quickItems[4], col: T.textDim },
            ] as Array<{ label: string; desc: string; href: string; col: string }>).map(a => (
              <Link key={a.href} href={a.href} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 10, textDecoration: 'none', flex: '1 1 180px',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${a.col} 27%, transparent)`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.06)'; }}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.col, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{a.label}</div>
                  <div style={{ fontSize: 10.5, color: T.textDim }}>{a.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  getAllStreams,
  getStreamsByAuthority,
  getStreamsByBeneficiary,
  computeUnlocked,
  StreamInfo,
} from '@/lib/anchor/vesting-client';
import { getMint } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { withRpcFallback } from '@/lib/solana/rpc-manager';
import { KNOWN_DEVNET_TOKENS } from '@/lib/solana/token-registry';
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

// ── Fetch all public streams + merge user's own streams first ────────────────
async function fetchAllGlobal(conn: Connection): Promise<StreamInfo[]> {
  const all = await getAllStreams(conn);
  return all.sort((a, b) => Number(b.startTs.toString()) - Number(a.startTs.toString()));
}

async function fetchUserStreams(conn: Connection, walletKey: PublicKey): Promise<StreamInfo[]> {
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
  linear: T.accent, milestone: T.blue, cliff: T.gold, hybrid: '#c084fc',
};

function metaFor(mintB58: string, decByMint: Record<string, number>): { symbol: string; decimals: number } {
  const k = KNOWN_DEVNET_TOKENS[mintB58];
  if (k) return { symbol: k.symbol === 'wSOL' ? 'SOL' : k.symbol, decimals: k.decimals };
  return { symbol: `${mintB58.slice(0, 4)}…`, decimals: decByMint[mintB58] ?? 9 };
}

function fmtAmount(raw: number, decimals: number): string {
  const n = raw / 10 ** decimals;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}

function streamType(s: StreamInfo): string {
  const startTs = Number(s.startTs.toString());
  const cliffTs = Number(s.cliffTs.toString());
  const endTs   = Number(s.endTs.toString());
  const hasCliff = cliffTs > startTs;
  if (hasCliff && endTs - cliffTs <= 60) return 'cliff';
  if (hasCliff && s.milestoneCount > 0)  return 'hybrid';
  if (s.milestoneCount > 0)              return 'milestone';
  if (hasCliff)                          return 'hybrid';
  return 'linear';
}

function streamStatus(s: StreamInfo, nowSec: number): string {
  if (s.cancelled) return 'cancelled';
  if (nowSec < Number(s.cliffTs.toString())) return 'pending';
  if (nowSec >= Number(s.endTs.toString()))  return 'completed';
  return 'active';
}

function shortKey(pk: { toBase58(): string } | null): string {
  if (!pk) return '—';
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 700,
      letterSpacing: '.04em',
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      color, border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
    }}>{label}</span>
  );
}

function StatusDot({ status }: { status: string }) {
  const col = ({
    active: T.green, pending: T.gold, completed: T.textDim, cancelled: T.red,
  } as Record<string, string>)[status] ?? T.textDim;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: col, boxShadow: `0 0 6px ${col}` }} />
      <span style={{ fontSize: 10.5, color: col, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{status}</span>
    </div>
  );
}

// ─── Column layout ───────────────────────────────────────────────────────────
// Stream/Role | Type | Total Tokens | Creator/Team | Date Created | Status | Actions
const GRID = '2fr 80px 120px 140px 105px 85px 130px';

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
  .sd-col-hide { display: none !important; }
  .sd-actions-col { margin-top: 4px; }
}
`;

// ─── Copy-to-clipboard hook helper ──────────────────────────────────────────
function useCopy(): [Record<string, boolean>, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const copy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(p => ({ ...p, [key]: true }));
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1800);
    });
  }, []);
  return [copied, copy];
}

// ─── Small icon button ───────────────────────────────────────────────────────
function IconBtn({
  label, done, onClick, color = T.textDim,
}: { label: string; done?: boolean; onClick: (e: React.MouseEvent) => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        padding: '3px 8px', borderRadius: 6, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        background: done ? `color-mix(in srgb, ${color} 10%, transparent)` : 'rgba(255,255,255,.03)',
        color: done ? color : T.textDim, fontSize: 10, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap', transition: 'all .15s',
      }}
    >
      {done ? '✓ Copied' : label}
    </button>
  );
}

export default function StreamsPage() {
  const tx = I18N.streams;
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, doCopy] = useCopy();

  const [streams,   setStreams]   = useState<StreamInfo[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState<'all' | 'active' | 'pending' | 'completed' | 'cancelled'>('all');
  const [nowSec,    setNowSec]    = useState(Math.floor(Date.now() / 1000));
  const [decByMint, setDecByMint] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (publicKey) {
        const [all, mine] = await Promise.all([
          withRpcFallback(conn => fetchAllGlobal(conn)).catch(() => [] as StreamInfo[]),
          withRpcFallback(conn => fetchUserStreams(conn, publicKey)).catch(() => [] as StreamInfo[]),
        ]);
        const myKeys = new Set(mine.map(s => s.pubkey.toBase58()));
        const rest   = all.filter(s => !myKeys.has(s.pubkey.toBase58()));
        setStreams([...mine, ...rest]);
      } else {
        const all = await withRpcFallback(conn => fetchAllGlobal(conn)).catch(() => [] as StreamInfo[]);
        setStreams(all);
      }
    } catch { setStreams([]); }
    finally  { setLoading(false); }
  }, [publicKey]);

  useEffect(() => { load(); }, [load]);

  // Fetch real decimals for unknown mints
  useEffect(() => {
    const unknown = [...new Set(streams.map(s => s.mint.toBase58()))]
      .filter(m => !KNOWN_DEVNET_TOKENS[m] && decByMint[m] === undefined);
    if (unknown.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, number> = {};
      for (const m of unknown) {
        try {
          const info = await withRpcFallback(c => getMint(c, new PublicKey(m)));
          updates[m] = info.decimals;
        } catch { updates[m] = 9; }
      }
      if (!cancelled) setDecByMint(prev => ({ ...prev, ...updates }));
    })();
    return () => { cancelled = true; };
  }, [streams, decByMint]);

  const filtered = streams.filter(s => {
    if (filter === 'all') return true;
    return streamStatus(s, nowSec) === filter;
  });

  // KPI totals grouped by symbol
  const lockedBySymbol:    Record<string, number> = {};
  const withdrawnBySymbol: Record<string, number> = {};
  for (const s of streams) {
    const m = metaFor(s.mint.toBase58(), decByMint);
    lockedBySymbol[m.symbol]    = (lockedBySymbol[m.symbol]    ?? 0) + Number(s.amountTotal.toString())     / 10 ** m.decimals;
    withdrawnBySymbol[m.symbol] = (withdrawnBySymbol[m.symbol] ?? 0) + Number(s.amountWithdrawn.toString()) / 10 ** m.decimals;
  }
  const fmtTotal = (bySym: Record<string, number>): string => {
    const syms = Object.keys(bySym);
    if (syms.length === 0) return '0.00';
    if (syms.length === 1) return `${bySym[syms[0]].toFixed(2)} ${syms[0]}`;
    return syms.map(s => `${bySym[s].toFixed(2)} ${s}`).join(' · ');
  };
  const activeCount         = streams.filter(s => streamStatus(s, nowSec) === 'active').length;
  const totalLockedLabel    = fmtTotal(lockedBySymbol);
  const totalWithdrawnLabel = fmtTotal(withdrawnBySymbol);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://blockbite.vercel.app';

  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: MOBILE_CSS }} />

      {/* ── Header ── */}
      <div style={{ padding: '80px 24px 32px', background: T.header, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>
            {tx.badge}
          </div>
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
            { label: tx.kpi.streams, value: String(streams.length),   sub: tx.kpi.streamsSub, color: T.accent },
            { label: tx.kpi.active,  value: String(activeCount),       sub: tx.kpi.activeSub,  color: T.green  },
            { label: tx.kpi.locked,  value: totalLockedLabel,          sub: tx.kpi.lockedSub,  color: T.gold   },
            { label: tx.kpi.claimed, value: totalWithdrawnLabel,       sub: tx.kpi.claimedSub, color: T.blue   },
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
          <div style={{
            background: `color-mix(in srgb, ${T.accent} 5%, transparent)`,
            border: `1px solid color-mix(in srgb, ${T.accent} 18%, transparent)`,
            borderRadius: 12, padding: '14px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <span style={{ fontSize: 13, color: T.textDim }}>
              {'Connect wallet to highlight your streams + create a new one'}
            </span>
            <button
              onClick={() => setVisible(true)}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: T.grad, color: T.text, fontWeight: 700, fontSize: 12 }}
            >
              {'Connect Wallet'}
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim, fontSize: 13 }}>
            {tx.loadingMsg}
          </div>
        )}

        {/* ── Streams table ── */}
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
              {/* Table header */}
              <div className="sd-table-header" style={{
                display: 'grid', gridTemplateColumns: GRID,
                padding: '10px 20px', borderBottom: `1px solid ${T.border}`,
                background: 'rgba(255,255,255,.03)',
              }}>
                {[...tx.headers, 'ACTIONS'].map(h => (
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

              {/* Rows */}
              {filtered.map((s, i) => {
                const type    = streamType(s);
                const status  = streamStatus(s, nowSec);
                const typeCol = TYPE_COLORS[type] ?? T.accent;
                const meta    = metaFor(s.mint.toBase58(), decByMint);
                const total   = Number(s.amountTotal.toString());
                const href    = `/streams/${s.pubkey.toBase58()}`;
                const isOwner = publicKey && s.authority.toBase58() === publicKey.toBase58();
                const isUser  = publicKey && (
                  s.authority.toBase58() === publicKey.toBase58() ||
                  s.beneficiary.toBase58() === publicKey.toBase58()
                );
                const canCancel = isOwner && !s.cancelled && (status === 'active' || status === 'pending');
                const streamUrl  = `${origin}/streams/${s.pubkey.toBase58()}`;
                const mintAddr   = s.mint.toBase58();
                const linkKey    = `link-${s.pubkey.toBase58()}`;
                const mintKey    = `mint-${s.pubkey.toBase58()}`;

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
                    {/* Col 1: Stream / Role */}
                    <div className="sd-row-meta">
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text, marginBottom: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {shortKey(s.pubkey)}
                          {isUser && (
                            <span style={{
                              fontSize: 9, background: `color-mix(in srgb, ${T.accent} 15%, transparent)`,
                              color: T.accent, padding: '1px 5px', borderRadius: 4,
                            }}>
                              {isOwner ? ('YOU') : ('RCPT')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.textDim }}>
                          → {shortKey(s.beneficiary)}
                          {s.milestoneCount > 0 && <span style={{ color: T.blue, marginLeft: 4 }}>· {s.milestoneCount} milestone</span>}
                        </div>
                      </div>
                      {/* Mobile: type + status inline */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge label={type.toUpperCase()} color={typeCol} />
                        <StatusDot status={status} />
                      </div>
                    </div>

                    {/* Col 2: Type (hidden on mobile) */}
                    <div className="sd-col-hide"><Badge label={type.toUpperCase()} color={typeCol} /></div>

                    {/* Col 3: Total Tokens */}
                    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text, fontWeight: 600 }}>
                      {fmtAmount(total, meta.decimals)}
                      <span style={{ color: T.textDim, fontSize: 10, marginLeft: 3 }}>{meta.symbol}</span>
                    </div>

                    {/* Col 4: Creator / Team */}
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: isOwner ? T.accent : T.textDim }}>
                      {shortKey(s.authority)}
                    </div>

                    {/* Col 5: Date Created */}
                    <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.textDim }}>
                      {new Date(Number(s.startTs.toString()) * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>

                    {/* Col 6: Status */}
                    <div><StatusDot status={status} /></div>

                    {/* Col 7: Actions — stopPropagation so row click doesn't fire */}
                    <div
                      className="sd-actions-col"
                      style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        title={'Open detail & claim tokens'}
                        onClick={e => { e.stopPropagation(); router.push(href); }}
                        style={{
                          padding: '3px 10px', borderRadius: 6,
                          border: `1px solid color-mix(in srgb, ${T.accent} 35%, transparent)`,
                          background: `color-mix(in srgb, ${T.accent} 10%, transparent)`,
                          color: T.accent, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {'View →'}
                      </button>
                      <IconBtn
                        label={'⎘ Copy Link'}
                        done={copied[linkKey]}
                        color={T.accent}
                        onClick={() => doCopy(linkKey, streamUrl)}
                      />
                      <IconBtn
                        label={'◈ Copy CA'}
                        done={copied[mintKey]}
                        color={T.gold}
                        onClick={() => doCopy(mintKey, mintAddr)}
                      />
                      {canCancel && (
                        <button
                          title={'Cancel this stream'}
                          onClick={e => { e.stopPropagation(); router.push(`${href}#cancel`); }}
                          style={{
                            padding: '3px 8px', borderRadius: 6,
                            border: `1px solid color-mix(in srgb, ${T.red} 28%, transparent)`,
                            background: `color-mix(in srgb, ${T.red} 6%, transparent)`,
                            color: T.red, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {'✕ Cancel'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.border}`, background: 'rgba(255,255,255,.02)', fontSize: 11, color: T.textDim }}>
                {tx.tableFooter}
                {streams.length > 0 && (
                  <button onClick={load} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 11 }}>
                    {'↻ Refresh'}
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

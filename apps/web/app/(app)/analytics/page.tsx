'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useConnection } from '@solana/wallet-adapter-react';
import {
  getAllStreams,
  computeUnlocked,
  StreamInfo,
} from '@blockbite/clients';
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '16px 20px', ...style }}>
      {children}
    </div>
  );
}

function streamType(s: StreamInfo): string {
  const cliff  = Number(s.cliffTs.toString());
  const start  = Number(s.startTs.toString());
  const hasMilestone = (s.milestoneCount ?? 0) > 0;
  const hasCliff     = cliff > start;
  if (hasMilestone && hasCliff) return 'hybrid';
  if (hasMilestone) return 'milestone';
  if (hasCliff) return 'cliff';
  return 'linear';
}

function streamStatus(s: StreamInfo, nowSec: number): string {
  if (s.cancelled) return 'cancelled';
  if (nowSec < Number(s.cliffTs.toString())) return 'pending';
  if (nowSec >= Number(s.endTs.toString())) return 'completed';
  return 'active';
}

export default function AnalyticsPage() {
  const { lang } = useApp();
  const tx = I18N.analytics[lang];

  const { connection } = useConnection();
  const [streams,  setStreams]  = useState<StreamInfo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [period,   setPeriod]   = useState('all');
  const nowSec = Math.floor(Date.now() / 1000);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await getAllStreams(connection);
      setStreams(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RPC error');
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => { load(); }, [load]);

  // ── Real aggregate metrics ──────────────────────────────────────────────────
  const totalLocked     = streams.reduce((a, s) => a + Number(s.amountTotal.toString()), 0) / 1e6;
  const totalWithdrawn  = streams.reduce((a, s) => a + Number(s.amountWithdrawn.toString()), 0) / 1e6;
  const totalClaimable  = streams.reduce((a, s) => a + Number(computeUnlocked(s, nowSec)), 0) / 1e6;
  const activeStreams   = streams.filter(s => streamStatus(s, nowSec) === 'active');
  const cancelledCount  = streams.filter(s => s.cancelled).length;

  // Type breakdown — real counts
  const typeCounts = streams.reduce((acc, s) => {
    const t = streamType(s);
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const total = streams.length || 1;
  const typeBreakdown = [
    { type: 'Linear',    pct: Math.round((typeCounts.linear ?? 0) / total * 100),    col: T.accent, n: typeCounts.linear ?? 0 },
    { type: 'Milestone', pct: Math.round((typeCounts.milestone ?? 0) / total * 100), col: T.blue,   n: typeCounts.milestone ?? 0 },
    { type: 'Cliff',     pct: Math.round((typeCounts.cliff ?? 0) / total * 100),     col: T.gold,   n: typeCounts.cliff ?? 0 },
    { type: 'Hybrid',    pct: Math.round((typeCounts.hybrid ?? 0) / total * 100),    col: '#c084fc', n: typeCounts.hybrid ?? 0 },
  ];

  // Top 6 by locked amount
  const topStreams = [...streams]
    .sort((a, b) => Number(b.amountTotal.toString()) - Number(a.amountTotal.toString()))
    .slice(0, 6);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text }}>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(88px,12vw,108px) clamp(16px,5vw,40px) 80px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>
            {tx.badge}
          </div>
          <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(24px,5vw,36px)', fontWeight: 800, color: T.text, margin: 0 }}>
            {tx.title}
          </h1>
          <p style={{ fontSize: 12.5, color: T.textDim, margin: '6px 0 0' }}>
            {tx.subtitle}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3 }}>
            {(['7d', '30d', '90d', 'all'] as const).map(p => (
              <button type="button" key={p} onClick={() => setPeriod(p)} style={{
                padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: period === p ? T.accent : 'transparent',
                color: period === p ? T.text : T.textDim,
                fontSize: 11, fontWeight: 600, fontFamily: T.serif,
              }}>{p}</button>
            ))}
          </div>
          <button type="button" onClick={load} style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: T.accent, cursor: 'pointer', fontSize: 12, fontFamily: T.serif }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: '16px 40px', background: T.redA1, border: `1px solid ${T.red}`, borderRadius: 10, padding: '12px 16px', fontSize: 12, color: T.red }}>
          RPC error: {error} — data may be stale.
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 40px', color: T.textDim, fontSize: 13 }}>
          {tx.loading}
        </div>
      )}

      {!loading && (
        <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── KPI row — REAL numbers ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
            {[
              { label: 'Total Streams',      val: String(streams.length),                        sub: 'on devnet program',         col: T.accent },
              { label: 'Active Streams',     val: String(activeStreams.length),                   sub: 'currently unlocking',       col: T.green  },
              { label: 'Total Locked',       val: totalLocked.toFixed(2),                         sub: 'TOKEN across all streams',  col: T.gold   },
              { label: 'Total Withdrawn',    val: totalWithdrawn.toFixed(2),                      sub: 'claimed by beneficiaries',  col: T.blue   },
              { label: 'Currently Claimable',val: totalClaimable.toFixed(2),                      sub: 'TOKEN available now',       col: T.green  },
            ].map(s => (
              <Card key={s.label} style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 9.5, color: T.textDim, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontFamily: T.mono, fontSize: s.val.length > 10 ? 16 : 22, fontWeight: 700, color: s.col, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>{s.sub}</div>
              </Card>
            ))}
          </div>

          {/* ── Stream types + secondary stats ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card>
              <div style={{ fontFamily: T.serif, fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Stream Types</div>
              {streams.length === 0 ? (
                <div style={{ fontSize: 12, color: T.textDim, padding: '20px 0', textAlign: 'center' }}>No streams on devnet yet</div>
              ) : (
                typeBreakdown.map(s => (
                  <div key={s.type} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.col }} />
                        <span style={{ fontSize: 12, color: T.text }}>{s.type}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontFamily: T.mono, fontSize: 12, color: s.col, fontWeight: 700 }}>{s.pct}%</span>
                        <span style={{ fontSize: 10, color: T.textDim, marginLeft: 5 }}>({s.n})</span>
                      </div>
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s.pct}%`, borderRadius: 99, background: `linear-gradient(90deg,${s.col}77,${s.col})` }} />
                    </div>
                  </div>
                ))
              )}
            </Card>

            <Card>
              <div style={{ fontFamily: T.serif, fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Status Breakdown</div>
              {[
                { label: 'Active',     col: T.green,   n: activeStreams.length },
                { label: 'Pending',    col: T.gold,    n: streams.filter(s => streamStatus(s, nowSec) === 'pending').length },
                { label: 'Completed',  col: T.textDim, n: streams.filter(s => streamStatus(s, nowSec) === 'completed').length },
                { label: 'Cancelled',  col: T.red,     n: cancelledCount },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.col, boxShadow: `0 0 4px ${s.col}` }} />
                    <span style={{ fontSize: 12, color: T.text }}>{s.label}</span>
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: s.col }}>{s.n}</span>
                </div>
              ))}
            </Card>
          </div>

          {/* ── Top streams table ── */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, fontFamily: T.serif, fontSize: 13, fontWeight: 700, color: T.text }}>
              {streams.length === 0 ? 'No streams yet' : `Top ${topStreams.length} streams by locked amount`}
            </div>
            {streams.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: T.textDim, fontSize: 13 }}>
                No streams found on devnet. <Link href="/new" style={{ color: T.accent }}>Create the first one →</Link>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                    {['Stream PDA', 'Type', 'Authority', 'Total Locked', 'Withdrawn', 'Claimable', 'Status'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 9.5, color: T.textDim, letterSpacing: '.06em', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topStreams.map((s, i) => {
                    const type    = streamType(s);
                    const status  = streamStatus(s, nowSec);
                    const typeCol = ({ linear: T.accent, milestone: T.blue, cliff: T.gold, hybrid: '#c084fc' } as Record<string, string>)[type] ?? T.accent;
                    const statCol = ({ active: T.green, pending: T.gold, completed: T.textDim, cancelled: T.red } as Record<string, string>)[status] ?? T.textDim;
                    const claimable = Number(computeUnlocked(s, nowSec)) / 1e6;

                    return (
                      <tr key={s.pubkey.toBase58()} style={{ borderTop: `1px solid ${T.border}`, background: i % 2 ? 'rgba(255,255,255,.01)' : 'transparent' }}>
                        <td style={{ padding: '9px 16px', fontFamily: T.mono, fontSize: 10, color: T.textDim }}>{s.pubkey.toBase58().slice(0, 8)}…</td>
                        <td style={{ padding: '9px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700, background: T.accentA2, border: `1px solid ${T.accentA4}`, color: typeCol, fontFamily: T.mono }}>
                            {type.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '9px 16px', fontFamily: T.mono, fontSize: 10, color: T.textDim }}>
                          {s.authority.toBase58().slice(0, 6)}…{s.authority.toBase58().slice(-4)}
                        </td>
                        <td style={{ padding: '9px 16px', fontFamily: T.mono, fontSize: 11, color: T.text }}>
                          {(Number(s.amountTotal.toString()) / 1e6).toFixed(2)}
                        </td>
                        <td style={{ padding: '9px 16px', fontFamily: T.mono, fontSize: 11, color: T.accent }}>
                          {(Number(s.amountWithdrawn.toString()) / 1e6).toFixed(2)}
                        </td>
                        <td style={{ padding: '9px 16px', fontFamily: T.mono, fontSize: 11, color: claimable > 0 ? T.green : T.textDim }}>
                          {claimable.toFixed(2)}
                        </td>
                        <td style={{ padding: '9px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: statCol, boxShadow: `0 0 5px ${statCol}` }} />
                            <span style={{ fontSize: 10.5, color: statCol, fontWeight: 600, textTransform: 'uppercase' }}>{status}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {/* ── No data CTA ── */}
          {streams.length === 0 && (
            <Card style={{ textAlign: 'center', padding: '32px 24px' }}>
              <div style={{ fontSize: 13, color: T.textDim, marginBottom: 12 }}>
                No streams on devnet yet. Be the first to create one, or explore simulated data.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <Link href="/new" style={{ padding: '9px 20px', borderRadius: 10, background: T.grad, color: T.text, fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
                  Create Stream
                </Link>
                <Link href="/demo#analytics" style={{ padding: '9px 20px', borderRadius: 10, background: 'rgba(255,255,255,.06)', color: T.textDim, fontWeight: 600, fontSize: 12, textDecoration: 'none', border: `1px solid ${T.border}` }}>
                  View Demo
                </Link>
              </div>
            </Card>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

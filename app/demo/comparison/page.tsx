'use client';

/**
 * /demo/comparison — Standalone Protocol Comparison Page
 *
 * ⚠  PASAL 207 COMPLIANCE NOTICE ⚠
 * All competitor claims are UNVERIFIED and sourced from public documentation.
 * This page exists under /demo to clearly separate unverified claims from
 * production protocol data. Must NOT appear as a real feature page.
 */

import Link from 'next/link';
import Navbar from '@/components/Navbar';

const C = {
  bg0: '#05040d', bg1: '#09071a', bg2: '#0e0c22',
  accent: '#a78bff', gold: '#f5c66a', green: '#5fd07a',
  red: '#ff3b6b', blue: '#7ad7ff', muted: 'rgba(232,225,248,.38)',
  border: 'rgba(167,139,255,.13)', card: 'rgba(255,255,255,.042)',
  sora: "'Sora',system-ui,sans-serif",
  mono: "'JetBrains Mono',monospace",
  sg: "'Space Grotesk',system-ui,sans-serif",
};

const FULL_4 = [
  { feature: 'Milestone Unlock',     bb: true,  sablier: false, superfluid: false, streamflow: false },
  { feature: 'Fully Automated',      bb: true,  sablier: false, superfluid: false, streamflow: false },
  { feature: 'Game Verification',    bb: true,  sablier: false, superfluid: false, streamflow: false },
  { feature: 'Oracle Data Feed',     bb: true,  sablier: false, superfluid: false, streamflow: true  },
  { feature: 'Cliff + Linear',       bb: true,  sablier: true,  superfluid: false, streamflow: true  },
  { feature: 'On-chain Enforcement', bb: true,  sablier: true,  superfluid: true,  streamflow: true  },
  { feature: 'Anti-dump by Default', bb: true,  sablier: false, superfluid: false, streamflow: false },
];

const PROTO_3 = [
  { feat: 'Linear Vesting',   bb: true, sab: true,  sf: true  },
  { feat: 'Cliff Schedule',   bb: true, sab: true,  sf: false },
  { feat: 'Milestone Unlock', bb: true, sab: false, sf: false },
  { feat: 'Hybrid Model',     bb: true, sab: false, sf: false },
  { feat: 'In-game Rewards',  bb: true, sab: false, sf: false },
  { feat: 'NFT Stream Proof', bb: true, sab: true,  sf: false },
  { feat: 'Multi-token',      bb: true, sab: false, sf: true  },
  { feat: 'Cancel & Modify',  bb: true, sab: true,  sf: true  },
  { feat: 'Dashboard UI',     bb: true, sab: true,  sf: true  },
];

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `2fr ${cols.slice(1).map(() => '1fr').join(' ')}`,
      padding: '12px 20px',
      background: 'rgba(255,255,255,.03)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      {cols.map((h, i) => (
        <div key={i} style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '1.2px',
          textTransform: 'uppercase', fontFamily: C.mono,
          color: i === 1 ? C.accent : C.muted,
          textAlign: i === 0 ? 'left' : 'center',
        }}>
          {h}
        </div>
      ))}
    </div>
  );
}

export default function ComparisonPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg0, color: '#f0ecff', fontFamily: C.sora, paddingBottom: 80 }}>
      <Navbar />

      {/* ── DEMO BANNER ── */}
      <div style={{
        marginTop: 64,
        background: `linear-gradient(135deg, ${C.gold}22, #ff7a3a18)`,
        border: `2px solid ${C.gold}55`,
        padding: '18px clamp(20px,5vw,40px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            padding: '6px 14px', borderRadius: 8, fontWeight: 900, fontSize: 12,
            background: C.gold, color: '#0b0918', letterSpacing: '2px',
          }}>⚠ DEMO MODE</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.gold }}>
              Unverified Competitor Claims — Not Legal Statements
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Pasal 207 compliance: sourced from public docs as of 2026-05-26 · Not for marketing use ·{' '}
              <Link href="/demo" style={{ color: C.accent }}>← Back to Demo</Link>
            </div>
          </div>
        </div>
        <Link href="/" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ← Back to App
        </Link>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(40px,6vw,64px) clamp(16px,5vw,40px) 0' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: '2px',
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            DEMO · UNVERIFIED COMPARATIVE CLAIMS
          </div>
          <h1 style={{ fontFamily: C.sg, fontSize: 'clamp(26px,5vw,38px)', fontWeight: 900, margin: '0 0 14px', color: '#fff' }}>
            Protocol Comparison
          </h1>
          <p style={{ fontSize: 14, color: C.muted, maxWidth: 580, lineHeight: 1.7, margin: 0 }}>
            How BlockBite TDP compares to other token distribution protocols.
            All claims are based on publicly available documentation and have
            not been independently verified.
          </p>
        </div>

        {/* ── Disclaimer banner ── */}
        <div style={{
          padding: '14px 20px', borderRadius: 12, marginBottom: 40,
          background: `${C.gold}0f`, border: `1px solid ${C.gold}44`,
          fontSize: 13, color: C.gold, lineHeight: 1.75,
        }}>
          <b>⚠ Disclaimer:</b> Claims about Sablier v2, Superfluid, and Streamflow are based on
          publicly available documentation as of 2026-05-26 and have not been independently verified.
          Competitor features may have changed. These comparisons must not be used in marketing
          materials or public statements without current verification.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>

          {/* ── 4-Protocol Table ── */}
          <section>
            <div style={{ fontFamily: C.sg, fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Full Feature Overview — 4 Protocols
            </div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
              BlockBite TDP vs Sablier v2, Superfluid, Streamflow
            </p>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <TableHeader cols={['Feature', 'BlockBite TDP', 'Sablier v2', 'Superfluid', 'Streamflow']} />
              {FULL_4.map((row, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  padding: '13px 20px',
                  background: i % 2 === 0 ? C.card : 'transparent',
                  borderBottom: i < FULL_4.length - 1 ? `1px solid ${C.border}` : 'none',
                  alignItems: 'center',
                }}>
                  <div style={{ fontSize: 13, color: '#f0ecff', fontWeight: 500 }}>{row.feature}</div>
                  {([row.bb, row.sablier, row.superfluid, row.streamflow] as boolean[]).map((val, j) => (
                    <div key={j} style={{ textAlign: 'center' }}>
                      {val
                        ? <span style={{ color: j === 0 ? C.green : 'rgba(95,208,122,.5)', fontSize: 17 }}>✓</span>
                        : <span style={{ color: 'rgba(255,59,107,.35)', fontSize: 17 }}>✗</span>
                      }
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* ── 3-Protocol Table ── */}
          <section>
            <div style={{ fontFamily: C.sg, fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Protocol-Level Detail — 3 Protocols
            </div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
              BlockBite TDP vs Sablier v2 vs Superfluid
            </p>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <TableHeader cols={['Feature', 'BlockBite TDP', 'Sablier v2', 'Superfluid']} />
              {PROTO_3.map((row, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                  padding: '13px 20px',
                  background: i % 2 === 0 ? C.card : 'transparent',
                  borderBottom: i < PROTO_3.length - 1 ? `1px solid ${C.border}` : 'none',
                  alignItems: 'center',
                }}>
                  <div style={{ fontSize: 13, color: '#f0ecff', fontWeight: 500 }}>{row.feat}</div>
                  {([row.bb, row.sab, row.sf] as boolean[]).map((val, j) => (
                    <div key={j} style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 17,
                        color: val ? (j === 0 ? C.green : 'rgba(148,163,184,.6)') : 'rgba(255,255,255,.12)',
                      }}>
                        {val ? '✓' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* ── Source note ── */}
          <div style={{
            padding: '16px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
            fontSize: 12, color: C.muted, lineHeight: 1.7,
          }}>
            <b style={{ color: 'rgba(232,225,248,.6)' }}>Source:</b> Public documentation of each protocol as of 2026-05-26.
            BlockBite makes no legal warranty these assessments are current or complete.
            This page exists under <code style={{ color: C.accent, fontFamily: C.mono, fontSize: 11 }}>/demo</code> to
            comply with Pasal 207 consumer protection requirements — unverified claims
            are isolated from the production application.
          </div>

        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop: 64, padding: '22px clamp(20px,5vw,40px)',
        borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, fontSize: 12, color: C.muted,
      }}>
        <div>
          <span style={{
            background: C.gold, color: '#0b0918', padding: '2px 8px', borderRadius: 4,
            fontWeight: 900, fontSize: 10, letterSpacing: '1.5px', marginRight: 10,
          }}>DEMO</span>
          Unverified competitor data · Pasal 207 compliant · Not for marketing use
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/demo"     style={{ color: C.accent, textDecoration: 'none' }}>Full Demo</Link>
          <Link href="/protocol" style={{ color: C.accent, textDecoration: 'none' }}>Protocol</Link>
          <Link href="/streams"  style={{ color: C.accent, textDecoration: 'none' }}>Real Streams</Link>
          <Link href="/"         style={{ color: C.muted,  textDecoration: 'none' }}>← Home</Link>
        </div>
      </div>
    </div>
  );
}

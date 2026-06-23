'use client';

import Link from 'next/link';

const C = {
  bg0: 'var(--p-bg0)', bg1: 'var(--p-bg1)', bg2: 'var(--p-bg2)',
  accent: '#a78bff', gold: '#f5c66a', green: '#5fd07a',
  red: '#ff3b6b', blue: '#7ad7ff', muted: 'var(--p-muted)',
  border: 'var(--p-border)', card: 'rgba(255,255,255,.042)',
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

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(100px,10vw,120px) clamp(16px,5vw,40px) 0' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontFamily: C.sg, fontSize: 'clamp(26px,5vw,38px)', fontWeight: 900, margin: '0 0 14px', color: '#fff' }}>
            Protocol Comparison
          </h1>
          <p style={{ fontSize: 14, color: C.muted, maxWidth: 580, lineHeight: 1.7, margin: 0 }}>
            How BlockBite TDP compares to other token distribution protocols.
          </p>
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

        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        marginTop: 64, padding: '22px clamp(20px,5vw,40px)',
        borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12, fontSize: 12, color: C.muted,
      }}>
        <div>Protocol Comparison · BlockBite TDP</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/protocol" style={{ color: C.accent, textDecoration: 'none' }}>Protocol</Link>
          <Link href="/streams"  style={{ color: C.accent, textDecoration: 'none' }}>Real Streams</Link>
          <Link href="/"         style={{ color: C.muted,  textDecoration: 'none' }}>← Home</Link>
        </div>
      </div>
    </div>
  );
}

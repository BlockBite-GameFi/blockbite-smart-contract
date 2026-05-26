'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

// ─── Design tokens (matches _shared palette) ─────────────────────────────────
const C = {
  accent:   '#a78bfa',
  accentDk: '#5e35d4',
  gold:     '#f5c66a',
  green:    '#5fd07a',
  blue:     '#7ad7ff',
  ember:    '#ff7a3a',
  purple:   '#c084fc',
  muted:    'rgba(148,163,184,.7)',
  border:   'rgba(167,139,250,.15)',
  bg0:      '#05040d',
  bg1:      '#09071a',
  bg2:      '#0f0d1e',
  serif:    "'Space Grotesk', system-ui, sans-serif",
  mono:     "'JetBrains Mono', monospace",
} as const;

// ─── Stream type definitions ──────────────────────────────────────────────────
const TYPES = [
  {
    href:    '/streams/new/linear',
    icon:    '📈',
    label:   'Linear',
    color:   C.accent,
    tagline: 'Smooth continuous unlock',
    desc:    'Tokens release proportionally over time, every second. Ideal for team allocations, advisors, and contributors.',
    traits:  ['Continuous unlock', 'Cliff optional', 'Per-second rate', 'Cancelable'],
    use:     'Best for: Team salaries, contributor grants, long-term investor allocations',
  },
  {
    href:    '/streams/new/cliff',
    icon:    '🪨',
    label:   'Cliff',
    color:   C.gold,
    tagline: 'All tokens, one unlock date',
    desc:    'Every token stays locked until the cliff date. Nothing before, 100% after. Maximum commitment signal.',
    traits:  ['Hard lock', 'Instant release', 'Single date', 'Pre-TGE ready'],
    use:     'Best for: Investor lockups, pre-TGE agreements, treasury reserves',
  },
  {
    href:    '/streams/new/milestone',
    icon:    '🏁',
    label:   'Milestone',
    color:   C.blue,
    tagline: 'Performance-gated release',
    desc:    'Creator triggers on-chain milestone events. Each verified milestone unlocks a defined % of the total allocation.',
    traits:  ['Up to 4 gates', 'On-chain verify', 'Custom % per gate', 'Not time-based'],
    use:     'Best for: KPI-based incentives, product milestone bonuses, ecosystem grants',
  },
  {
    href:    '/streams/new/hybrid',
    icon:    '⚡',
    label:   'Hybrid',
    color:   C.purple,
    tagline: 'Cliff + milestone + linear',
    desc:    'The most flexible model. Combine cliff, milestone gates, and linear vesting into a single PDA vault contract.',
    traits:  ['All mechanics', 'Custom split', 'Linear remainder', 'Max control'],
    use:     'Best for: Protocol treasuries, complex incentive structures, multi-condition releases',
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewStreamTypePicker() {
  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
      <Navbar />

      {/* Header */}
      <div style={{
        padding: '80px 32px 36px',
        background: 'linear-gradient(180deg,#0a0820 0%,#05040d 100%)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/streams" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 18,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.02)',
          }}>← Back to Streams</Link>

          <h1 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, margin: '0 0 10px', color: '#fff' }}>
            Choose Stream Type
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0, lineHeight: 1.6, maxWidth: 560 }}>
            Select a vesting mechanic. Each creates a Solana PDA vault with different unlock conditions.
            All support the BlockBite Game Gate for level-based recipient requirements.
          </p>
        </div>
      </div>

      {/* Type cards grid */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 32px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 20 }}>
          {TYPES.map(t => (
            <Link key={t.href} href={t.href} style={{ textDecoration: 'none' }}>
              <div style={{
                background: C.bg1,
                border: `1.5px solid ${C.border}`,
                borderRadius: 20,
                padding: '26px 26px',
                display: 'flex', flexDirection: 'column', gap: 16,
                cursor: 'pointer', transition: 'all .2s',
                height: '100%',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.border = `1.5px solid ${t.color}66`;
                el.style.background = `color-mix(in srgb, ${C.bg1}, ${t.color} 3%)`;
                el.style.transform = 'translateY(-3px)';
                el.style.boxShadow = `0 8px 32px ${t.color}18`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.border = `1.5px solid ${C.border}`;
                el.style.background = C.bg1;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = 'none';
              }}
              >
                {/* Icon + label row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: `${t.color}14`, border: `1.5px solid ${t.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24,
                  }}>{t.icon}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-.01em' }}>
                      {t.label} Vesting
                    </div>
                    <div style={{ fontSize: 12, color: t.color, fontWeight: 600, marginTop: 2 }}>
                      {t.tagline}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, margin: 0 }}>
                  {t.desc}
                </p>

                {/* Trait pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {t.traits.map(trait => (
                    <div key={trait} style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: `${t.color}0f`, border: `1px solid ${t.color}33`, color: t.color,
                    }}>{trait}</div>
                  ))}
                </div>

                {/* Use case */}
                <div style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: `${t.color}08`, border: `1px solid ${t.color}1a`,
                  fontSize: 11.5, color: C.muted, lineHeight: 1.5,
                }}>
                  <span style={{ color: t.color, fontWeight: 700 }}>Use case: </span>
                  {t.use.replace('Best for: ', '')}
                </div>

                {/* CTA */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 'auto',
                }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Create stream →</span>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9,
                    background: `${t.color}14`, border: `1px solid ${t.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}>→</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom note */}
        <div style={{
          marginTop: 36, padding: '14px 18px', borderRadius: 12,
          background: `${C.accent}08`, border: `1px solid ${C.accent}22`,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🎮</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e1f8', marginBottom: 3 }}>
              All stream types support BlockBite Game Gate
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Any stream can require the recipient to complete BlockBite levels 1–50 before unlocking.
              Level tier ranges: Beginner (1–10) · Intermediate (11–25) · Advanced (26–40) · Expert (41–50)
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

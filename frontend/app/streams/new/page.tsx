'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { T } from '@/lib/theme';
import { useApp } from '@/lib/useApp';

// ─── Design tokens — all structural colors use CSS vars ──────────────────────
const C = {
  accent:  T.accent,
  gold:    T.gold,
  green:   T.green,
  blue:    T.blue,
  purple:  T.accent,  // secondary accent
  muted:   T.textDim,
  border:  T.border,
  bg0:     T.bg,
  bg1:     T.bg1,
  bg2:     T.bg2,
  serif:   T.serif,
  mono:    T.mono,
} as const;

// ─── Stream type definitions ──────────────────────────────────────────────────
const TYPES = [
  {
    href:    '/streams/new/linear',
    icon:    '∿',
    label:   'Linear',
    color:   C.accent,
    tagline: 'Smooth continuous unlock',
    desc:    'Tokens release proportionally over time, every second. Ideal for team allocations, advisors, and contributors.',
    traits:  ['Continuous unlock', 'Cliff optional', 'Per-second rate', 'Cancelable'],
    use:     'Best for: Team salaries, contributor grants, long-term investor allocations',
  },
  {
    href:    '/streams/new/cliff',
    icon:    '⌐',
    label:   'Cliff',
    color:   C.gold,
    tagline: 'All tokens, one unlock date',
    desc:    'Every token stays locked until the cliff date. Nothing before, 100% after. Maximum commitment signal.',
    traits:  ['Hard lock', 'Instant release', 'Single date', 'Pre-TGE ready'],
    use:     'Best for: Investor lockups, pre-TGE agreements, treasury reserves',
  },
  {
    href:    '/streams/new/milestone',
    icon:    '◎',
    label:   'Milestone',
    color:   C.blue,
    tagline: 'Performance-gated release',
    desc:    'Creator triggers on-chain milestone events. Each verified milestone unlocks a defined % of the total allocation.',
    traits:  ['Up to 4 gates', 'On-chain verify', 'Custom % per gate', 'Not time-based'],
    use:     'Best for: KPI-based incentives, product milestone bonuses, ecosystem grants',
  },
  {
    href:    '/streams/new/hybrid',
    icon:    '◆',
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
  const { lang } = useApp();
  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: T.text, fontFamily: C.serif }}>
      <Navbar />

      {/* Header */}
      <div style={{
        padding: '80px 32px 36px',
        background: T.header,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/streams" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 18,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.02)',
          }}>{lang === 'id' ? '← Kembali ke Stream' : '← Back to Streams'}</Link>

          <h1 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, margin: '0 0 10px', color: T.text }}>
            {lang === 'id' ? 'Pilih Tipe Stream' : 'Choose Stream Type'}
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0, lineHeight: 1.6, maxWidth: 560 }}>
            {lang === 'id'
              ? 'Pilih mekanisme vesting. Setiap stream membuat PDA vault Solana dengan kondisi unlock berbeda. Semua mendukung BlockBite Game Gate.'
              : 'Select a vesting mechanic. Each creates a Solana PDA vault with different unlock conditions. All support the BlockBite Game Gate for level-based recipient requirements.'}
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
                el.style.border = `1.5px solid color-mix(in srgb, ${t.color} 40%, transparent)`;
                el.style.background = `color-mix(in srgb, ${C.bg1}, ${t.color} 3%)`;
                el.style.transform = 'translateY(-3px)';
                el.style.boxShadow = `0 8px 32px color-mix(in srgb, ${t.color} 9%, transparent)`;
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
                    background: `color-mix(in srgb, ${t.color} 8%, transparent)`, border: `1.5px solid color-mix(in srgb, ${t.color} 27%, transparent)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24,
                  }}>{t.icon}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: T.text, letterSpacing: '-.01em' }}>
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
                      background: `color-mix(in srgb, ${t.color} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 20%, transparent)`, color: t.color,
                    }}>{trait}</div>
                  ))}
                </div>

                {/* Use case */}
                <div style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: `color-mix(in srgb, ${t.color} 3%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 10%, transparent)`,
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
                  <span style={{ fontSize: 12, color: C.muted }}>{lang === 'id' ? 'Buat stream →' : 'Create stream →'}</span>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9,
                    background: `color-mix(in srgb, ${t.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 27%, transparent)`,
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
          background: 'color-mix(in srgb, var(--p-accent) 3%, transparent)', border: '1px solid color-mix(in srgb, var(--p-accent) 13%, transparent)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>◈</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3 }}>
              {lang === 'id' ? 'Semua tipe stream mendukung BlockBite Game Gate' : 'All stream types support BlockBite Game Gate'}
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              {lang === 'id'
                ? 'Stream apa pun dapat mengharuskan penerima menyelesaikan level BlockBite 1–50 sebelum membuka. Tier: Pemula (1–10) · Menengah (11–25) · Lanjutan (26–40) · Ahli (41–50)'
                : 'Any stream can require the recipient to complete BlockBite levels 1–50 before unlocking. Level tier ranges: Beginner (1–10) · Intermediate (11–25) · Advanced (26–40) · Expert (41–50)'}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

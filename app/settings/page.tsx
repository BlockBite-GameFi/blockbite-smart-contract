'use client';

import Navbar from '@/components/Navbar';
import { useApp } from '@/lib/useApp';
import Link from 'next/link';

const C = {
  bg0:    '#05040d',
  bg1:    '#09071a',
  bg2:    '#0f0d1e',
  accent: '#a78bfa',
  muted:  'rgba(148,163,184,.7)',
  border: 'rgba(167,139,250,.15)',
  serif:  "'Space Grotesk', system-ui, sans-serif",
  mono:   "'JetBrains Mono', monospace",
};

export default function SettingsPage() {
  const { t, lang, setLang, theme, setTheme } = useApp();

  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
      <Navbar />

      {/* Header */}
      <div style={{
        padding: '80px 32px 36px',
        background: 'linear-gradient(180deg,#0a0820 0%,#05040d 100%)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 16,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.02)',
          }}>← Back to Home</Link>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 6px', color: '#fff' }}>
            Settings
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            Language and display preferences.
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 32px' }}>

        {/* Language */}
        <div style={{
          padding: '24px', borderRadius: 16,
          background: C.bg1, border: `1px solid ${C.border}`,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, marginBottom: 12 }}>
            Language
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['en', 'id'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                style={{
                  padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: C.serif, fontSize: 13, fontWeight: 700,
                  background: lang === l
                    ? `linear-gradient(135deg, ${C.accent}, #5e35d4)`
                    : 'rgba(255,255,255,.06)',
                  color: lang === l ? '#fff' : C.muted,
                  transition: 'all .15s',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div style={{
          padding: '24px', borderRadius: 16,
          background: C.bg1, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, marginBottom: 12 }}>
            Theme
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['dark', 'light'] as const).map(th => (
              <button
                key={th}
                type="button"
                onClick={() => setTheme(th)}
                style={{
                  padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: C.serif, fontSize: 13, fontWeight: 700,
                  background: theme === th
                    ? `linear-gradient(135deg, ${C.accent}, #5e35d4)`
                    : 'rgba(255,255,255,.06)',
                  color: theme === th ? '#fff' : C.muted,
                  transition: 'all .15s',
                }}
              >
                {th.charAt(0).toUpperCase() + th.slice(1)}
              </button>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}

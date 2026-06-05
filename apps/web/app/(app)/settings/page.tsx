'use client';

import { useApp } from '@/lib/useApp';
import { T } from '@/lib/theme';

export default function SettingsPage() {
  const { lang, setLang, theme, setTheme } = useApp();

  const TX = {
    title:    lang === 'id' ? 'Pengaturan'                        : 'Settings',
    subtitle: lang === 'id' ? 'Preferensi bahasa dan tampilan.'   : 'Language and display preferences.',
    language: lang === 'id' ? 'Bahasa'                            : 'Language',
    theme:    lang === 'id' ? 'Tema'                              : 'Theme',
    dark:     lang === 'id' ? 'Gelap'                             : 'Dark',
    light:    lang === 'id' ? 'Terang'                            : 'Light',
  };

  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>

      {/* Header */}
      <div style={{
        padding: '80px 32px 36px',
        background: T.header,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 6px', color: T.text }}>
            {TX.title}
          </h1>
          <p style={{ fontSize: 13, color: T.textDim, margin: 0 }}>
            {TX.subtitle}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 32px' }}>

        {/* Language */}
        <div style={{
          padding: '24px', borderRadius: 16,
          background: T.bg1, border: `1px solid ${T.border}`,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: T.textDim, marginBottom: 12 }}>
            {TX.language}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['en', 'id'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                style={{
                  padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: T.serif, fontSize: 13, fontWeight: 700,
                  background: lang === l ? T.grad : T.surface,
                  color: lang === l ? '#fff' : T.textDim,
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
          background: T.bg1, border: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: T.textDim, marginBottom: 12 }}>
            {TX.theme}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['dark', 'light'] as const).map(th => (
              <button
                key={th}
                type="button"
                onClick={() => setTheme(th)}
                style={{
                  padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: T.serif, fontSize: 13, fontWeight: 700,
                  background: theme === th ? T.grad : T.surface,
                  color: theme === th ? '#fff' : T.textDim,
                  transition: 'all .15s',
                }}
              >
                {th === 'dark' ? TX.dark : TX.light}
              </button>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useApp } from '@/lib/useApp';

const C = {
  bg0:    '#05040d',
  bg1:    '#09071a',
  accent: '#a78bfa',
  gold:   '#f5c66a',
  green:  '#5fd07a',
  blue:   '#7ad7ff',
  muted:  'rgba(148,163,184,.7)',
  border: 'rgba(167,139,250,.15)',
  serif:  "'Space Grotesk', system-ui, sans-serif",
  mono:   "'JetBrains Mono', monospace",
};

const SLIDES_EN = [
  {
    step: '01',
    icon: '◈',
    title: 'Welcome to BlockBite',
    desc:  'On-chain puzzle game with real USDC rewards. Every match you play generates a cryptographic proof on Solana.',
    color: C.accent,
  },
  {
    step: '02',
    icon: '◆',
    title: 'Buy a Ticket',
    desc:  'Each paid game session requires a ticket. Ticket price is determined before each season. Free preview tickets are available on first connect.',
    color: C.gold,
  },
  {
    step: '03',
    icon: '◎',
    title: 'Clear Acts & Score',
    desc:  'Complete all levels in an Act to generate on-chain verification. Your score is recorded on the leaderboard for that season.',
    color: C.blue,
  },
  {
    step: '04',
    icon: '▲',
    title: 'Claim USDC Prizes',
    desc:  'Top 10 scorers each month receive USDC via TDP streaming vests — automatically unlocked on-chain. No human approval needed.',
    color: C.green,
  },
];

const SLIDES_ID = [
  {
    step: '01',
    icon: '◈',
    title: 'Selamat Datang di BlockBite',
    desc:  'Game puzzle on-chain dengan hadiah USDC nyata. Setiap permainan menghasilkan bukti kriptografi di Solana.',
    color: C.accent,
  },
  {
    step: '02',
    icon: '◆',
    title: 'Beli Tiket',
    desc:  'Setiap sesi game berbayar memerlukan tiket. Harga tiket ditentukan sebelum setiap musim. Tiket preview gratis tersedia saat koneksi pertama.',
    color: C.gold,
  },
  {
    step: '03',
    icon: '◎',
    title: 'Selesaikan Babak & Raih Skor',
    desc:  'Selesaikan semua level dalam Babak untuk menghasilkan verifikasi on-chain. Skor Anda dicatat di leaderboard musim itu.',
    color: C.blue,
  },
  {
    step: '04',
    icon: '▲',
    title: 'Klaim Hadiah USDC',
    desc:  '10 pemain teratas setiap bulan menerima USDC melalui TDP streaming vest — otomatis terbuka on-chain. Tidak perlu persetujuan manusia.',
    color: C.green,
  },
];

export default function OnboardingPage() {
  const { lang } = useApp();
  const [idx, setIdx] = useState(0);
  const slides = lang === 'id' ? SLIDES_ID : SLIDES_EN;
  const s = slides[idx];
  const isLast = idx === slides.length - 1;

  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
      <Navbar />

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 'calc(100vh - 64px)', padding: '24px',
      }}>

        {/* Step card */}
        <div style={{
          width: '100%', maxWidth: 480,
          background: C.bg1, border: `1px solid ${s.color}33`,
          borderRadius: 24, padding: '48px 40px',
          boxShadow: `0 0 60px ${s.color}12`,
          transition: 'border-color .3s, box-shadow .3s',
        }}>

          {/* Step number */}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.15em', color: s.color,
            fontFamily: C.mono, marginBottom: 20,
          }}>
            STEP {s.step} / {slides.length}
          </div>

          {/* Icon */}
          <div style={{
            fontSize: 52, color: s.color, marginBottom: 20, lineHeight: 1,
            fontWeight: 700,
          }}>
            {s.icon}
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 'clamp(22px,4vw,28px)', fontWeight: 900, margin: '0 0 16px', color: '#fff', lineHeight: 1.2 }}>
            {s.title}
          </h1>

          {/* Desc */}
          <p style={{ fontSize: 14, color: C.muted, margin: '0 0 36px', lineHeight: 1.8 }}>
            {s.desc}
          </p>

          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
            {slides.map((_, i) => (
              <div key={i} style={{
                height: 4, borderRadius: 99,
                width: i === idx ? 24 : 8,
                background: i <= idx ? s.color : C.border,
                transition: 'all .3s',
              }} />
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            {idx > 0 && (
              <button
                type="button"
                onClick={() => setIdx(i => i - 1)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 12, border: `1px solid ${C.border}`,
                  background: 'rgba(255,255,255,.04)', color: C.muted,
                  fontFamily: C.serif, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                ← {lang === 'id' ? 'Kembali' : 'Back'}
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setIdx(i => i + 1)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 12, border: 'none',
                  background: `linear-gradient(135deg, ${s.color}, #5e35d4)`,
                  color: '#fff', fontFamily: C.serif, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', boxShadow: `0 0 20px ${s.color}44`,
                }}
              >
                {lang === 'id' ? 'Lanjut' : 'Next'} →
              </button>
            ) : (
              <Link
                href="/map/1"
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 12, textAlign: 'center',
                  background: `linear-gradient(135deg, ${C.green}, #16a34a)`,
                  color: '#fff', fontFamily: C.serif, fontSize: 13, fontWeight: 700,
                  textDecoration: 'none', display: 'block',
                  boxShadow: `0 0 20px ${C.green}44`,
                }}
              >
                ▶ {lang === 'id' ? 'Mulai Main' : 'Start Playing'}
              </Link>
            )}
          </div>
        </div>

        {/* Skip */}
        <Link href="/" style={{
          marginTop: 20, fontSize: 12, color: C.muted, textDecoration: 'none',
          padding: '6px 12px', borderRadius: 8,
          border: `1px solid ${C.border}`,
        }}>
          ← {lang === 'id' ? 'Kembali ke Beranda' : 'Back to Home'}
        </Link>

      </div>
    </main>
  );
}

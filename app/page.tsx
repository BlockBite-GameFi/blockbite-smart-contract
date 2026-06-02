'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { getAllStreams } from '@/lib/anchor/vesting-client';
import Navbar from '@/components/Navbar';
import { useApp } from '@/lib/useApp';

// ─── Design System V4 — Vestra/Solana standard ────────────────────────────────
const DS = {
  bg0:      '#03000A',   // Vestra bg-void
  bg1:      '#0A0714',   // Vestra bg-surface
  bg2:      '#110E1F',   // Vestra bg-elevated
  accent:   '#9945FF',   // Solana purple (official)
  accentDk: '#7733CC',   // darker purple
  gold:     '#f5c66a',
  green:    '#14F195',   // Solana green (official)
  red:      '#ff3b6b',
  blue:     '#00C2FF',   // Solana blue (official)
  ember:    '#ff7a3a',
  muted:    'rgba(160,154,191,.80)',  // Vestra text-secondary
  border:   'rgba(153,69,255,.20)',   // purple-tinted border
  card:     'rgba(153,69,255,.07)',   // purple glass card
  cinzel:   "'Montserrat', 'Nunito', 'Syne', system-ui, sans-serif",
  sora:     "'Montserrat', 'Nunito', 'DM Sans', system-ui, sans-serif",
  mono:     "'JetBrains Mono', monospace",
};

// STATS are fetched live from on-chain (getAllStreams) in the component below.

const VERIFY_METHODS = [
  {
    icon: '⬡',
    color: DS.blue,
    title: 'Direct Claim',
    sub: 'Fastest Setup',
    desc: 'The fastest setup for simple distributions. Users can claim their tokens instantly as soon as the schedule unlocks without any extra steps or requirements.',
    badge: 'No Extra Steps',
  },
  {
    icon: '◈',
    color: '#c084fc',
    title: 'Gamified',
    sub: 'Play to Unlock',
    desc: 'The defense against automated bots. Users must complete and pass a specific level or reach a target milestone in the game to unlock their tokens.',
    badge: 'Sybil-Resistant',
  },
];

const VESTING_MODELS = [
  {
    title: 'Linear',
    icon: '∿',
    color: DS.blue,
    desc: 'Tokens unlock at a constant rate from start to end date. Ideal for team, advisor, and contributor allocations.',
  },
  {
    title: 'Cliff',
    icon: '⌐',
    color: DS.accent,
    desc: 'Zero tokens release until the cliff date. Hard time-lock enforced on-chain — no early withdrawals, no exceptions.',
  },
  {
    title: 'Milestone',
    icon: '◎',
    color: DS.gold,
    desc: 'Tokens unlock in tranches as project milestones are verified. Choose any verification method to match your workflow.',
  },
];


const HOW_IT_WORKS = [
  {
    num: '01',
    color: '#ff7a3a',
    title: 'Connect & Import Data',
    desc: 'Connect your wallet and upload your recipient list via CSV or manual entry in seconds.',
  },
  {
    num: '02',
    color: DS.blue,
    title: 'Define Tokenomics',
    desc: 'Customize your release strategy using linear vesting, cliff periods, or milestone-based distribution.',
  },
  {
    num: '03',
    color: '#c084fc',
    title: 'Set Verification Layer',
    desc: 'Choose between a simple direct claim for maximum ease, or gamified verification to act as an anti-bots filter.',
  },
  {
    num: '04',
    color: DS.green,
    title: 'Lock, Launch & Manage',
    desc: 'Lock assets to automate user claims. Monitor distribution in real-time with absolute Clawback control.',
  },
];

// COMPARISON table moved to /demo#comparison — unverified competitor claims
// must not appear on production pages (Pasal 207 compliance).

interface LiveStats { streams: number; active: number; locked: string; distributed: string; }

// ─── Bilingual content ────────────────────────────────────────────────────────
const COPY = {
  en: {
    badge: 'POWERED BY SOLANA',
    kicker: 'THE UNIFIED TOKEN DISTRIBUTION PROTOCOL',
    h1a: 'Stop Distributing',
    h1b: 'Tokens Blindly.',
    sub: 'The unified engine for automated token logistics. Effortlessly manage your entire lifecycle from secure vesting to real-time streaming with built-in validation layers.',
    cta1: 'Secure Your Spot Now!',
    cta2: 'Launch App →',
    featKicker: 'PROTOCOL FEATURES',
    featTitle: 'Everything a token campaign needs.',
    featItalic: "Nothing it doesn't.",
    featSub: 'From modular verification to automated clawbacks — all the tools a token distribution needs, built into one trustless protocol.',
    howKicker: 'HOW IT WORKS',
    howTitle: 'Four moves.',
    howItalic: 'From setup to claim.',
    howSub: 'Upload recipients, choose how tokens unlock, and let each wallet claim on schedule.',
    verifyKicker: 'CHOOSE YOUR VERIFICATION LAYER',
    faqKicker: 'FAQ',
    faqTitle: 'Questions,',
    faqItalic: 'answered.',
    ctaFinalTitle: 'Ready to distribute tokens responsibly?',
    ctaFinalSub: 'Join the projects already streaming tokens with cliff, linear, and milestone vesting on Solana.',
    ctaFinal1: 'Launch App →',
    ctaFinal2: 'View Streams',
    footer: '© 2026 BlockBite · Token Distribution Protocol on Solana',
    /* ── Stats ── */
    statStreams: 'Total Streams', statActive: 'Active Streams', statDist: 'Total Distributed',
    /* ── Features ── */
    features: [
      { icon: '◈', title: 'Modular Verification Layers',    desc: 'Take control over how users access their tokens. Choose between a simple direct claim for maximum ease, or gamified verification to act as an anti-bots filter.',                                                               tags: ['Direct Claim', 'Gamified'] },
      { icon: '∿', title: 'Adaptive Tokenomics Logic',       desc: "Choose between linear streaming, cliff vesting, or milestone based unlocks to match your project's unique roadmap and specific distribution needs.",                                                                              tags: ['Linear', 'Cliff vesting', 'Milestone'] },
      { icon: '◎', title: 'Eliminate Manual Overhead',       desc: 'Stop wasting hundreds of hours on manual distributions and cross checking spreadsheets.',                                                                                                                                           tags: ['Fully automated', 'Zero manual steps'] },
      { icon: '✦', title: 'Active Clawback Control',         desc: 'Protect your treasury from broken contracts or project pivots. Our built-in clawback feature allows builders to reclaim unvested tokens instantly.',                                                                               tags: ['Treasury protection', 'Instant clawback'] },
      { icon: '⬡', title: 'Professional Standard Security',  desc: 'BlockBite ensures that project assets are locked securely while providing transparent, on chain proof for every single distribution.',                                                                                           tags: ['On-chain proof', 'Transparent'] },
    ],
    /* ── How it works ── */
    howItems: [
      { num: '01', title: 'Connect & Import Data',    desc: 'Connect your wallet and upload your recipient list via CSV or manual entry in seconds.' },
      { num: '02', title: 'Define Tokenomics',         desc: 'Customize your release strategy using linear vesting, cliff periods, or milestone-based distribution.' },
      { num: '03', title: 'Set Verification Layer',    desc: 'Choose between a simple direct claim for maximum ease, or gamified verification to act as an anti-bots filter.' },
      { num: '04', title: 'Lock, Launch & Manage',     desc: 'Lock assets to automate user claims. Monitor distribution in real-time with absolute Clawback control.' },
    ],
    /* ── Verify methods ── */
    verifyMethods: [
      { title: 'Direct Claim',  sub: 'Fastest Setup',   desc: 'The fastest setup for simple distributions. Users can claim their tokens instantly as soon as the schedule unlocks without any extra steps or requirements.', badge: 'No Extra Steps' },
      { title: 'Gamified',      sub: 'Play to Unlock',  desc: 'The defense against automated bots. Users must complete and pass a specific level or reach a target milestone in the game to unlock their tokens.',            badge: 'Sybil-Resistant' },
    ],
    /* ── FAQ ── */
    faq: [
      { q: 'What is BlockBite TDP?',                    a: 'BlockBite is the unified engine for automated token logistics. We remove the complexity and risk of manual management by providing an automated system that handles vesting, streaming, and distribution with flexible security layers, ensuring your treasury is protected and your tokens are delivered with surgical precision.' },
      { q: 'Who controls the locked tokens?',           a: 'Tokens are secured in audited, non custodial smart contracts on Solana. Neither BlockBite nor outside parties can touch them. As the builder, you retain exclusive emergency control via our clawback feature to reclaim unvested tokens if conditions change.' },
      { q: 'What vesting schedules are supported?',     a: 'We support highly adaptive tokenomics logic. You can use linear streaming for second by second unlocks, cliff schedules for timed lockups, or milestone based unlocks that release tokens only when project goals are achieved.' },
      { q: 'What is the gamified verification layer?',  a: 'It is a mechanical filter built to block automated scripts and farming bots. When active, users must complete a specific level or reach a target milestone in a game to prove they are human before the smart contract unlocks their tokens.' },
      { q: 'What happens if a stream is cancelled?',    a: 'Vesting freezes immediately. The recipient keeps everything already vested and can claim it at any time. Unvested tokens are returned to the stream creator.' },
      { q: 'What wallets are supported?',               a: 'Phantom and Solflare are fully supported via Solana wallet-adapter. Any wallet compatible with the adapter standard will work.' },
    ],
    /* ── Why BlockBite ── */
    whyKicker: 'WHY BLOCKBITE', whyDesc: 'Feature comparison with other protocols is available in the demo section.', whyLink: 'View comparison →',
  },
  id: {
    badge: 'DIDUKUNG SOLANA',
    kicker: 'PROTOKOL DISTRIBUSI TOKEN TERPADU',
    h1a: 'Hentikan Distribusi',
    h1b: 'Token Sembarangan.',
    sub: 'Mesin terpadu untuk logistik token otomatis. Kelola seluruh siklus dari vesting aman hingga streaming real-time dengan lapisan validasi bawaan.',
    cta1: 'Amankan Tempatmu!',
    cta2: 'Buka Aplikasi →',
    featKicker: 'FITUR PROTOKOL',
    featTitle: 'Semua yang dibutuhkan distribusi token.',
    featItalic: 'Tidak lebih.',
    featSub: 'Dari verifikasi modular hingga clawback otomatis — semua dalam satu protokol tanpa kepercayaan pihak ketiga.',
    howKicker: 'CARA KERJA',
    howTitle: 'Empat langkah.',
    howItalic: 'Dari setup ke klaim.',
    howSub: 'Upload penerima, pilih cara token unlock, dan biarkan setiap wallet klaim sesuai jadwal.',
    verifyKicker: 'PILIH LAPISAN VERIFIKASI',
    faqKicker: 'FAQ',
    faqTitle: 'Pertanyaan,',
    faqItalic: 'terjawab.',
    ctaFinalTitle: 'Siap mendistribusikan token secara bertanggung jawab?',
    ctaFinalSub: 'Bergabung dengan proyek yang sudah streaming token dengan cliff, linear, dan milestone vesting di Solana.',
    ctaFinal1: 'Buka Aplikasi →',
    ctaFinal2: 'Lihat Stream',
    footer: '© 2026 BlockBite · Protokol Distribusi Token di Solana',
    /* ── Stats ── */
    statStreams: 'Total Stream', statActive: 'Stream Aktif', statDist: 'Total Didistribusikan',
    /* ── Features ── */
    features: [
      { icon: '◈', title: 'Lapisan Verifikasi Modular',    desc: 'Kendalikan cara pengguna mengakses token mereka. Pilih antara klaim langsung untuk kemudahan maksimal, atau verifikasi gamified sebagai filter anti-bot.',                                                            tags: ['Klaim Langsung', 'Gamified'] },
      { icon: '∿', title: 'Logika Tokenomics Adaptif',      desc: 'Pilih antara linear streaming, cliff vesting, atau milestone unlocks untuk menyesuaikan roadmap dan kebutuhan distribusi spesifik proyek kamu.',                                                                    tags: ['Linear', 'Cliff vesting', 'Milestone'] },
      { icon: '◎', title: 'Hilangkan Overhead Manual',      desc: 'Berhenti membuang ratusan jam untuk distribusi manual dan pengecekan spreadsheet.',                                                                                                                                  tags: ['Sepenuhnya otomatis', 'Nol langkah manual'] },
      { icon: '✦', title: 'Kontrol Clawback Aktif',         desc: 'Lindungi treasury dari kontrak bermasalah atau perubahan proyek. Fitur clawback bawaan memungkinkan builder menarik kembali token yang belum vesting secara instan.',                                                 tags: ['Perlindungan treasury', 'Clawback instan'] },
      { icon: '⬡', title: 'Keamanan Standar Profesional',   desc: 'BlockBite memastikan aset proyek terkunci dengan aman sambil memberikan bukti transparan on-chain untuk setiap distribusi.',                                                                                        tags: ['Bukti on-chain', 'Transparan'] },
    ],
    /* ── How it works ── */
    howItems: [
      { num: '01', title: 'Hubungkan & Import Data',  desc: 'Hubungkan wallet kamu dan upload daftar penerima via CSV atau entri manual dalam hitungan detik.' },
      { num: '02', title: 'Tentukan Tokenomics',       desc: 'Sesuaikan strategi rilis menggunakan linear vesting, cliff periods, atau distribusi berbasis milestone.' },
      { num: '03', title: 'Atur Lapisan Verifikasi',   desc: 'Pilih antara klaim langsung untuk kemudahan maksimal, atau verifikasi gamified sebagai filter anti-bot.' },
      { num: '04', title: 'Kunci, Luncurkan & Kelola', desc: 'Kunci aset untuk mengotomatiskan klaim pengguna. Pantau distribusi secara real-time dengan kontrol Clawback penuh.' },
    ],
    /* ── Verify methods ── */
    verifyMethods: [
      { title: 'Klaim Langsung', sub: 'Setup Tercepat', desc: 'Setup tercepat untuk distribusi sederhana. Pengguna dapat klaim token mereka langsung setelah jadwal unlock tanpa langkah tambahan.', badge: 'Tanpa Langkah Ekstra' },
      { title: 'Gamified',       sub: 'Main untuk Unlock', desc: 'Pertahanan terhadap bot otomatis. Pengguna harus menyelesaikan level tertentu atau mencapai milestone dalam game untuk membuka token mereka.', badge: 'Tahan Sybil' },
    ],
    /* ── FAQ ── */
    faq: [
      { q: 'Apa itu BlockBite TDP?',                         a: 'BlockBite adalah mesin terpadu untuk logistik token otomatis. Kami menghilangkan kompleksitas dan risiko manajemen manual dengan sistem otomatis yang menangani vesting, streaming, dan distribusi dengan lapisan keamanan fleksibel.' },
      { q: 'Siapa yang mengendalikan token yang terkunci?',   a: 'Token diamankan dalam smart contract non-kustodial yang diaudit di Solana. Tidak BlockBite maupun pihak luar yang bisa menyentuhnya. Sebagai builder, kamu memiliki kontrol darurat eksklusif via fitur clawback.' },
      { q: 'Jadwal vesting apa yang didukung?',              a: 'Kami mendukung logika tokenomics yang sangat adaptif: linear streaming untuk unlock per detik, cliff schedules untuk lockup berjangka, atau milestone-based unlocks yang hanya melepas token saat tujuan proyek tercapai.' },
      { q: 'Apa itu lapisan verifikasi gamified?',            a: 'Filter mekanis untuk memblokir skrip otomatis dan bot farming. Saat aktif, pengguna harus menyelesaikan level atau milestone dalam game untuk membuktikan mereka manusia sebelum smart contract membuka token.' },
      { q: 'Apa yang terjadi jika stream dibatalkan?',        a: 'Vesting langsung beku. Penerima menyimpan semua yang sudah vesting dan bisa klaim kapan saja. Token yang belum vesting dikembalikan ke pembuat stream.' },
      { q: 'Wallet apa yang didukung?',                      a: 'Phantom dan Solflare didukung penuh via Solana wallet-adapter. Wallet apapun yang kompatibel dengan standar adapter akan berfungsi.' },
    ],
    /* ── Why BlockBite ── */
    whyKicker: 'KENAPA BLOCKBITE', whyDesc: 'Perbandingan fitur dengan protokol lain tersedia di bagian demo.', whyLink: 'Lihat perbandingan →',
  },
} as const;

export default function Home() {
  const { connection } = useConnection();
  const { lang, palette, theme } = useApp();
  const T = COPY[lang];

  // ── Dynamic DS that responds to theme ────────────────────────────────────────
  // Use `theme` directly — avoids fragile palette.surface2 string comparison.
  const isLight = theme === 'light';
  const D = {
    ...DS,
    bg0:    palette.bg,
    bg1:    isLight ? '#eeedf8' : DS.bg1,
    bg2:    isLight ? '#e4e2f5' : DS.bg2,
    text:   palette.text,          // responsive text color (was missing)
    muted:  palette.textDim,
    border: palette.border,
    accent: palette.accent,
    green:  isLight ? '#15803d' : DS.green,
    blue:   isLight ? '#0d9488' : DS.blue,
    gold:   isLight ? '#b45309' : DS.gold,
  };

  const cvs = useRef<HTMLCanvasElement>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [faqOpen, setFaqOpen] = useState<boolean[]>(Array(6).fill(false));
  // Live on-chain stats
  useEffect(() => {
    let cancelled = false;
    getAllStreams(connection).then(all => {
      if (cancelled) return;
      const nowSec = Math.floor(Date.now() / 1000);
      const active = all.filter(s => !s.cancelled && Number(s.endTs.toString()) > nowSec).length;
      const locked = all.reduce((sum, s) => {
        const total    = BigInt(s.amountTotal.toString());
        const drawn    = BigInt(s.amountWithdrawn.toString());
        return sum + (total > drawn ? total - drawn : 0n);
      }, 0n);
      const distributed = all.reduce((sum, s) => sum + BigInt(s.amountWithdrawn.toString()), 0n);
      const fmt = (n: bigint) => {
        const m = n / 1_000_000n;
        return m >= 1_000_000n ? (Number(m / 1_000_000n)).toFixed(1) + 'M'
             : m >= 1_000n     ? (Number(m / 1_000n)).toFixed(1) + 'K'
             : m.toString();
      };
      setLiveStats({ streams: all.length, active, locked: fmt(locked), distributed: fmt(distributed) });
    }).catch(() => {}); // fail silently — landing page still renders
    return () => { cancelled = true; };
  }, [connection]);


  // Floating particles background
  useEffect(() => {
    const c = cvs.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    let raf: number;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const COLORS = [D.accent, D.blue, D.green, D.accentDk];
    const pts = Array.from({ length: 28 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 1 + Math.random() * 2.5,
      spd: 0.12 + Math.random() * 0.22,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      op: 0.06 + Math.random() * 0.14,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        p.y -= p.spd;
        if (p.y < -10) { p.y = c.height + 10; p.x = Math.random() * c.width; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.op;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: D.bg0, color: D.text, fontFamily: DS.sora, overflowX: 'hidden' }}>
      {/* Warp-speed canvas particles */}
      <canvas ref={cvs} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.55 }} />

      <Navbar />

      {/* ─── HERO ──────────────────────────────────────────────────────────────── */}
      <section className="m-hero" style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(88px,14vw,140px) 20px clamp(64px,10vw,100px)', textAlign: 'center', gap: 28,
        background: [
          'radial-gradient(ellipse 80% 55% at 50% 20%, rgba(153,69,255,0.18) 0%, transparent 65%)',
          'radial-gradient(ellipse 50% 35% at 80% 80%, rgba(0,194,255,0.10) 0%, transparent 60%)',
          'radial-gradient(ellipse 40% 30% at 20% 70%, rgba(20,241,149,0.07) 0%, transparent 55%)',
        ].join(','),
      }}>
        {/* Top glow orb */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 400, borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(153,69,255,0.22) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Badge */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 20px', borderRadius: 999,
          border: '1px solid rgba(20,241,149,.40)',
          background: 'rgba(20,241,149,.10)',
          fontSize: 11, fontWeight: 800,
          color: DS.green,
          letterSpacing: '2.5px', fontFamily: DS.sora,
          boxShadow: '0 0 20px rgba(20,241,149,.15)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: D.green, display: 'inline-block', animation: 'pulse 2s infinite', boxShadow: '0 0 8px rgba(20,241,149,.8)' }} />
          {T.badge}
        </div>

        {/* Logo */}
        <img
          src="/logo.png"
          alt="BlockBite"
          style={{ position: 'relative', zIndex: 1, width: 88, height: 88, objectFit: 'contain', filter: 'drop-shadow(0 0 36px rgba(153,69,255,0.70))' }}
        />

        {/* Kicker */}
        <p style={{
          position: 'relative', zIndex: 1,
          fontFamily: DS.cinzel,
          fontSize: 'clamp(10px,1.1vw,12px)',
          fontWeight: 800,
          color: 'rgba(160,154,191,.65)',
          letterSpacing: '.30em',
          textTransform: 'uppercase',
          margin: 0,
        }}>
          {T.kicker}
        </p>

        {/* Headline */}
        <h1 style={{
          position: 'relative', zIndex: 1,
          fontFamily: DS.cinzel,
          fontSize: 'clamp(40px,7vw,80px)',
          fontWeight: 900,
          lineHeight: 1.02,
          letterSpacing: '-2px',
          margin: 0,
          maxWidth: 860,
          color: D.text,
          textShadow: '0 0 80px rgba(153,69,255,0.25)',
        }}>
          {T.h1a}{' '}
          <span style={{
            background: 'linear-gradient(90deg, #9945FF 0%, #00C2FF 50%, #14F195 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 24px rgba(153,69,255,0.5))',
          }}>{T.h1b}</span>
        </h1>

        {/* Sub-headline */}
        <p style={{
          position: 'relative', zIndex: 1,
          fontFamily: DS.sora,
          fontSize: 'clamp(15px,1.6vw,18px)',
          color: D.muted,
          maxWidth: 600,
          lineHeight: 1.80,
          margin: 0,
          fontWeight: 400,
        }}>
          {T.sub}
        </p>

        {/* CTAs */}
        <div className="m-cta-wrap" style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', width: '100%', maxWidth: 600 }}>
          <Link href="/join" className="m-cta-btn" style={{
            padding: '15px 36px', borderRadius: 9999,
            background: 'linear-gradient(90deg, #9945FF 0%, #00C2FF 100%)',
            color: '#fff', fontWeight: 800, fontSize: 15,
            textDecoration: 'none', letterSpacing: '.04em',
            boxShadow: '0 0 40px rgba(153,69,255,.55), 0 4px 24px rgba(0,0,0,.4)',
            fontFamily: DS.cinzel,
            transition: 'transform .2s, box-shadow .2s',
            display: 'inline-block', textAlign: 'center',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 60px rgba(153,69,255,.70), 0 4px 24px rgba(0,0,0,.4)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px rgba(153,69,255,.55), 0 4px 24px rgba(0,0,0,.4)'; }}
          >
            {T.cta1}
          </Link>
          <Link href="/streams/new" className="m-cta-btn" style={{
            padding: '15px 28px', borderRadius: 9999,
            background: 'rgba(153,69,255,.08)',
            border: '1px solid rgba(153,69,255,.45)',
            color: D.text, fontWeight: 600, fontSize: 15,
            textDecoration: 'none', letterSpacing: '.02em',
            fontFamily: DS.sora,
            backdropFilter: 'blur(12px)',
            display: 'inline-block', textAlign: 'center',
          }}>
            {T.cta2}
          </Link>
        </div>

        {/* Stats */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '24px 40px',
          marginTop: 48, paddingTop: 44,
          borderTop: '1px solid rgba(153,69,255,.22)',
          maxWidth: 680, width: '100%',
        }}>
          {([
            { label: T.statStreams, val: liveStats ? liveStats.streams.toLocaleString() : '0' },
            { label: T.statActive,  val: liveStats ? liveStats.active.toLocaleString()  : '0' },
            { label: T.statDist,    val: liveStats ? liveStats.distributed + ' tokens'  : '0 tokens' },
          ]).map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(160,154,191,.6)', letterSpacing: '2.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>{s.label}</p>
              <p style={{
                fontFamily: DS.cinzel, fontWeight: 900, fontSize: 'clamp(24px,3vw,34px)',
                margin: 0,
                background: 'linear-gradient(90deg, #9945FF, #00C2FF)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>{s.val}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ──────────────────────────────────────────────────────────── */}
      <section className="m-section" style={{ position: 'relative', zIndex: 1, padding: 'clamp(52px,8vw,96px) clamp(16px,4vw,24px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: D.green, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 16, fontFamily: DS.sora }}>
              {T.featKicker}
            </p>
            <h2 style={{ fontFamily: DS.cinzel, fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 700, color: D.text, margin: 0 }}>
              {T.featTitle}{' '}
              <span style={{
                fontStyle: 'italic',
                background: 'linear-gradient(90deg, #9945FF, #14F195)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>{T.featItalic}</span>
            </h2>
          </div>

          {/* ── 5 core features — bilingual via T.features ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 24 }}>
            {T.features.map((f, i) => {
              const color = [D.accent, D.blue, D.green, D.gold, D.ember][i] ?? D.accent;
              return (
              <div key={i} style={{
                borderRadius: 18, padding: 1,
                background: 'linear-gradient(135deg, rgba(153,69,255,0.30), rgba(20,241,149,0.20))',
                transition: 'transform .25s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}
              >
                <div style={{
                  borderRadius: 17, background: D.bg1,
                  padding: '28px 28px 24px',
                  height: '100%', boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column', gap: 16,
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: `color-mix(in srgb, ${color} 13%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, color,
                    boxShadow: `0 0 20px color-mix(in srgb, ${color} 9%, transparent)`,
                  }}>{f.icon}</div>
                  <h3 style={{ fontFamily: DS.cinzel, fontSize: 20, fontWeight: 700, color: D.text, margin: 0 }}>{f.title}</h3>
                  <p style={{ fontFamily: DS.sora, fontSize: 13.5, color: D.muted, lineHeight: 1.75, margin: 0, flex: 1 }}>{f.desc}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {f.tags.map(tag => (
                      <span key={tag} style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 999,
                        background: D.bg2, border: `1px solid color-mix(in srgb, ${color} 19%, transparent)`,
                        color, fontFamily: DS.sora, fontWeight: 600,
                        letterSpacing: '0.02em',
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="m-section" style={{
        position: 'relative', zIndex: 1,
        padding: 'clamp(52px,8vw,96px) clamp(16px,4vw,24px)',
        background: D.bg1,
        borderTop: `1px solid ${D.border}`,
        borderBottom: `1px solid ${D.border}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: D.green, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 16, fontFamily: DS.sora }}>
              {T.howKicker}
            </p>
            <h2 style={{ fontFamily: DS.cinzel, fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 700, color: D.text, margin: '0 0 16px' }}>
              {T.howTitle}{' '}
              <span style={{
                fontStyle: 'italic',
                background: 'linear-gradient(90deg, #9945FF, #14F195)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>{T.howItalic}</span>
            </h2>
            <p style={{ fontFamily: DS.sora, fontSize: 15, color: D.muted, maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
              {T.howSub}
            </p>
          </div>

          {/* 4-column symmetric grid — Vestra standard, auto-fit on mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 24, position: 'relative', marginBottom: 72 }}>
            {/* Connector line — desktop only decoration */}
            <div style={{
              position: 'absolute', top: 20, left: '14%', right: '14%', height: 1,
              background: 'linear-gradient(90deg, rgba(153,69,255,0.35), rgba(20,241,149,0.35))',
              pointerEvents: 'none',
            }} />

            {T.howItems.map((h, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {/* Ghost large number */}
                <span style={{
                  position: 'absolute', top: -10, left: -8,
                  fontFamily: DS.cinzel, fontSize: 72, fontWeight: 900, lineHeight: 1,
                  background: 'linear-gradient(135deg, #9945FF, #14F195)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  opacity: 0.10, userSelect: 'none', pointerEvents: 'none',
                }}>{h.num}</span>

                {/* Gradient badge */}
                <div style={{
                  position: 'relative', zIndex: 1,
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, #9945FF, #14F195)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 20,
                  boxShadow: '0 0 20px rgba(153,69,255,0.35)',
                }}>
                  <span style={{ fontFamily: DS.cinzel, fontWeight: 800, fontSize: 13, color: D.bg0 }}>{h.num}</span>
                </div>

                <h3 style={{ fontFamily: DS.cinzel, fontSize: 17, fontWeight: 700, color: D.text, margin: '0 0 12px' }}>{h.title}</h3>
                <p style={{ fontFamily: DS.sora, fontSize: 13, color: D.muted, lineHeight: 1.72, margin: 0 }}>{h.desc}</p>
              </div>
            ))}
          </div>

          {/* Verification layer — 4-column to match step grid */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: D.muted, letterSpacing: '2.5px', textTransform: 'uppercase', margin: 0 }}>
              {T.verifyKicker}
            </p>
          </div>
          <div className="m-verify-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,200px),1fr))', gap: 16, marginBottom: 64 }}>
            {T.verifyMethods.map((m, i) => {
              const vc = [D.blue, '#c084fc'][i] ?? D.accent;
              return (
              <div key={i} style={{
                padding: '20px 18px', borderRadius: 14,
                background: `color-mix(in srgb, ${vc} 3%, transparent)`,
                border: `1px solid color-mix(in srgb, ${vc} 13%, transparent)`,
                transition: 'border-color .2s, transform .2s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${vc} 31%, transparent)`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${vc} 13%, transparent)`; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
              >
                <div style={{ fontSize: 10, color: vc, fontWeight: 700, letterSpacing: '1.5px', marginBottom: 6 }}>{m.title.toUpperCase()}</div>
                <div style={{ fontFamily: DS.cinzel, fontSize: 14, fontWeight: 600, marginBottom: 8, color: D.text }}>{m.sub}</div>
                <p style={{ fontSize: 12, color: D.muted, lineHeight: 1.6, margin: 0 }}>{m.desc}</p>
                <div style={{
                  marginTop: 10, display: 'inline-block',
                  padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 700,
                  background: `color-mix(in srgb, ${vc} 8%, transparent)`, color: vc, letterSpacing: '1px',
                }}>{m.badge}</div>
              </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────────────────── */}
      <section id="faq" className="m-section" style={{ position: 'relative', zIndex: 1, padding: 'clamp(44px,7vw,80px) clamp(16px,4vw,24px)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, letterSpacing: '2px', color: D.accent, fontWeight: 700, marginBottom: 12 }}>
              {T.faqKicker}
            </div>
            <h2 style={{ fontFamily: DS.cinzel, fontSize: 'clamp(24px,3.5vw,40px)', fontWeight: 700, color: D.text, margin: 0 }}>
              {T.faqTitle}{' '}
              <span style={{
                fontStyle: 'italic',
                background: 'linear-gradient(90deg, #9945FF, #14F195)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>{T.faqItalic}</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(T.faq as readonly { q: string; a: string }[]).map((item, i) => (
              <div key={i} style={{
                borderRadius: 14, overflow: 'hidden',
                border: `1px solid ${faqOpen[i] ? 'rgba(153,69,255,0.45)' : D.border}`,
                transition: 'border-color .2s',
              }}>
                <button
                  onClick={() => setFaqOpen(prev => prev.map((v, idx) => idx === i ? !v : v))}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', textAlign: 'left',
                    background: faqOpen[i] ? D.bg2 : 'transparent',
                    border: 'none', cursor: 'pointer',
                    color: D.text, fontFamily: DS.sora, fontSize: 14.5, fontWeight: 600,
                    transition: 'background .2s',
                  }}
                >
                  <span>{item.q}</span>
                  <span style={{
                    fontSize: 18, color: D.muted, flexShrink: 0, marginLeft: 16,
                    transform: faqOpen[i] ? 'rotate(180deg)' : 'none',
                    transition: 'transform .2s',
                    display: 'inline-block',
                  }}>⌄</span>
                </button>
                {faqOpen[i] && (
                  <div style={{ padding: '0 20px 16px', fontFamily: DS.sora, fontSize: 13.5, color: D.muted, lineHeight: 1.75 }}>
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─────────────────────────────────────────────────────────── */}
      <section className="m-section" style={{
        position: 'relative', zIndex: 1,
        padding: 'clamp(56px,9vw,100px) clamp(16px,4vw,24px) clamp(64px,10vw,120px)', textAlign: 'center',
        background: 'radial-gradient(ellipse 60% 70% at 50% 50%, rgba(153,69,255,.12) 0%, transparent 70%)',
      }}>
        <h2 style={{
          fontFamily: DS.cinzel,
          fontSize: 'clamp(26px,4vw,44px)', fontWeight: 800,
          marginBottom: 16, color: D.text,
        }}>
          {T.ctaFinalTitle}
        </h2>
        <p style={{ fontSize: 15, color: D.muted, maxWidth: 480, margin: '0 auto 36px', lineHeight: 1.7 }}>
          {T.ctaFinalSub}
        </p>
        <div className="m-cta-wrap" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 400, margin: '0 auto' }}>
          <Link href="/streams/new" className="m-cta-btn" style={{
            padding: '15px 40px', borderRadius: 9999,
            background: 'linear-gradient(90deg, #9945FF 0%, #00C2FF 100%)',
            color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none',
            boxShadow: '0 0 40px rgba(153,69,255,.40)',
            textAlign: 'center', display: 'inline-block',
          }}>
            {T.ctaFinal1}
          </Link>
          <Link href="/streams" className="m-cta-btn" style={{
            padding: '15px 36px', borderRadius: 9999,
            background: 'rgba(153,69,255,.06)',
            border: '1px solid rgba(153,69,255,.35)',
            color: D.text, fontWeight: 600, fontSize: 15, textDecoration: 'none',
            textAlign: 'center', display: 'inline-block',
          }}>
            {T.ctaFinal2}
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="m-footer" style={{
        position: 'relative', zIndex: 1,
        borderTop: `1px solid ${D.border}`,
        padding: 'clamp(20px,3vw,28px) clamp(16px,4vw,24px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
        fontSize: 12, color: D.muted,
        background: D.bg1,
        fontFamily: DS.sora,
      }}>
        <div>{T.footer}</div>
        <div className="m-footer-links" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a href="https://x.com/BlockBite_Sol" target="_blank" rel="noopener noreferrer" style={{ color: D.muted, textDecoration: 'none' }}>Twitter / X</a>
        </div>
      </footer>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.65)} }
        @keyframes heroGlow { 0%,100%{opacity:.18} 50%{opacity:.28} }

        /* ── Pasal 16 — Full Mobile Responsiveness ───────────────────────── */

        /* Verification grid: 2 cols on ≤640px, 1 col on ≤400px */
        @media (max-width: 640px) {
          .m-verify-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 400px) {
          .m-verify-grid {
            grid-template-columns: 1fr !important;
          }
        }

        /* CTA buttons: full-width stacked column on mobile */
        @media (max-width: 500px) {
          .m-cta-wrap {
            flex-direction: column !important;
            align-items: stretch !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .m-cta-btn {
            width: 100% !important;
            box-sizing: border-box !important;
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
        }

        /* Footer: stack on mobile */
        @media (max-width: 560px) {
          .m-footer {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .m-footer-links {
            justify-content: center !important;
          }
        }

        /* Reduce connector line ghost on mobile (it overlaps on narrow screens) */
        @media (max-width: 768px) {
          .m-connector { display: none !important; }
        }
      `}</style>
    </div>
  );
}

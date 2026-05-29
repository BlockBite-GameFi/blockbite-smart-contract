'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useApp } from '@/lib/useApp';

/* ── Bilingual constants ─────────────────────────────────────────────── */

const NAV_SECTIONS_EN = [
  { id: 'intro',               label: 'Introduction'       },
  { id: 'how-to-play',         label: 'How to Play'        },
  { id: 'controls',            label: 'Controls'           },
  { id: 'scoring',             label: 'Scoring'            },
  { id: 'prize-pool',          label: 'Prize Pool'         },
  { id: 'prize-distribution',  label: 'Prize Distribution' },
  { id: 'fee-structure',       label: 'Fee Structure'      },
  { id: 'faq',                 label: 'FAQ'                },
];
const NAV_SECTIONS_ID = [
  { id: 'intro',               label: 'Pengantar'          },
  { id: 'how-to-play',         label: 'Cara Main'          },
  { id: 'controls',            label: 'Kontrol'            },
  { id: 'scoring',             label: 'Penilaian'          },
  { id: 'prize-pool',          label: 'Kolam Hadiah'       },
  { id: 'prize-distribution',  label: 'Distribusi Hadiah'  },
  { id: 'fee-structure',       label: 'Struktur Biaya'     },
  { id: 'faq',                 label: 'FAQ'                },
];

const STEPS_EN = [
  { n:'01', title:'Connect Your Wallet',          desc:'Connect a Solana wallet — Phantom, Solflare, or Backpack. On first connect you receive free preview tickets.', color:'#00F5FF' },
  { n:'02', title:'Choose a Level from the Map',  desc:'Navigate to the world map. Each node is a level — unlock higher levels by scoring well on previous ones.', color:'#00FF88' },
  { n:'03', title:'Place Pieces on the 8×8 Board',desc:'You always have 3 pieces available. Select one (press 1/2/3 or click), then click the board to place it. Pieces cannot be rotated.', color:'#FFD700' },
  { n:'04', title:'Clear Rows & Columns to Score', desc:'Fill a complete row or column of 8 blocks to clear it. Clear multiple lines at once for combo multipliers. No gravity — blocks stay in place after a clear.', color:'#FF00FF' },
  { n:'05', title:'Hit the Leaderboard',           desc:'Use a paid ticket to make your score count on the official leaderboard. Your best score per period qualifies you for USDC prizes.', color:'#FF6B00' },
];
const STEPS_ID = [
  { n:'01', title:'Hubungkan Wallet Anda',          desc:'Hubungkan wallet Solana — Phantom, Solflare, atau Backpack. Saat pertama kali terhubung kamu mendapatkan tiket preview gratis.', color:'#00F5FF' },
  { n:'02', title:'Pilih Level dari Peta',          desc:'Navigasi ke peta dunia. Setiap titik adalah level — buka level lebih tinggi dengan mendapat skor bagus di level sebelumnya.', color:'#00FF88' },
  { n:'03', title:'Tempatkan Potongan di Papan 8×8',desc:'Kamu selalu punya 3 potongan. Pilih satu (tekan 1/2/3 atau klik), lalu klik papan untuk menempatkannya. Potongan tidak bisa diputar.', color:'#FFD700' },
  { n:'04', title:'Hapus Baris & Kolom untuk Skor', desc:'Isi baris atau kolom penuh 8 blok untuk menghapusnya. Hapus beberapa baris sekaligus untuk pengganda combo. Tanpa gravitasi — blok tetap di tempatnya.', color:'#FF00FF' },
  { n:'05', title:'Masuk Papan Peringkat',          desc:'Gunakan tiket berbayar agar skor kamu tercatat di papan peringkat resmi. Skor terbaikmu per periode memenuhi syarat hadiah USDC.', color:'#FF6B00' },
];

const SCORING_TABLE_EN = [
  { clear:'Single (1 line)',   mult:'×1.0',     pts:'80 pts',       color:'#8888BB' },
  { clear:'Double (2 lines)',  mult:'×1.5',     pts:'240 pts',      color:'#00F5FF' },
  { clear:'Triple (3 lines)',  mult:'×2.0',     pts:'480 pts',      color:'#00FF88' },
  { clear:'Quad (4 lines)',    mult:'×3.0',     pts:'960 pts',      color:'#FFD700' },
  { clear:'Penta (5+ lines)', mult:'×5.0',     pts:'2,000+ pts',   color:'#FF00FF' },
  { clear:'Perfect Board',    mult:'×10 next', pts:'+5,000 BONUS', color:'#FF6B00' },
];
const SCORING_TABLE_ID = [
  { clear:'Tunggal (1 baris)',  mult:'×1.0',     pts:'80 poin',      color:'#8888BB' },
  { clear:'Ganda (2 baris)',    mult:'×1.5',     pts:'240 poin',     color:'#00F5FF' },
  { clear:'Tiga (3 baris)',     mult:'×2.0',     pts:'480 poin',     color:'#00FF88' },
  { clear:'Empat (4 baris)',    mult:'×3.0',     pts:'960 poin',     color:'#FFD700' },
  { clear:'Lima+ (5+ baris)',   mult:'×5.0',     pts:'2.000+ poin',  color:'#FF00FF' },
  { clear:'Papan Sempurna',     mult:'×10 next', pts:'+5.000 BONUS', color:'#FF6B00' },
];

const PRIZE_TIERS = [
  { rank:'1st',  medal:'▲', pct:30, color:'#FFD700' },
  { rank:'2nd',  medal:'◆', pct:20, color:'#C0C0C0' },
  { rank:'3rd',  medal:'◎', pct:15, color:'#CD7F32' },
  { rank:'4th',  medal:'',  pct:10, color:'#00FF88' },
  { rank:'5th',  medal:'',  pct: 8, color:'#00FF88' },
  { rank:'6th',  medal:'',  pct: 6, color:'#00F5FF' },
  { rank:'7th',  medal:'',  pct: 4, color:'#00F5FF' },
  { rank:'8th',  medal:'',  pct: 3, color:'#8888BB' },
  { rank:'9th',  medal:'',  pct: 2, color:'#8888BB' },
  { rank:'10th', medal:'',  pct: 2, color:'#8888BB' },
];

const FEE_BREAKDOWN_EN = [
  { pct:70, label:'Prize Pool',   sub:'Distributed to Top 10 players every 1st of the month', color:'#00FF88' },
  { pct:15, label:'Team Revenue', sub:'Development & operations',                              color:'#00F5FF' },
  { pct:10, label:'Dev Fund',     sub:'Audits, marketing, infrastructure',                    color:'#FF00FF' },
  { pct: 5, label:'Referral Pool',sub:'Paid to referrers — forever',                          color:'#FFD700' },
];
const FEE_BREAKDOWN_ID = [
  { pct:70, label:'Kolam Hadiah',   sub:'Didistribusikan ke 10 pemain teratas setiap tanggal 1', color:'#00FF88' },
  { pct:15, label:'Pendapatan Tim', sub:'Pengembangan & operasional',                            color:'#00F5FF' },
  { pct:10, label:'Dana Dev',       sub:'Audit, pemasaran, infrastruktur',                       color:'#FF00FF' },
  { pct: 5, label:'Kolam Referral', sub:'Dibayar ke perujuk — selamanya',                        color:'#FFD700' },
];

const FAQ_EN = [
  { q:'Is this gambling?',                        a:'No. BlockBite is a skill-based game — your outcome depends entirely on your ability to play well, not random chance. The same legal framework applies as competitive esports tournaments.' },
  { q:'How are prizes distributed?',              a:"BlockBite uses the TDP (Token Distribution Protocol) — streaming vesting on Solana. Each player gets a milestone-vesting stream funded by ticket entry. At month end, the game admin signs toggle_milestone(true) via CPI for the top 10 players, unlocking their streams. Winners then call withdraw() to pull per-second streamed USDC. Losers' streams cancel back to the prize pool. All transparent on-chain." },
  { q:'What if I disconnect during a game?',      a:'Your ticket is consumed at the start of the session. If you disconnect, the ticket is burned (anti-cheat). Your score up to that point is saved on the leaderboard.' },
  { q:'Can I use the same ticket multiple times?',a:'No. One ticket = one session. You can buy multiple tickets and play multiple times — only your best score of the period is used for the leaderboard.' },
  { q:'How does the referral system work?',       a:'You get a unique referral link. Anyone who buys tickets through your link gives you 5% of every ticket they ever buy — automatically, forever.' },
  { q:'Is the smart contract audited?',           a:'The program will be professionally audited before Mainnet launch. On Devnet, the code is open-source and verifiable by anyone on Solana Explorer.' },
];
const FAQ_ID = [
  { q:'Apakah ini perjudian?',                          a:'Tidak. BlockBite adalah game berbasis keahlian — hasilmu bergantung sepenuhnya pada kemampuanmu bermain, bukan keberuntungan acak. Kerangka hukum yang sama berlaku seperti turnamen esports kompetitif.' },
  { q:'Bagaimana hadiah didistribusikan?',              a:'BlockBite menggunakan TDP (Token Distribution Protocol) — vesting streaming di Solana. Setiap pemain mendapatkan stream vesting milestone yang didanai oleh tiket masuk. Di akhir bulan, admin game menandatangani toggle_milestone(true) via CPI untuk 10 pemain teratas. Pemenang memanggil withdraw() untuk menarik USDC. Stream pemain yang tidak menang dibatalkan kembali ke kolam hadiah. Semua transparan on-chain.' },
  { q:'Apa yang terjadi jika saya terputus saat bermain?',a:'Tiket kamu dikonsumsi di awal sesi. Jika terputus, tiket hangus (anti-kecurangan). Skor hingga saat itu tetap tersimpan di papan peringkat.' },
  { q:'Bisakah tiket yang sama digunakan berkali-kali?', a:'Tidak. Satu tiket = satu sesi. Kamu bisa membeli beberapa tiket dan bermain berkali-kali — hanya skor terbaikmu dalam periode yang digunakan untuk papan peringkat.' },
  { q:'Bagaimana sistem referral bekerja?',             a:'Kamu mendapatkan tautan referral unik. Siapa pun yang membeli tiket melalui tautan kamu memberi kamu 5% dari setiap tiket yang mereka beli — otomatis, selamanya.' },
  { q:'Apakah smart contract sudah diaudit?',           a:'Program akan diaudit secara profesional sebelum peluncuran Mainnet. Di Devnet, kode bersifat open-source dan dapat diverifikasi oleh siapa pun di Solana Explorer.' },
];

/* ── Component ────────────────────────────────────────────────────────── */
export default function HowToPlayPage() {
  const { lang } = useApp();
  const id = lang === 'id';

  // Select bilingual arrays based on lang
  const NAV_SECTIONS  = id ? NAV_SECTIONS_ID  : NAV_SECTIONS_EN;
  const STEPS         = id ? STEPS_ID         : STEPS_EN;
  const SCORING_TABLE = id ? SCORING_TABLE_ID : SCORING_TABLE_EN;
  const FEE_BREAKDOWN = id ? FEE_BREAKDOWN_ID : FEE_BREAKDOWN_EN;
  const FAQ_ITEMS     = id ? FAQ_ID           : FAQ_EN;

  const [active,  setActive]  = useState('intro');
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: '-15% 0px -75% 0px' },
    );
    NAV_SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollTo = (sId: string) => {
    document.getElementById(sId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const panel = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: 'var(--ds-surface)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--ds-border)',
    borderRadius: 16,
    ...extra,
  });

  const sectionHead = (color: string, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
      <div style={{ width: 4, height: 28, background: color, borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{
        fontFamily: "'Orbitron', monospace",
        fontSize: 20, fontWeight: 800,
        color: 'var(--ds-text)', margin: 0, letterSpacing: '0.03em',
      }}>{label}</h2>
    </div>
  );

  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 72, minHeight: '100vh', paddingBottom: 100, background: 'var(--ds-bg)', color: 'var(--ds-text)' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px' }}>

          {/* Page title */}
          <div style={{ textAlign: 'center', padding: '24px 0 48px' }}>
            <div style={{
              display: 'inline-block',
              background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)',
              borderRadius: 99, padding: '4px 16px',
              fontFamily: "'Orbitron', monospace", fontSize: 11, color: '#00F5FF',
              letterSpacing: '0.1em', marginBottom: 14,
            }}>
              {id ? 'PANDUAN' : 'GUIDE'}
            </div>
            <h1 style={{
              fontFamily: "'Orbitron', monospace",
              fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900,
              color: 'var(--ds-text)', margin: '0 0 12px',
            }}>
              {id ? 'Cara Main BlockBite' : 'How to Play BlockBite'}
            </h1>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 16,
              color: 'var(--ds-text-dim)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6,
            }}>
              {id
                ? 'Mekanik permainan + skor + cara TDP mengalirkan hadiah vesting langsung ke wallet kamu.'
                : 'Game mechanics + scoring + how TDP streams vesting prizes directly to your wallet.'}
            </p>
          </div>

          {/* Main layout — CSS Grid: content + sidebar */}
          <div className="guide-outer" style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 760px) 200px',
            columnGap: 40, alignItems: 'start', justifyContent: 'center',
          }}>

            {/* ══ LEFT: Content ═══════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 72 }}>

              {/* ── 1. Introduction ── */}
              <section id="intro" style={{ scrollMarginTop: 88 }}>
                {sectionHead('#00F5FF', id ? 'Pengantar' : 'Introduction')}
                <div style={panel({ padding: '28px 32px' })}>
                  <p style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15,
                    color: 'var(--ds-text)', lineHeight: 1.8, margin: '0 0 20px',
                  }}>
                    <strong style={{ color: '#00F5FF' }}>BlockBite</strong>{' '}
                    {id
                      ? <>adalah game puzzle blok berbasis keahlian berhadiah nyata yang dibangun di Solana. Tempatkan potongan, hapus baris, raih skor tinggi — pemain teratas setiap bulan memenangkan <strong style={{ color: '#00FF88' }}>hadiah USDC</strong> nyata yang didistribusikan langsung ke wallet mereka oleh smart contract.</>
                      : <>is a real-stakes, skill-based block puzzle game built on Solana. Place pieces, clear lines, score big — the top players every month win real <strong style={{ color: '#00FF88' }}>USDC prizes</strong> distributed directly to their wallets by a smart contract.</>}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    {[
                      { v:'100%', l: id ? 'On-Chain'         : 'On-Chain',       c:'#00FF88' },
                      { v:'USDC', l: id ? 'Mata Uang Hadiah' : 'Prize Currency', c:'#FFD700' },
                      { v:'Auto', l: id ? 'Distribusi'       : 'Distribution',   c:'#00F5FF' },
                    ].map(stat => (
                      <div key={stat.l} style={{
                        background: 'var(--ds-surface2)', border: `1px solid ${stat.c}22`,
                        borderRadius: 12, padding: '16px', textAlign: 'center',
                      }}>
                        <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 22, fontWeight: 900, color: stat.c, marginBottom: 4 }}>{stat.v}</div>
                        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, color: 'var(--ds-text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* ── 2. How to Play ── */}
              <section id="how-to-play" style={{ scrollMarginTop: 88 }}>
                {sectionHead('#00FF88', id ? 'Cara Main' : 'How to Play')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {STEPS.map((step) => (
                    <div key={step.n} style={{
                      ...panel(),
                      padding: '20px 24px', display: 'flex', gap: 20, alignItems: 'flex-start',
                      borderLeft: `3px solid ${step.color}`,
                    }}>
                      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 22, fontWeight: 900, color: step.color, opacity: 0.5, flexShrink: 0, lineHeight: 1, paddingTop: 2 }}>{step.n}</div>
                      <div>
                        <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: 'var(--ds-text)', marginBottom: 6 }}>{step.title}</div>
                        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, color: 'var(--ds-text-dim)', lineHeight: 1.6 }}>{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 3. Controls ── */}
              <section id="controls" style={{ scrollMarginTop: 88 }}>
                {sectionHead('#FFD700', id ? 'Kontrol' : 'Controls')}
                <div style={panel({ padding: '24px 28px' })}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {(id ? [
                      { key:'1 / 2 / 3',      action:'Pilih potongan dari baki'     },
                      { key:'Klik papan',      action:'Tempatkan potongan terpilih'  },
                      { key:'ESC',             action:'Batalkan pilihan potongan'    },
                      { key:'Klik potongan',   action:'Pilih potongan (alternatif)'  },
                    ] : [
                      { key:'1 / 2 / 3',      action:'Select piece from tray'       },
                      { key:'Click board',     action:'Place selected piece'          },
                      { key:'ESC',             action:'Deselect current piece'        },
                      { key:'Click piece',     action:'Select piece (alternative)'   },
                    ]).map(row => (
                      <div key={row.key} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', background: 'var(--ds-surface2)',
                        borderRadius: 10, border: '1px solid var(--ds-border)',
                      }}>
                        <kbd style={{
                          fontFamily: "'Orbitron', monospace", fontSize: 12, color: '#FFD700',
                          background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)',
                          borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                        }}>{row.key}</kbd>
                        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, color: 'var(--ds-text-dim)' }}>{row.action}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    marginTop: 16, padding: '12px 16px',
                    background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.1)',
                    borderRadius: 10, fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 13, color: 'var(--ds-text-dim)', lineHeight: 1.6,
                  }}>
                    <span style={{ color: '#00F5FF', fontWeight: 600 }}>Game Over</span>{' '}
                    {id
                      ? 'ketika tidak ada dari 3 potongan yang tersedia yang bisa masuk ke mana pun di papan. Tidak ada lagi langkah = sesi berakhir dan skor disimpan.'
                      : 'when none of the 3 available pieces can fit anywhere on the board. No more moves = session ends and score is saved.'}
                  </div>
                </div>
              </section>

              {/* ── 4. Scoring ── */}
              <section id="scoring" style={{ scrollMarginTop: 88 }}>
                {sectionHead('#FF00FF', id ? 'Penilaian' : 'Scoring')}

                <div style={{ ...panel({ overflow: 'hidden', marginBottom: 16 }) }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '14px 1fr auto auto',
                    padding: '10px 20px', borderBottom: '1px solid var(--ds-border)', gap: 16,
                  }}>
                    <div />
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 10, color: 'var(--ds-text-dim)', letterSpacing: '0.1em' }}>{id ? 'TIPE' : 'TYPE'}</div>
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 10, color: 'var(--ds-text-dim)', letterSpacing: '0.1em' }}>{id ? 'PENGGANDA' : 'MULTIPLIER'}</div>
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 10, color: 'var(--ds-text-dim)', letterSpacing: '0.1em', textAlign: 'right' }}>{id ? 'POIN DASAR' : 'BASE PTS'}</div>
                  </div>
                  {SCORING_TABLE.map((row, i) => (
                    <div key={row.clear} style={{
                      display: 'grid', gridTemplateColumns: '14px 1fr auto auto',
                      padding: '13px 20px',
                      borderBottom: i < SCORING_TABLE.length - 1 ? '1px solid var(--ds-border)' : 'none',
                      alignItems: 'center', gap: 16,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: row.color, boxShadow: `0 0 6px ${row.color}` }} />
                      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, color: 'var(--ds-text)' }}>{row.clear}</span>
                      <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: row.color, textShadow: `0 0 10px ${row.color}60` }}>{row.mult}</span>
                      <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 12, color: 'var(--ds-text-dim)', textAlign: 'right' }}>{row.pts}</span>
                    </div>
                  ))}
                </div>

                <div style={panel({ padding: '20px 24px', border: '1px solid rgba(0,245,255,0.1)', background: 'rgba(0,245,255,0.03)' })}>
                  <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: '#00F5FF', letterSpacing: '0.1em', marginBottom: 12 }}>
                    ◆ {id ? 'BONUS RANTAI' : 'CHAIN BONUS'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      { n:'2',  bonus:'+20%',  desc: id ? 'clear beruntun' : 'consecutive clears' },
                      { n:'3',  bonus:'+50%',  desc: id ? 'clear beruntun' : 'consecutive clears' },
                      { n:'5+', bonus:'+100%', desc: id ? 'clear beruntun' : 'consecutive clears' },
                    ].map(c => (
                      <div key={c.n} style={{
                        textAlign: 'center', background: 'rgba(0,245,255,0.05)',
                        borderRadius: 10, padding: '12px 8px', border: '1px solid rgba(0,245,255,0.08)',
                      }}>
                        <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 20, fontWeight: 900, color: '#00F5FF' }}>{c.bonus}</div>
                        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, color: 'var(--ds-text-dim)', marginTop: 4 }}>
                          {c.n} {c.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, color: 'var(--ds-text-dim)', margin: '12px 0 0', lineHeight: 1.5 }}>
                    {id
                      ? 'Rantai direset ketika penempatan potongan tidak menghasilkan clear. Potongan lebih besar juga memberi bonus ukuran kecil.'
                      : 'Chain resets when any piece placement does not result in a clear. Bigger pieces also grant a small size bonus.'}
                  </p>
                </div>
              </section>

              {/* ── 5. Prize Distribution ── */}
              <section id="prize-distribution" style={{ scrollMarginTop: 88 }}>
                {sectionHead('#00FF88', id ? 'Distribusi Hadiah' : 'Prize Distribution')}

                <div style={{ ...panel({ overflow: 'hidden', marginBottom: 16 }) }}>
                  <div style={{
                    padding: '14px 20px', background: 'rgba(0,255,136,0.04)',
                    borderBottom: '1px solid rgba(0,255,136,0.1)',
                    fontFamily: "'Orbitron', monospace", fontSize: 11, color: '#00FF88', letterSpacing: '0.1em',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span>{id ? 'PERINGKAT' : 'RANK'}</span>
                    <span style={{ marginLeft: 'auto', marginRight: 60 }}>{id ? 'BAGIAN KOLAM HADIAH' : 'SHARE OF PRIZE POOL'}</span>
                    <span>{id ? 'ESTIMASI*' : 'ESTIMATE*'}</span>
                  </div>
                  {PRIZE_TIERS.map((tier, i) => (
                    <div key={tier.rank} style={{
                      display: 'grid', gridTemplateColumns: '80px 1fr 90px',
                      padding: '12px 20px',
                      borderBottom: i < PRIZE_TIERS.length - 1 ? '1px solid var(--ds-border)' : 'none',
                      alignItems: 'center', gap: 16,
                    }}>
                      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, fontWeight: 700, color: tier.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tier.medal && <span style={{ fontSize: 16 }}>{tier.medal}</span>}
                        {tier.rank}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ height: 8, flex: 1, background: 'var(--ds-surface2)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(tier.pct / 30) * 100}%`, background: tier.color, borderRadius: 4, boxShadow: `0 0 6px ${tier.color}88` }} />
                        </div>
                        <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 13, fontWeight: 700, color: tier.color, minWidth: 36, textAlign: 'right' }}>{tier.pct}%</span>
                      </div>
                      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 12, color: 'var(--ds-text-dim)', textAlign: 'right' }}>
                        ${tier.pct.toFixed(0)}<span style={{ fontSize: 10, opacity: 0.6 }}> USDC</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: '10px 20px', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, color: 'var(--ds-text-dim)', borderTop: '1px solid var(--ds-border)' }}>
                    {id
                      ? '* Estimasi berdasarkan contoh kolam hadiah $100. Jumlah sebenarnya mengikuti kolam nyata.'
                      : '* Estimate based on a $100 prize pool example. Actual amounts scale with the real pool.'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {/* Qualification */}
                  <div style={panel({ padding: '20px', border: '1px solid rgba(0,245,255,0.1)', background: 'rgba(0,245,255,0.03)' })}>
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: '#00F5FF', letterSpacing: '0.08em', marginBottom: 12 }}>
                      {id ? 'KUALIFIKASI' : 'QUALIFICATION'}
                    </div>
                    {(id ? [
                      'Beli minimal 1 tiket per periode',
                      'Selesaikan sesi game tiket',
                      'Skor otomatis dikirim on-chain',
                      'Skor terbaik periode yang dihitung',
                    ] : [
                      'Buy at least 1 ticket per period',
                      'Complete the ticket game session',
                      'Score is auto-submitted on-chain',
                      'Best score of the period counts',
                    ]).map((req, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < 3 ? 8 : 0 }}>
                        <span style={{ color: '#00F5FF', flexShrink: 0, marginTop: 1 }}>✓</span>
                        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, color: 'var(--ds-text-dim)', lineHeight: 1.5 }}>{req}</span>
                      </div>
                    ))}
                  </div>

                  {/* Claiming process */}
                  <div style={panel({ padding: '20px', border: '1px solid rgba(0,255,136,0.1)', background: 'rgba(0,255,136,0.03)' })}>
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: '#00FF88', letterSpacing: '0.08em', marginBottom: 12 }}>
                      {id ? 'PROSES KLAIM' : 'CLAIMING PROCESS'}
                    </div>
                    {[
                      { n:'1', t: id ? 'Periode berakhir (tanggal 1, 00:00 UTC)' : 'Period ends (1st of month, 00:00 UTC)' },
                      { n:'2', t: id ? 'Smart contract membaca papan peringkat'  : 'Smart contract reads leaderboard' },
                      { n:'3', t: id ? 'USDC otomatis dikirim ke wallet kamu'    : 'USDC auto-sent to your wallet' },
                    ].map(step => (
                      <div key={step.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: "'Orbitron', monospace", fontSize: 10, color: '#00FF88', flexShrink: 0,
                        }}>{step.n}</div>
                        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, color: 'var(--ds-text-dim)', lineHeight: 1.5 }}>{step.t}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 4, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, color: '#00FF88', opacity: 0.7 }}>
                      {id ? 'Tidak perlu tindakan manual. Selamanya.' : 'No manual action required. Ever.'}
                    </div>
                  </div>
                </div>

                <div style={panel({ padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, border: '1px solid rgba(255,215,0,0.1)', background: 'rgba(255,215,0,0.02)' })}>
                  <div style={{ fontSize: 28, flexShrink: 0, color: '#FFD700', fontWeight: 700 }}>⬡</div>
                  <div>
                    <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 12, color: '#FFD700', marginBottom: 4 }}>
                      {id ? 'TRANSPARANSI ON-CHAIN' : 'ON-CHAIN TRANSPARENCY'}
                    </div>
                    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, color: 'var(--ds-text-dim)', lineHeight: 1.5 }}>
                      {id
                        ? 'Setiap transaksi distribusi tercatat secara publik di Solana. Setelah setiap periode, hash transaksi akan diposting agar siapa pun dapat memverifikasi pembayaran di Solana Explorer.'
                        : 'Every distribution transaction is publicly recorded on Solana. After each period, the transaction hash will be posted so anyone can verify payouts on Solana Explorer.'}
                    </div>
                  </div>
                </div>
              </section>

              {/* ── 7. Fee Structure ── */}
              <section id="fee-structure" style={{ scrollMarginTop: 88 }}>
                {sectionHead('#FF6B00', id ? 'Struktur Biaya' : 'Fee Structure')}
                <div style={panel({ padding: '24px 28px' })}>
                  <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, color: 'var(--ds-text-dim)', marginBottom: 24, lineHeight: 1.6 }}>
                    {id
                      ? 'Setiap USDC yang dibelanjakan untuk tiket dibagi secara otomatis oleh smart contract Solana — tidak ada perantara manusia yang mengontrol alokasi:'
                      : 'Every USDC spent on tickets is split automatically by the Solana smart contract — no human intermediary controls the allocation:'}
                  </p>
                  {FEE_BREAKDOWN.map((item, i) => (
                    <div key={item.label} style={{ marginBottom: i < FEE_BREAKDOWN.length - 1 ? 18 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <div>
                          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, color: 'var(--ds-text)', fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, color: 'var(--ds-text-dim)', marginLeft: 8 }}>— {item.sub}</span>
                        </div>
                        <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 16, fontWeight: 700, color: item.color }}>{item.pct}%</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--ds-surface2)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${item.pct}%`, background: `linear-gradient(90deg, ${item.color}, ${item.color}99)`, borderRadius: 4, boxShadow: `0 0 8px ${item.color}66` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 8. FAQ ── */}
              <section id="faq" style={{ scrollMarginTop: 88 }}>
                {sectionHead('#FF00FF', 'FAQ')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {FAQ_ITEMS.map(faq => (
                    <div
                      key={faq.q}
                      style={panel({
                        overflow: 'hidden', cursor: 'pointer',
                        border: openFaq === faq.q ? '1px solid rgba(255,0,255,0.2)' : '1px solid var(--ds-border)',
                        transition: 'border-color 0.2s',
                      })}
                      onClick={() => setOpenFaq(openFaq === faq.q ? null : faq.q)}
                    >
                      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--ds-text)', userSelect: 'none' }}>{faq.q}</span>
                        <span style={{
                          color: openFaq === faq.q ? '#FF00FF' : '#00F5FF', fontSize: 20, flexShrink: 0,
                          transition: 'transform 0.2s, color 0.2s',
                          transform: openFaq === faq.q ? 'rotate(45deg)' : 'none', lineHeight: 1,
                        }}>+</span>
                      </div>
                      {openFaq === faq.q && (
                        <div style={{
                          padding: '0 20px 16px', paddingTop: 14,
                          fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14,
                          color: 'var(--ds-text-dim)', lineHeight: 1.7,
                          borderTop: '1px solid var(--ds-border)',
                        }}>
                          {faq.a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* ── CTA ── */}
              <div style={{
                textAlign: 'center', padding: '40px 32px',
                background: 'linear-gradient(135deg, rgba(0,245,255,0.05), rgba(255,0,255,0.05))',
                border: '1px solid var(--ds-border)', borderRadius: 24,
              }}>
                <h3 style={{ fontFamily: "'Orbitron', monospace", fontSize: 20, color: 'var(--ds-text)', marginBottom: 10 }}>
                  {id ? 'Siap Bersaing?' : 'Ready to compete?'}
                </h3>
                <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--ds-text-dim)', marginBottom: 24, fontSize: 14 }}>
                  {id ? 'Masuk ke peta dan mulai bermain, atau beli tiket untuk masuk ke papan peringkat.' : 'Jump into the map and start playing, or buy tickets to enter the leaderboard.'}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Link href="/map" className="btn btn-primary btn-lg">{id ? 'Main Sekarang →' : 'Play Now →'}</Link>
                  <Link href="/shop" className="btn btn-secondary btn-lg">{id ? 'Beli Tiket' : 'Buy Tickets'}</Link>
                </div>
              </div>

            </div>{/* end LEFT */}

            {/* ══ RIGHT: Sticky Nav ══ */}
            <nav className="guide-nav" style={{ position: 'sticky', top: 88, alignSelf: 'start' }}>
              <div style={{
                fontFamily: "'Orbitron', monospace", fontSize: 10, color: 'var(--ds-text-dim)',
                letterSpacing: '0.12em', marginBottom: 14, paddingLeft: 12,
              }}>{id ? 'ISI' : 'CONTENTS'}</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {NAV_SECTIONS.map(s => (
                  <li key={s.id}>
                    <button
                      onClick={() => scrollTo(s.id)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: active === s.id ? 'rgba(0,245,255,0.06)' : 'transparent',
                        border: 'none', cursor: 'pointer', padding: '8px 12px', borderRadius: 8,
                        fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13,
                        color: active === s.id ? 'var(--ds-text)' : 'var(--ds-text-dim)',
                        fontWeight: active === s.id ? 700 : 400,
                        borderLeft: `3px solid ${active === s.id ? '#00F5FF' : 'transparent'}`,
                        transition: 'all 0.15s', lineHeight: 1.3,
                      } as React.CSSProperties}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link href="/map" style={{
                  display: 'block', textAlign: 'center',
                  background: 'linear-gradient(135deg, #00F5FF, #00FF88)', color: '#000',
                  fontFamily: "'Orbitron', monospace", fontSize: 11, fontWeight: 900,
                  padding: '10px 0', borderRadius: 10, textDecoration: 'none', letterSpacing: '0.05em',
                }}>
                  {id ? 'MAIN SEKARANG' : 'PLAY NOW'}
                </Link>
                <Link href="/shop" style={{
                  display: 'block', textAlign: 'center',
                  background: 'var(--ds-surface2)', color: 'var(--ds-text-dim)',
                  fontFamily: "'Orbitron', monospace", fontSize: 11, fontWeight: 700,
                  padding: '10px 0', borderRadius: 10, textDecoration: 'none',
                  border: '1px solid var(--ds-border)', letterSpacing: '0.05em',
                }}>
                  {id ? 'BELI TIKET' : 'BUY TICKETS'}
                </Link>
              </div>
            </nav>

          </div>
        </div>
      </main>

      <style>{`
        @media (max-width: 900px) {
          .guide-outer { grid-template-columns: 1fr !important; }
          .guide-nav   { display: none !important; }
        }
      `}</style>
    </>
  );
}

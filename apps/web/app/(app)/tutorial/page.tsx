'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import GameCanvas from '@/components/game/GameCanvas';
import { BIOMES } from '@/lib/game/biomes';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { getStreamsByAuthority } from '@/lib/anchor/vesting-client';
import { withRpcFallback } from '@/lib/solana/rpc-manager';
import { useApp } from '@/lib/useApp';
import { T } from '@/lib/theme';

const biome = BIOMES[0]; // Act I — Crystal Caverns (tutorial biome)

function pad2(n: number) { return String(n).padStart(2, '0'); }

function useCampaignCountdown(endDate: Date | null) {
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0, urgent: false });
  useEffect(() => {
    if (!endDate) return;
    const tick = () => {
      const diff = Math.max(0, endDate.getTime() - Date.now());
      setT({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        urgent: diff < 6 * 3600000,
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endDate]);
  return t;
}

export default function TutorialPage() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const id = false;
  const [campaignEnd, setCampaignEnd] = useState<Date | null>(null);
  const countdown = useCampaignCountdown(campaignEnd);

  useEffect(() => {
    if (!publicKey) { setCampaignEnd(null); return; }
    withRpcFallback(conn => getStreamsByAuthority(conn, publicKey))
      .then(streams => {
        const active = streams.filter(s => !s.cancelled);
        if (!active.length) { setCampaignEnd(null); return; }
        const nearest = active.sort(
          (a, b) => Number(a.endTs.toString()) - Number(b.endTs.toString()),
        )[0];
        setCampaignEnd(new Date(Number(nearest.endTs.toString()) * 1000));
      })
      .catch(() => setCampaignEnd(null));
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoringRows = id ? [
    { label: '1 baris',    mult: '×1.0',     color: T.textDim },
    { label: '2 baris',    mult: '×1.5',     color: '#00F5FF' },
    { label: '3 baris',    mult: '×2.0',     color: '#00FF88' },
    { label: '4 baris',    mult: '×3.0',     color: '#FFD700' },
    { label: '5+ baris',   mult: '×5.0',     color: '#FF00FF' },
    { label: 'Sempurna!',  mult: '×10 next', color: '#FF6B00' },
  ] : [
    { label: '1 line',   mult: '×1.0',     color: T.textDim },
    { label: '2 lines',  mult: '×1.5',     color: '#00F5FF' },
    { label: '3 lines',  mult: '×2.0',     color: '#00FF88' },
    { label: '4 lines',  mult: '×3.0',     color: '#FFD700' },
    { label: '5+ lines', mult: '×5.0',     color: '#FF00FF' },
    { label: 'Perfect!', mult: '×10 next', color: '#FF6B00' },
  ];

  const tips = id ? [
    'Tekan 1/2/3 untuk memilih potongan',
    'Klik papan untuk menempatkannya',
    'Hapus baris berurutan untuk bonus rantai',
    'Hapus baris DAN kolom sekaligus untuk combo',
    'Kosongkan papan untuk PAPAN SEMPURNA +5000 poin',
    'Potongan lebih besar = poin bonus lebih banyak',
  ] : [
    'Press 1/2/3 to select a piece',
    'Click the board to place it',
    'Clear lines in sequence for chain bonus',
    'Clear rows AND columns simultaneously for combos',
    'Empty the board for PERFECT BOARD +5000 pts',
    'Bigger pieces = more bonus points',
  ];

  const cdLabels = id
    ? [{ l: 'H' }, { l: 'J' }, { l: 'M' }, { l: 'D' }]
    : [{ l: 'D' }, { l: 'H' }, { l: 'M' }, { l: 'S' }];
  const cdValues = [countdown.d, countdown.h, countdown.m, countdown.s];

  return (
    <>
      {/* Biome backdrop */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -2, background: biome.sky, overflow: 'hidden', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, background: biome.fog, pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, background: 'radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 40%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

      <main style={{ paddingTop: 64, minHeight: '100vh' }}>

        {/* Top breadcrumb bar */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 24px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => router.push('/map/1')}
            style={{
              padding: '7px 16px', borderRadius: 10,
              border: `1px solid ${biome.accent}44`,
              background: T.surface, color: biome.glow,
              fontFamily: "'Orbitron', monospace", fontSize: 11,
              cursor: 'pointer', letterSpacing: '0.06em',
            }}
          >
            ← {id ? 'KEMBALI KE PETA' : 'BACK TO MAP'}
          </button>
          <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 13, color: biome.glow, fontWeight: 700 }}>
            {id ? 'PREVIEW GRATIS' : 'FREE PREVIEW'}
          </span>
          <span style={{
            fontFamily: "'Orbitron', monospace", fontSize: 10,
            color: T.textDim, opacity: 0.9, letterSpacing: '0.2em',
            padding: '4px 10px', borderRadius: 999,
            background: `${biome.accent}22`, border: `1px solid ${biome.accent}55`,
          }}>
            {id ? 'BABAK' : 'ACT'} I · {biome.name.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={() => router.push('/map/1')}
            style={{
              marginLeft: 'auto', padding: '8px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, #00F5FF, #7c3aed)',
              border: 'none', color: '#000',
              fontFamily: T.serif, fontSize: 12,
              fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em',
              boxShadow: '0 0 16px rgba(0,245,255,0.3)',
            }}
          >
            ▶ {id ? 'Ke Game Sungguhan' : 'Go to Real Game'}
          </button>
        </div>

        {/* Main 3-column layout */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 24,
          padding: '16px 24px 40px', maxWidth: 1100, margin: '0 auto', alignItems: 'start',
        }}>

          {/* Left sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>

            {/* Scoring guide */}
            <div style={{
              background: `linear-gradient(180deg, ${biome.accent}0d 0%, ${T.surface} 100%)`,
              backdropFilter: 'blur(12px)', border: `1px solid ${biome.accent}33`,
              borderRadius: 16, padding: '20px',
            }}>
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: biome.accent, letterSpacing: '0.08em', marginBottom: 12 }}>
                {id ? 'PANDUAN SKOR' : 'SCORING GUIDE'}
              </div>
              {scoringRows.map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0', borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontFamily: T.serif, fontSize: 12, color: T.textDim }}>{row.label}</span>
                  <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: row.color, fontWeight: 700 }}>{row.mult}</span>
                </div>
              ))}
              <div style={{ marginTop: 10, fontFamily: T.serif, fontSize: 11, color: '#00FF88' }}>
                {id ? 'Clear beruntun: +20% / +50% / +100%' : 'Consecutive clears: +20% / +50% / +100%'}
              </div>
            </div>

            {/* CTA: Go to Map */}
            <button
              type="button"
              onClick={() => router.push('/map/1')}
              style={{
                display: 'block', width: '100%', textAlign: 'center', padding: '13px 16px',
                background: `linear-gradient(135deg, ${biome.accent}, ${biome.glow})`,
                border: 'none', borderRadius: 12, color: '#000', fontWeight: 800, fontSize: 13,
                cursor: 'pointer', fontFamily: T.serif, letterSpacing: '0.06em',
              }}
            >
              {id ? 'MAIN DI PETA → BABAK I' : 'PLAY ON MAP → ACT I'}
            </button>
          </div>

          {/* Game Canvas — Center */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{
              padding: 14, borderRadius: 24,
              background: `linear-gradient(180deg, ${biome.accent}1a 0%, ${T.surface} 60%)`,
              border: `1px solid ${biome.accent}66`,
            }}>
              <GameCanvas />
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>

            {/* Quick tips */}
            <div style={{
              background: `linear-gradient(180deg, ${biome.accent}0d 0%, ${T.surface} 100%)`,
              backdropFilter: 'blur(12px)', border: `1px solid ${biome.accent}33`,
              borderRadius: 16, padding: '20px',
            }}>
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: biome.accent, letterSpacing: '0.08em', marginBottom: 12 }}>
                {id ? 'TIPS CEPAT' : 'QUICK TIPS'}
              </div>
              {tips.map((tip, i) => (
                <div key={i} style={{
                  fontFamily: T.serif, fontSize: 12, color: T.textDim,
                  padding: '5px 0', borderBottom: i < tips.length - 1 ? `1px solid ${T.border}` : 'none',
                  lineHeight: 1.4,
                }}>{tip}</div>
              ))}
            </div>

            {/* Biome info */}
            <div style={{
              background: `linear-gradient(135deg, ${biome.accent}10, ${biome.glow}10)`,
              backdropFilter: 'blur(12px)', border: `1px solid ${biome.accent}33`,
              borderRadius: 16, padding: '20px',
            }}>
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 11, color: biome.accent, marginBottom: 8 }}>
                {id ? 'BABAK' : 'ACT'} I — {biome.name.toUpperCase()}
              </div>
              <div style={{ fontFamily: T.serif, fontSize: 12, color: T.textDim, lineHeight: 1.6, marginBottom: 12 }}>
                {id
                  ? 'Ini adalah preview gratis Babak I. Bermain tanpa wallet untuk mempelajari mekanismenya. Hubungkan untuk menyimpan skor dan mendaki peta.'
                  : 'This is a free preview of Act I. Play without a wallet to learn the mechanics. Connect to save your score and climb the map.'}
              </div>
              <button
                type="button"
                onClick={() => router.push('/map/1')}
                style={{
                  display: 'block', width: '100%', textAlign: 'center', padding: '10px 0',
                  background: `linear-gradient(135deg, ${biome.accent}, ${biome.glow})`,
                  border: 'none', borderRadius: 10, color: '#000', fontWeight: 800, fontSize: 12,
                  cursor: 'pointer', fontFamily: T.serif,
                }}
              >
                {id ? 'MASUK PETA → LEVEL 1' : 'ENTER MAP → LEVEL 1'}
              </button>
            </div>

            {/* Campaign countdown */}
            <div style={{
              background: `linear-gradient(180deg, ${biome.accent}0d 0%, ${T.surface} 100%)`,
              backdropFilter: 'blur(12px)',
              border: `1px solid ${countdown.urgent ? '#FF3366' : biome.accent}33`,
              borderRadius: 16, padding: '20px', textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Orbitron', monospace", fontSize: 11,
                color: countdown.urgent ? '#FF3366' : biome.accent,
                letterSpacing: '0.08em', marginBottom: 12,
              }}>
                {countdown.urgent
                  ? (id ? '⚠ SEGERA BERAKHIR' : '⚠ ENDING SOON')
                  : (id ? 'PERIODE KAMPANYE' : 'CAMPAIGN PERIOD')}
              </div>

              {!connected ? (
                <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.6 }}>
                  {id
                    ? 'Hubungkan wallet untuk melihat periode kampanye aktif Anda.'
                    : 'Connect your wallet to see your active campaign period.'}
                </div>
              ) : !campaignEnd ? (
                <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.6 }}>
                  {id ? 'Tidak ada kampanye aktif.' : 'No active campaign.'}{' '}
                  <a href="/new" style={{ color: '#00F5FF', textDecoration: 'none' }}>
                    {id ? 'Buat stream →' : 'Create a stream →'}
                  </a>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 10 }}>
                    {cdLabels.map((u, i) => (
                      <span key={u.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{
                            fontFamily: "'Orbitron', monospace", fontSize: 22, fontWeight: 800, lineHeight: 1,
                            color: countdown.urgent ? '#FF3366' : '#00F5FF',
                            textShadow: countdown.urgent ? '0 0 16px #FF336688' : '0 0 16px rgba(0,245,255,0.5)',
                          }}>
                            {pad2(cdValues[i])}
                          </span>
                          <span style={{ fontSize: 9, color: T.textDim, fontWeight: 600 }}>{u.l}</span>
                        </span>
                        {i < 3 && (
                          <span style={{
                            fontFamily: "'Orbitron', monospace", fontSize: 22, fontWeight: 800,
                            color: countdown.urgent ? '#FF336666' : '#33337a', marginTop: -8,
                          }}>:</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: T.textDim }}>
                    {id ? 'Berakhir' : 'Ends'} {campaignEnd.toLocaleDateString(id ? 'id-ID' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: '#5fd07a' }}>
                    ✓ {id ? 'Harus main game untuk klaim token' : 'Must play game to claim tokens'}
                  </div>
                </>
              )}
            </div>

            {/* Prizes CTA */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,245,255,0.05), rgba(255,0,255,0.05))',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${T.border}`,
              borderRadius: 16, padding: '20px', textAlign: 'center',
            }}>
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 13, color: '#00F5FF', marginBottom: 8 }}>
                {id ? 'BERSAING UNTUK HADIAH' : 'COMPETE FOR PRIZES'}
              </div>
              <div style={{ fontFamily: T.serif, fontSize: 12, color: T.textDim, marginBottom: 16, lineHeight: 1.5 }}>
                {id
                  ? 'Beli tiket agar skor Anda dihitung di papan peringkat resmi dan bersaing untuk hadiah USDC.'
                  : 'Buy a ticket to make your score count on the official leaderboard and compete for USDC prizes.'}
              </div>
              <a href="/shop" style={{
                display: 'block', padding: '10px 0', textAlign: 'center',
                background: 'linear-gradient(135deg, #00F5FF, #FF00FF)',
                borderRadius: 10, color: '#000', fontWeight: 800, fontSize: 13,
                textDecoration: 'none', fontFamily: T.serif,
              }}>
                {id ? 'Dapatkan Tiket →' : 'Get Tickets →'}
              </a>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @media (max-width: 900px) {
          main > div:last-child { grid-template-columns: 1fr !important; }
          main > div:last-child > div:first-child,
          main > div:last-child > div:last-child { display: none !important; }
        }
      `}</style>
    </>
  );
}

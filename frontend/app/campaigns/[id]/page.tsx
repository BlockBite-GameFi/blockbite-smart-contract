'use client';

/**
 * /campaigns/[id] — Campaign Recipient View
 *
 * Flow (per flowchart):
 *   1. Connect wallet
 *   2. Connect stream (accept the campaign invite)
 *   3. View campaign details (isi campaign)
 *   4. Verify:
 *      - If gameGate ON  → Play BlockBite → finish levels → click Verify
 *      - If gameGate OFF → Auto-verified, claim button active immediately
 *   5. Claim / Withdraw
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

// ─── Mock campaign lookup ──────────────────────────────────────────────────────
// In production this would be fetched from the on-chain program via stream PDA.
// For now we pull it from a small static map keyed by campaign ID.
interface Campaign {
  id: string; name: string; description: string;
  token: string; budget: number; allocated: number;
  streamType: string; cliffDays: number; vestDays: number;
  gateType: string;
  gameGate: boolean; gameLevel: number;
  streamPda: string;
}

const MOCK_CAMPAIGNS: Record<string, Campaign> = {
  'camp-001': {
    id: 'camp-001', name: 'Team Allocation — Core Dev', description: 'Core development team token distribution for Q3 2026.',
    token: 'BBT', budget: 500_000, allocated: 62_500,
    streamType: 'linear', cliffDays: 90, vestDays: 365,
    gateType: 'manual', gameGate: true, gameLevel: 10,
    streamPda: 'DvhxiL5P…XTFf',
  },
  'camp-002': {
    id: 'camp-002', name: 'Advisor Round', description: 'Advisor token grants with milestone-based unlocks.',
    token: 'BBT', budget: 120_000, allocated: 12_000,
    streamType: 'milestone', cliffDays: 60, vestDays: 365,
    gateType: 'manual', gameGate: false, gameLevel: 0,
    streamPda: '9qP5…nBjc',
  },
};

// ─── Step indicator ────────────────────────────────────────────────────────────
function Steps({ current, lang }: { current: number; lang: 'en' | 'id' }) {
  const steps = [
    { n: 1, label: lang === 'en' ? 'Connect Wallet' : 'Hubungkan Wallet' },
    { n: 2, label: lang === 'en' ? 'Connect Stream'  : 'Hubungkan Stream' },
    { n: 3, label: lang === 'en' ? 'Verify'          : 'Verifikasi' },
    { n: 4, label: lang === 'en' ? 'Claim'           : 'Klaim' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: current > s.n
                ? T.green
                : current === s.n
                ? T.grad
                : 'rgba(255,255,255,.06)',
              border: `1.5px solid ${current > s.n ? T.green : current === s.n ? T.accent : T.border}`,
              color: current >= s.n ? '#fff' : T.textDim,
              boxShadow: current === s.n ? `0 0 10px ${T.accentA4}` : 'none',
            }}>
              {current > s.n ? '✓' : s.n}
            </div>
            <span style={{
              fontSize: 11.5, fontWeight: current === s.n ? 700 : 400,
              color: current === s.n ? T.text : current > s.n ? T.green : T.textDim,
              whiteSpace: 'nowrap',
            }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, margin: '0 8px', background: current > s.n + 1 ? T.greenA1 : T.border }} />
          )}
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.textDim }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: 12, color: color ?? T.text, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { lang } = useApp();

  const campaign = MOCK_CAMPAIGNS[id ?? ''] ?? null;

  // Local state: stream connected, verified
  const [streamConnected, setStreamConnected] = useState(false);
  const [verified, setVerified]               = useState(false);
  const [claiming, setClaiming]               = useState(false);
  const [claimed, setClaimed]                 = useState(false);

  // Check localStorage for persisted verification (set by the game via URL param)
  useEffect(() => {
    if (!id) return;
    const key = `campaign_verified_${id}`;
    if (localStorage.getItem(key) === '1') setVerified(true);
  }, [id]);

  // Derive current step
  const step = !connected ? 1 : !streamConnected ? 2 : !verified && campaign?.gameGate ? 3 : 4;

  // Campaign not found
  if (!campaign) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 32, opacity: .3 }}>◈</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.textDim }}>
            {lang === 'en' ? 'Campaign not found' : 'Kampanye tidak ditemukan'}
          </div>
          <Link href="/campaigns" style={{ color: T.accent, fontSize: 13, textDecoration: 'none' }}>
            {lang === 'en' ? '← My Campaigns' : '← Kampanye Saya'}
          </Link>
        </div>
      </div>
    );
  }

  // Claim success screen
  if (claimed) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
              background: T.greenA1, border: `2px solid ${T.green}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
            }}>🎉</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: T.gold, marginBottom: 8 }}>
              {lang === 'en' ? 'Tokens Claimed!' : 'Token Diklaim!'}
            </h2>
            <p style={{ fontSize: 14, color: T.textDim, lineHeight: 1.7, marginBottom: 24 }}>
              <strong style={{ color: T.text }}>{campaign.allocated.toLocaleString()} {campaign.token}</strong>{' '}
              {lang === 'en'
                ? 'has been sent to your wallet. Remaining tokens will unlock according to the vesting schedule.'
                : 'telah dikirim ke wallet kamu. Token yang tersisa akan terbuka sesuai jadwal vesting.'}
            </p>
            <Link href="/campaigns" style={{
              padding: '11px 28px', borderRadius: 11,
              background: T.grad,
              color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13,
            }}>
              {lang === 'en' ? '← Back to My Campaigns' : '← Kembali ke Kampanye Saya'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isVerifiedOrNoGate = verified || !campaign.gameGate;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      <Navbar />

      {/* ── Page header ── */}
      <div style={{
        padding: '80px 32px 28px',
        borderBottom: `1px solid ${T.border}`,
        background: T.header,
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link href="/campaigns" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: T.textDim, textDecoration: 'none', marginBottom: 14,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${T.border}`,
          }}>
            {lang === 'en' ? '← My Campaigns' : '← Kampanye Saya'}
          </Link>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>
            {lang === 'en' ? 'Campaign · Recipient View' : 'Kampanye · Tampilan Penerima'}
          </div>
          <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, margin: '0 0 6px' }}>
            {campaign.name}
          </h1>
          <p style={{ fontSize: 13, color: T.textDim, margin: 0 }}>{campaign.description}</p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 32px 100px' }}>

        {/* Step indicator */}
        <Steps current={step} lang={lang} />

        {/* ── Step 1: Connect Wallet ── */}
        {!connected && (
          <div style={{
            padding: '32px', borderRadius: 18, textAlign: 'center',
            background: T.bg1, border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 16, opacity: .5 }}>◈</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              {lang === 'en' ? 'Connect Your Wallet' : 'Hubungkan Wallet Kamu'}
            </div>
            <p style={{ fontSize: 13, color: T.textDim, maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.7 }}>
              {lang === 'en'
                ? 'Connect your Solana wallet to verify you are an eligible recipient of this campaign.'
                : 'Hubungkan wallet Solana kamu untuk memverifikasi bahwa kamu adalah penerima yang memenuhi syarat untuk kampanye ini.'}
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '13px 32px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: T.grad,
                color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: T.serif,
                boxShadow: `0 0 20px ${T.accentA4}`,
              }}
            >
              {lang === 'en' ? 'Connect Wallet →' : 'Hubungkan Wallet →'}
            </button>
          </div>
        )}

        {/* ── Step 2: Connect Stream ── */}
        {connected && !streamConnected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Wallet confirmed */}
            <div style={{
              padding: '14px 18px', borderRadius: 12,
              background: T.greenA1, border: `1px solid ${T.green}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ color: T.green, fontSize: 18 }}>✓</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.green }}>
                  {lang === 'en' ? 'Wallet connected' : 'Wallet terhubung'}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim, marginTop: 2 }}>
                  {publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}
                </div>
              </div>
            </div>

            {/* Connect stream */}
            <div style={{ padding: '28px 26px', borderRadius: 18, background: T.bg1, border: `1.5px solid ${T.accentA2}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
                {lang === 'en' ? 'Connect to Stream' : 'Hubungkan ke Stream'}
              </div>
              <p style={{ fontSize: 13, color: T.textDim, lineHeight: 1.7, marginBottom: 20 }}>
                {lang === 'en'
                  ? 'Accept the campaign invitation. This links your wallet to the on-chain PDA vault and registers you as an eligible recipient.'
                  : 'Terima undangan kampanye. Ini menghubungkan wallet kamu ke PDA vault on-chain dan mendaftarkan kamu sebagai penerima yang memenuhi syarat.'}
              </p>

              {/* Campaign info preview */}
              <div style={{
                padding: '14px 16px', borderRadius: 12, marginBottom: 20,
                background: T.bg2, border: `1px solid ${T.border}`,
              }}>
                <InfoRow label="Stream PDA"   value={campaign.streamPda} />
                <InfoRow label="Token"        value={campaign.token}     color={T.gold} />
                <InfoRow label={lang === 'en' ? 'Your Share' : 'Bagian Kamu'}
                         value={`${campaign.allocated.toLocaleString()} ${campaign.token}`} color={T.green} />
                <InfoRow label={lang === 'en' ? 'Stream Type' : 'Tipe Stream'}
                         value={campaign.streamType} color={T.accent} />
                <InfoRow label={lang === 'en' ? 'Cliff' : 'Cliff'}
                         value={`${campaign.cliffDays} ${lang === 'en' ? 'days' : 'hari'}`} />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
                  <span style={{ fontSize: 12, color: T.textDim }}>
                    {lang === 'en' ? 'Vesting' : 'Vesting'}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, fontWeight: 600 }}>
                    {campaign.vestDays} {lang === 'en' ? 'days' : 'hari'}
                  </span>
                </div>
              </div>

              {campaign.gameGate && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 20,
                  background: T.accentA1, border: `1px solid ${T.accentA2}`,
                  fontSize: 12.5, color: T.green, lineHeight: 1.7,
                }}>
                  ◈{' '}
                  {lang === 'en'
                    ? <>This campaign requires <strong>BlockBite Game verification</strong> — you must complete{' '}
                        <strong>Level {campaign.gameLevel}</strong> to unlock your tokens.</>
                    : <>Kampanye ini memerlukan <strong>verifikasi Game BlockBite</strong> — kamu harus menyelesaikan{' '}
                        <strong>Level {campaign.gameLevel}</strong> untuk membuka token kamu.</>
                  }
                </div>
              )}

              <button
                onClick={() => setStreamConnected(true)}
                style={{
                  width: '100%', padding: '13px', borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: T.grad,
                  color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: T.serif,
                  boxShadow: `0 0 18px ${T.accentA4}`,
                }}
              >
                {lang === 'en' ? 'Accept & Connect Stream →' : 'Terima & Hubungkan Stream →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 + 4: Stream connected — show campaign details + verify + claim ── */}
        {connected && streamConnected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Campaign summary card ── */}
            <div style={{ padding: '20px 22px', borderRadius: 16, background: T.bg1, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: T.textDim, marginBottom: 14 }}>
                {lang === 'en' ? 'Your Campaign' : 'Kampanye Kamu'}
              </div>
              <InfoRow label={lang === 'en' ? 'Campaign' : 'Kampanye'}
                       value={campaign.name} />
              <InfoRow label="Token"       value={campaign.token}  color={T.gold} />
              <InfoRow label={lang === 'en' ? 'Your Allocation' : 'Alokasi Kamu'}
                       value={`${campaign.allocated.toLocaleString()} ${campaign.token}`} color={T.green} />
              <InfoRow label={lang === 'en' ? 'Stream Type' : 'Tipe Stream'}
                       value={campaign.streamType} color={T.accent} />
              <InfoRow label={lang === 'en' ? 'Cliff' : 'Cliff'}
                       value={`${campaign.cliffDays} ${lang === 'en' ? 'days' : 'hari'}`} />
              <InfoRow label={lang === 'en' ? 'Vesting' : 'Vesting'}
                       value={`${campaign.vestDays} ${lang === 'en' ? 'days' : 'hari'}`} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
                <span style={{ fontSize: 12, color: T.textDim }}>
                  {lang === 'en' ? 'Verification' : 'Verifikasi'}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                  color: campaign.gameGate ? T.green : T.textDim,
                }}>
                  {campaign.gameGate ? `◈ BlockBite Level ${campaign.gameLevel}` : campaign.gateType}
                </span>
              </div>
            </div>

            {/* ── Verification section ── */}
            {campaign.gameGate && !verified && (
              <div style={{
                padding: '24px 22px', borderRadius: 16,
                background: T.accentA1, border: `1.5px solid ${T.accentA2}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 22 }}>◈</span>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.green }}>
                    {lang === 'en' ? 'Game Verification Required' : 'Verifikasi Game Diperlukan'}
                  </div>
                </div>
                <p style={{ fontSize: 13, color: T.textDim, lineHeight: 1.7, marginBottom: 20 }}>
                  {lang === 'en'
                    ? <>The campaign builder requires you to complete <strong style={{ color: T.green }}>
                        Level {campaign.gameLevel}
                      </strong> in the BlockBite puzzle game. Play the game, complete the levels,
                      then click the Verify button to unlock your tokens.</>
                    : <>Pembuat kampanye mengharuskan kamu menyelesaikan <strong style={{ color: T.green }}>
                        Level {campaign.gameLevel}
                      </strong> dalam game puzzle BlockBite. Mainkan game, selesaikan level-levelnya,
                      lalu klik tombol Verifikasi untuk membuka token kamu.</>
                  }
                </p>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {/* Play game — links to /map with maxLevel and campaignId */}
                  <Link
                    href={`/map/1?maxLevel=${campaign.gameLevel}&campaignId=${campaign.id}`}
                    style={{
                      flex: 1, minWidth: 160,
                      padding: '12px 20px', borderRadius: 10, textAlign: 'center',
                      background: `linear-gradient(135deg, ${T.green}cc, #16a34acc)`,
                      color: '#0a0a14', fontWeight: 800, fontSize: 13,
                      textDecoration: 'none',
                      boxShadow: `0 0 18px ${T.greenA1}`,
                    }}
                  >
                    {lang === 'en' ? '▶ Play BlockBite' : '▶ Main BlockBite'}
                  </Link>

                  {/* Verify button — active only after game is done */}
                  <button
                    onClick={() => {
                      // In production: call verify_game_gate() on-chain.
                      // For now, mark verified in localStorage.
                      localStorage.setItem(`campaign_verified_${campaign.id}`, '1');
                      setVerified(true);
                    }}
                    style={{
                      flex: 1, minWidth: 160,
                      padding: '12px 20px', borderRadius: 10,
                      border: `1px solid ${T.accentA4}`,
                      background: T.accentA2,
                      color: T.green, fontWeight: 700, fontSize: 13,
                      cursor: 'pointer', fontFamily: T.serif,
                    }}
                  >
                    {lang === 'en' ? '✦ Submit Verification' : '✦ Kirim Verifikasi'}
                  </button>
                </div>

                <div style={{ marginTop: 14, fontSize: 11, color: T.textDim }}>
                  {lang === 'en'
                    ? `Complete all ${campaign.gameLevel} levels in BlockBite, then click Submit Verification above.`
                    : `Selesaikan semua ${campaign.gameLevel} level di BlockBite, lalu klik Kirim Verifikasi di atas.`}
                </div>
              </div>
            )}

            {/* ── Verified badge ── */}
            {(verified || !campaign.gameGate) && (
              <div style={{
                padding: '14px 18px', borderRadius: 12,
                background: T.greenA1, border: `1px solid ${T.green}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 22, color: T.green }}>✦</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.green }}>
                    {lang === 'en' ? 'Verification complete' : 'Verifikasi selesai'}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 2 }}>
                    {campaign.gameGate
                      ? (lang === 'en'
                          ? `BlockBite Level ${campaign.gameLevel} cleared — tokens are unlocked`
                          : `BlockBite Level ${campaign.gameLevel} selesai — token terbuka`)
                      : (lang === 'en'
                          ? 'No game verification required — tokens are ready'
                          : 'Tidak ada verifikasi game — token siap diklaim')}
                  </div>
                </div>
              </div>
            )}

            {/* ── Claim / Withdraw button ── */}
            <div style={{
              padding: '24px 22px', borderRadius: 16,
              background: isVerifiedOrNoGate ? T.goldA1 : T.bg1,
              border: `1.5px solid ${isVerifiedOrNoGate ? T.gold : T.border}`,
              transition: 'all .3s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isVerifiedOrNoGate ? T.gold : T.textDim, marginBottom: 4 }}>
                    {isVerifiedOrNoGate
                      ? (lang === 'en' ? 'Ready to Claim' : 'Siap Diklaim')
                      : (lang === 'en' ? 'Locked — Verification Required' : 'Terkunci — Verifikasi Diperlukan')}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 800, color: isVerifiedOrNoGate ? T.green : T.textDim }}>
                    {campaign.allocated.toLocaleString()} {campaign.token}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>
                    {lang === 'en' ? 'vested amount available to withdraw' : 'jumlah vesting yang tersedia untuk ditarik'}
                  </div>
                </div>

                <button
                  disabled={!isVerifiedOrNoGate || claiming}
                  onClick={async () => {
                    if (!isVerifiedOrNoGate) return;
                    setClaiming(true);
                    // Simulate on-chain withdraw call
                    await new Promise(r => setTimeout(r, 1400));
                    setClaiming(false);
                    setClaimed(true);
                  }}
                  style={{
                    padding: '14px 32px', borderRadius: 12, border: 'none',
                    background: isVerifiedOrNoGate
                      ? `linear-gradient(135deg,${T.gold}cc,#a36a17)`
                      : T.surface,
                    color: isVerifiedOrNoGate ? '#0b0a14' : T.textDim,
                    fontWeight: 900, fontSize: 15, cursor: isVerifiedOrNoGate ? 'pointer' : 'not-allowed',
                    fontFamily: T.serif, letterSpacing: '.02em',
                    boxShadow: isVerifiedOrNoGate ? `0 0 20px ${T.goldA1}` : 'none',
                    transition: 'all .2s',
                  }}
                >
                  {claiming
                    ? (lang === 'en' ? 'Withdrawing…' : 'Menarik…')
                    : isVerifiedOrNoGate
                      ? (lang === 'en' ? '↓ Withdraw Tokens' : '↓ Tarik Token')
                      : (lang === 'en' ? '🔒 Locked' : '🔒 Terkunci')}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

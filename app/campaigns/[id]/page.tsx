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

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg0: '#08081a', bg1: '#09081e', bg2: '#0f0d24',
  accent: '#a78bfa', gold: '#f5c66a', green: '#5fd07a',
  blue: '#7ad7ff', red: '#ff3b6b', game: '#4ade80',
  muted: 'rgba(148,163,184,.7)', border: 'rgba(167,139,250,.15)',
  card: 'rgba(255,255,255,.035)',
  mono: "'JetBrains Mono', monospace",
  serif: "'Space Grotesk', system-ui, sans-serif",
};

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
function Steps({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Connect Wallet' },
    { n: 2, label: 'Connect Stream'  },
    { n: 3, label: 'Verify'          },
    { n: 4, label: 'Claim'           },
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
                ? C.green
                : current === s.n
                ? `linear-gradient(135deg,${C.accent},#5e35d4)`
                : 'rgba(255,255,255,.06)',
              border: `1.5px solid ${current > s.n ? C.green : current === s.n ? C.accent : C.border}`,
              color: current >= s.n ? '#fff' : C.muted,
              boxShadow: current === s.n ? `0 0 10px ${C.accent}55` : 'none',
            }}>
              {current > s.n ? '✓' : s.n}
            </div>
            <span style={{
              fontSize: 11.5, fontWeight: current === s.n ? 700 : 400,
              color: current === s.n ? '#e8e1f8' : current > s.n ? C.green : C.muted,
              whiteSpace: 'nowrap',
            }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, margin: '0 8px', background: current > s.n + 1 ? `${C.green}55` : C.border }} />
          )}
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value, color = '#e8e1f8' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

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
      <div style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 32, opacity: .3 }}>◈</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.muted }}>Campaign not found</div>
          <Link href="/campaigns" style={{ color: C.accent, fontSize: 13, textDecoration: 'none' }}>← My Campaigns</Link>
        </div>
      </div>
    );
  }

  // Claim success screen
  if (claimed) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 440 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
              background: `${C.green}18`, border: `2px solid ${C.green}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
            }}>🎉</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Tokens Claimed!</h2>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
              <strong style={{ color: '#e8e1f8' }}>{campaign.allocated.toLocaleString()} {campaign.token}</strong> has been sent to your wallet.
              Remaining tokens will unlock according to the vesting schedule.
            </p>
            <Link href="/campaigns" style={{
              padding: '11px 28px', borderRadius: 11,
              background: `linear-gradient(135deg,${C.accent},#5e35d4)`,
              color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13,
            }}>← Back to My Campaigns</Link>
          </div>
        </div>
      </div>
    );
  }

  const isVerifiedOrNoGate = verified || !campaign.gameGate;

  return (
    <div style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
      <Navbar />

      {/* ── Page header ── */}
      <div style={{
        padding: '80px 32px 28px',
        borderBottom: `1px solid ${C.border}`,
        background: 'linear-gradient(180deg, #0a0820 0%, #08081a 100%)',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link href="/campaigns" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 14,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
          }}>← My Campaigns</Link>
          <div style={{ fontSize: 11, letterSpacing: 2, color: C.accent, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>
            Campaign · Recipient View
          </div>
          <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, margin: '0 0 6px' }}>
            {campaign.name}
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{campaign.description}</p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 32px 100px' }}>

        {/* Step indicator */}
        <Steps current={step} />

        {/* ── Step 1: Connect Wallet ── */}
        {!connected && (
          <div style={{
            padding: '32px', borderRadius: 18, textAlign: 'center',
            background: C.bg1, border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 16, opacity: .5 }}>◈</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Connect Your Wallet</div>
            <p style={{ fontSize: 13, color: C.muted, maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.7 }}>
              Connect your Solana wallet to verify you are an eligible recipient of this campaign.
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '13px 32px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg,${C.accent},#5e35d4)`,
                color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: C.serif,
                boxShadow: `0 0 20px ${C.accent}44`,
              }}
            >
              Connect Wallet →
            </button>
          </div>
        )}

        {/* ── Step 2: Connect Stream ── */}
        {connected && !streamConnected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Wallet confirmed */}
            <div style={{
              padding: '14px 18px', borderRadius: 12,
              background: `${C.green}08`, border: `1px solid ${C.green}33`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ color: C.green, fontSize: 18 }}>✓</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Wallet connected</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}
                </div>
              </div>
            </div>

            {/* Connect stream */}
            <div style={{ padding: '28px 26px', borderRadius: 18, background: C.bg1, border: `1.5px solid ${C.accent}33` }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Connect to Stream</div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
                Accept the campaign invitation. This links your wallet to the on-chain PDA vault
                and registers you as an eligible recipient.
              </p>

              {/* Campaign info preview */}
              <div style={{
                padding: '14px 16px', borderRadius: 12, marginBottom: 20,
                background: C.bg2, border: `1px solid ${C.border}`,
              }}>
                <InfoRow label="Stream PDA"   value={campaign.streamPda} />
                <InfoRow label="Token"        value={campaign.token}     color={C.gold} />
                <InfoRow label="Your Share"   value={`${campaign.allocated.toLocaleString()} ${campaign.token}`} color={C.green} />
                <InfoRow label="Stream Type"  value={campaign.streamType} color={C.accent} />
                <InfoRow label="Cliff"        value={`${campaign.cliffDays} days`} />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Vesting</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: '#e8e1f8', fontWeight: 600 }}>
                    {campaign.vestDays} days
                  </span>
                </div>
              </div>

              {campaign.gameGate && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 20,
                  background: `${C.game}0a`, border: `1px solid ${C.game}33`,
                  fontSize: 12.5, color: C.game, lineHeight: 1.7,
                }}>
                  ◈ This campaign requires <strong>BlockBite Game verification</strong> — you must complete{' '}
                  <strong>Level {campaign.gameLevel}</strong> to unlock your tokens.
                </div>
              )}

              <button
                onClick={() => setStreamConnected(true)}
                style={{
                  width: '100%', padding: '13px', borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: `linear-gradient(135deg,${C.accent},#5e35d4)`,
                  color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: C.serif,
                  boxShadow: `0 0 18px ${C.accent}44`,
                }}
              >
                Accept &amp; Connect Stream →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 + 4: Stream connected — show campaign details + verify + claim ── */}
        {connected && streamConnected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Campaign summary card ── */}
            <div style={{ padding: '20px 22px', borderRadius: 16, background: C.bg1, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, marginBottom: 14 }}>
                Your Campaign
              </div>
              <InfoRow label="Campaign"    value={campaign.name}                                    color="#e8e1f8" />
              <InfoRow label="Token"       value={campaign.token}                                    color={C.gold} />
              <InfoRow label="Your Share"  value={`${campaign.allocated.toLocaleString()} ${campaign.token}`} color={C.green} />
              <InfoRow label="Stream Type" value={campaign.streamType}                               color={C.accent} />
              <InfoRow label="Cliff"       value={`${campaign.cliffDays} days`} />
              <InfoRow label="Vesting"     value={`${campaign.vestDays} days`} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
                <span style={{ fontSize: 12, color: C.muted }}>Verification</span>
                <span style={{
                  fontFamily: C.mono, fontSize: 11, fontWeight: 700,
                  color: campaign.gameGate ? C.game : C.muted,
                }}>
                  {campaign.gameGate ? `◈ BlockBite Level ${campaign.gameLevel}` : campaign.gateType}
                </span>
              </div>
            </div>

            {/* ── Verification section ── */}
            {campaign.gameGate && !verified && (
              <div style={{
                padding: '24px 22px', borderRadius: 16,
                background: `${C.game}07`, border: `1.5px solid ${C.game}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 22 }}>◈</span>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.game }}>
                    Game Verification Required
                  </div>
                </div>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
                  The campaign builder requires you to complete <strong style={{ color: C.game }}>
                    Level {campaign.gameLevel}
                  </strong> in the BlockBite puzzle game. Play the game, complete the levels,
                  then click the Verify button to unlock your tokens.
                </p>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {/* Play game — links to /map with maxLevel and campaignId */}
                  <Link
                    href={`/map/1?maxLevel=${campaign.gameLevel}&campaignId=${campaign.id}`}
                    style={{
                      flex: 1, minWidth: 160,
                      padding: '12px 20px', borderRadius: 10, textAlign: 'center',
                      background: `linear-gradient(135deg, ${C.game}cc, #16a34acc)`,
                      color: '#0a0a14', fontWeight: 800, fontSize: 13,
                      textDecoration: 'none',
                      boxShadow: `0 0 18px ${C.game}33`,
                    }}
                  >
                    ▶ Play BlockBite
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
                      border: `1px solid ${C.game}44`,
                      background: `${C.game}12`,
                      color: C.game, fontWeight: 700, fontSize: 13,
                      cursor: 'pointer', fontFamily: C.serif,
                    }}
                  >
                    ✦ Submit Verification
                  </button>
                </div>

                <div style={{ marginTop: 14, fontSize: 11, color: C.muted }}>
                  Complete all {campaign.gameLevel} levels in BlockBite, then click Submit Verification above.
                </div>
              </div>
            )}

            {/* ── Verified badge ── */}
            {(verified || !campaign.gameGate) && (
              <div style={{
                padding: '14px 18px', borderRadius: 12,
                background: `${C.green}08`, border: `1px solid ${C.green}33`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 22, color: C.green }}>✦</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>Verification complete</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                    {campaign.gameGate
                      ? `BlockBite Level ${campaign.gameLevel} cleared — tokens are unlocked`
                      : 'No game verification required — tokens are ready'}
                  </div>
                </div>
              </div>
            )}

            {/* ── Claim / Withdraw button ── */}
            <div style={{
              padding: '24px 22px', borderRadius: 16,
              background: isVerifiedOrNoGate ? `${C.gold}07` : C.bg1,
              border: `1.5px solid ${isVerifiedOrNoGate ? C.gold + '44' : C.border}`,
              transition: 'all .3s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isVerifiedOrNoGate ? C.gold : C.muted, marginBottom: 4 }}>
                    {isVerifiedOrNoGate ? 'Ready to Claim' : 'Locked — Verification Required'}
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 800, color: isVerifiedOrNoGate ? C.green : C.muted }}>
                    {campaign.allocated.toLocaleString()} {campaign.token}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    vested amount available to withdraw
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
                      ? `linear-gradient(135deg,${C.gold}cc,#a36a17)`
                      : 'rgba(255,255,255,.05)',
                    color: isVerifiedOrNoGate ? '#0b0a14' : C.muted,
                    fontWeight: 900, fontSize: 15, cursor: isVerifiedOrNoGate ? 'pointer' : 'not-allowed',
                    fontFamily: C.serif, letterSpacing: '.02em',
                    boxShadow: isVerifiedOrNoGate ? `0 0 20px ${C.gold}44` : 'none',
                    transition: 'all .2s',
                  }}
                >
                  {claiming ? 'Withdrawing…' : isVerifiedOrNoGate ? '↓ Withdraw Tokens' : '🔒 Locked'}
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

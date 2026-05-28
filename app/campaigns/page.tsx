'use client';

/**
 * /campaigns — My Campaigns (Recipient view)
 *
 * Shows all campaigns the connected wallet has been added to as a recipient.
 * Builder / creator flow lives at /campaigns/create.
 */

import Link from 'next/link';
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

// ─── Mock recipient campaigns ──────────────────────────────────────────────────
// In production: fetched from the Anchor program by scanning for PDAs whose
// `recipient` field matches the connected wallet.
const MY_CAMPAIGNS = [
  {
    id: 'camp-001',
    name: 'Team Allocation — Core Dev',
    token: 'BBT', allocated: 62_500, total: 500_000,
    cliffDays: 90, vestDays: 365, streamType: 'Linear',
    gameGate: true, gameLevel: 10,
    status: 'active' as const,
    verificationStatus: 'pending' as const,
  },
  {
    id: 'camp-002',
    name: 'Advisor Round',
    token: 'BBT', allocated: 12_000, total: 120_000,
    cliffDays: 60, vestDays: 365, streamType: 'Milestone',
    gameGate: false, gameLevel: 0,
    status: 'active' as const,
    verificationStatus: 'verified' as const,
  },
];

const TYPE_COLOR: Record<string, string> = {
  Linear: C.accent, Milestone: C.blue, Cliff: C.gold, Hybrid: '#c084fc',
};

export default function CampaignsPage() {
  const { connected, publicKey } = useWallet();
  const { setVisible }           = useWalletModal();

  return (
    <div style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
      <Navbar />

      {/* ── Page header ── */}
      <div style={{
        padding: '80px 32px 28px',
        borderBottom: `1px solid ${C.border}`,
        background: 'linear-gradient(180deg, #0a0820 0%, #08081a 100%)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: C.accent, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>
              TDP · Recipient Dashboard
            </div>
            <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, margin: '0 0 6px' }}>My Campaigns</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              Campaigns you have been added to as a token recipient.
            </p>
          </div>
          <Link href="/campaigns/create" style={{
            padding: '10px 20px', borderRadius: 10,
            border: `1px solid ${C.border}`, background: C.card,
            color: C.muted, fontSize: 13, textDecoration: 'none', fontWeight: 600,
          }}>
            + Create Campaign
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 32px 100px' }}>

        {/* ── Wallet gate ── */}
        {!connected ? (
          <div style={{
            padding: '48px 32px', borderRadius: 18, textAlign: 'center',
            background: C.bg1, border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 36, marginBottom: 16, opacity: .3 }}>◈</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Connect Your Wallet</div>
            <p style={{ fontSize: 13, color: C.muted, maxWidth: 380, margin: '0 auto 28px', lineHeight: 1.7 }}>
              Connect your Solana wallet to see campaigns you have been invited to as a recipient.
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '13px 36px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg,${C.accent},#5e35d4)`,
                color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: C.serif,
                boxShadow: `0 0 20px ${C.accent}44`,
              }}
            >
              Connect Wallet →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Wallet pill */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 10, alignSelf: 'flex-start',
              background: `${C.green}08`, border: `1px solid ${C.green}33`,
              fontSize: 12, color: C.green, fontFamily: C.mono,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              {publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}
            </div>

            {/* Campaign cards */}
            {MY_CAMPAIGNS.length === 0 ? (
              <div style={{
                padding: '48px 32px', borderRadius: 16, textAlign: 'center',
                background: C.bg1, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
                  No campaigns found for this wallet. Ask your campaign creator to add your address.
                </div>
                <Link href="/streams" style={{ color: C.accent, fontSize: 13, textDecoration: 'none' }}>
                  View all streams →
                </Link>
              </div>
            ) : (
              MY_CAMPAIGNS.map(camp => {
                const isVerified     = camp.verificationStatus === 'verified' || !camp.gameGate;
                const typeColor      = TYPE_COLOR[camp.streamType] ?? C.accent;
                const progressPct    = Math.round((camp.allocated / camp.total) * 100);

                return (
                  <Link key={camp.id} href={`/campaigns/${camp.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      padding: '20px 22px', borderRadius: 16,
                      background: C.bg1, border: `1px solid ${C.border}`,
                      cursor: 'pointer', transition: 'border-color .15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = `${C.accent}55`)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700,
                              background: `${typeColor}18`, border: `1px solid ${typeColor}44`, color: typeColor,
                              fontFamily: C.mono,
                            }}>{camp.streamType.toUpperCase()}</span>
                            {camp.gameGate && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700,
                                background: `${C.game}12`, border: `1px solid ${C.game}33`, color: C.game,
                                fontFamily: C.mono,
                              }}>◈ GAME</span>
                            )}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#e8e1f8', marginBottom: 2 }}>
                            {camp.name}
                          </div>
                          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>
                            Cliff {camp.cliffDays}d · Vest {camp.vestDays}d
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 9.5, color: C.muted, letterSpacing: '.06em', marginBottom: 3, textTransform: 'uppercase' }}>
                            Your Allocation
                          </div>
                          <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 800, color: C.green }}>
                            {camp.allocated.toLocaleString()}
                          </div>
                          <div style={{ fontSize: 10, color: C.muted }}>{camp.token}</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.muted, marginBottom: 5 }}>
                          <span>Allocation progress</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progressPct}%`, borderRadius: 99, background: `linear-gradient(90deg,${C.accent},${C.green})` }} />
                        </div>
                      </div>

                      {/* Status row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: isVerified ? C.green : C.gold,
                            boxShadow: `0 0 5px ${isVerified ? C.green : C.gold}`,
                          }} />
                          <span style={{ fontSize: 12, color: isVerified ? C.green : C.gold, fontWeight: 600 }}>
                            {isVerified ? 'Verified — ready to claim' : 'Pending game verification'}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
                          View details →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

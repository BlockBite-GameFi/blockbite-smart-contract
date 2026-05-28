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
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

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
  Linear: T.accent, Milestone: T.blue, Cliff: T.gold, Hybrid: '#c084fc',
};

export default function CampaignsPage() {
  const { lang } = useApp();
  const tx = I18N.campaigns[lang];

  const { connected, publicKey } = useWallet();
  const { setVisible }           = useWalletModal();

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      <Navbar />

      {/* ── Page header ── */}
      <div style={{
        padding: '80px 32px 28px',
        borderBottom: `1px solid ${T.border}`,
        background: T.header,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>
              {tx.badge}
            </div>
            <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, margin: '0 0 6px' }}>{tx.title}</h1>
            <p style={{ fontSize: 13, color: T.textDim, margin: 0 }}>
              {tx.subtitle}
            </p>
          </div>
          <Link href="/campaigns/create" style={{
            padding: '10px 20px', borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.surface,
            color: T.textDim, fontSize: 13, textDecoration: 'none', fontWeight: 600,
          }}>
            {tx.createBtn}
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 32px 100px' }}>

        {/* ── Wallet gate ── */}
        {!connected ? (
          <div style={{
            padding: '48px 32px', borderRadius: 18, textAlign: 'center',
            background: T.bg1, border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 36, marginBottom: 16, opacity: .3 }}>◈</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{tx.walletTitle}</div>
            <p style={{ fontSize: 13, color: T.textDim, maxWidth: 380, margin: '0 auto 28px', lineHeight: 1.7 }}>
              {tx.walletSub}
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '13px 36px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: T.grad,
                color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: T.serif,
                boxShadow: `0 0 20px ${T.accent}44`,
              }}
            >
              {tx.connectBtn}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Wallet pill */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 10, alignSelf: 'flex-start',
              background: T.greenA1, border: `1px solid ${T.green}`,
              fontSize: 12, color: T.green, fontFamily: T.mono,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              {publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}
            </div>

            {/* Campaign cards */}
            {MY_CAMPAIGNS.length === 0 ? (
              <div style={{
                padding: '48px 32px', borderRadius: 16, textAlign: 'center',
                background: T.bg1, border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 13, color: T.textDim, marginBottom: 14 }}>
                  {tx.noCampaigns}
                </div>
                <Link href="/streams" style={{ color: T.accent, fontSize: 13, textDecoration: 'none' }}>
                  {tx.viewStreams}
                </Link>
              </div>
            ) : (
              MY_CAMPAIGNS.map(camp => {
                const isVerified     = camp.verificationStatus === 'verified' || !camp.gameGate;
                const typeColor      = TYPE_COLOR[camp.streamType] ?? T.accent;
                const progressPct    = Math.round((camp.allocated / camp.total) * 100);

                return (
                  <Link key={camp.id} href={`/campaigns/${camp.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      padding: '20px 22px', borderRadius: 16,
                      background: T.bg1, border: `1px solid ${T.border}`,
                      cursor: 'pointer', transition: 'border-color .15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = T.accent)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700,
                              background: T.accentA1, border: `1px solid ${typeColor}`, color: typeColor,
                              fontFamily: T.mono,
                            }}>{camp.streamType.toUpperCase()}</span>
                            {camp.gameGate && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700,
                                background: T.greenA1, border: `1px solid ${T.green}`, color: T.green,
                                fontFamily: T.mono,
                              }}>◈ GAME</span>
                            )}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 2 }}>
                            {camp.name}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim }}>
                            Cliff {camp.cliffDays}d · Vest {camp.vestDays}d
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 9.5, color: T.textDim, letterSpacing: '.06em', marginBottom: 3, textTransform: 'uppercase' }}>
                            {tx.yourAlloc}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 800, color: T.green }}>
                            {camp.allocated.toLocaleString()}
                          </div>
                          <div style={{ fontSize: 10, color: T.textDim }}>{camp.token}</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>
                          <span>{tx.allocProgress}</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: T.surface, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progressPct}%`, borderRadius: 99, background: T.grad }} />
                        </div>
                      </div>

                      {/* Status row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: isVerified ? T.green : T.gold,
                            boxShadow: `0 0 5px ${isVerified ? T.green : T.gold}`,
                          }} />
                          <span style={{ fontSize: 12, color: isVerified ? T.green : T.gold, fontWeight: 600 }}>
                            {isVerified ? tx.verified : tx.pendingVerif}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>
                          {tx.viewDetails}
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

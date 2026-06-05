'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_URL } from '@/lib/solana/config';
import {
  getAllCampaigns,
  getCampaignsByFounder,
  getMilestonesByCampaign,
  type CampaignInfo,
  type MilestoneInfo,
} from '@blockbite/clients';
import { T } from '@/lib/theme';

export default function CampaignsPage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [milestones, setMilestones] = useState<Record<string, MilestoneInfo[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true); setError(null);
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const all = await getAllCampaigns(connection);
      setCampaigns(all);

      const msMap: Record<string, MilestoneInfo[]> = {};
      for (const c of all) {
        msMap[c.pubkey.toBase58()] = await getMilestonesByCampaign(connection, c.pubkey);
      }
      setMilestones(msMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RPC error');
    } finally { setLoading(false); }
  }, [publicKey]);

  useEffect(() => { if (connected) load(); else { setCampaigns([]); setMilestones({}); } }, [connected, load]);

  function fmtBudget(n: CampaignInfo['totalBudget']): string {
    const raw = BigInt(n.toString());
    return (raw / 1_000_000n).toLocaleString();
  }

  function fmtMilestoneCount(c: CampaignInfo, ms: MilestoneInfo[]): string {
    return `${ms.length} milestone${ms.length !== 1 ? 's' : ''}`;
  }

  function getVerificationStatus(ms: MilestoneInfo[]): string {
    if (ms.length === 0) return 'No milestones';
    const verified = ms.filter(m => m.isVerified).length;
    if (verified === ms.length) return 'All verified';
    if (verified > 0) return `${verified}/${ms.length} verified`;
    return 'Pending verification';
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>

      {/* ── Page header ── */}
      <div style={{
        padding: '80px 32px 28px',
        borderBottom: `1px solid ${T.border}`,
        background: T.header,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>
              Campaigns
            </div>
            <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, margin: '0 0 6px' }}>All Campaigns</h1>
            <p style={{ fontSize: 13, color: T.textDim, margin: 0 }}>
              Browse and manage on-chain token distribution campaigns.
            </p>
          </div>
          <Link href="/campaigns/create" style={{
            padding: '10px 20px', borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.surface,
            color: T.textDim, fontSize: 13, textDecoration: 'none', fontWeight: 600,
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
            background: T.bg1, border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 36, marginBottom: 16, opacity: .3 }}>◈</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Connect Your Wallet</div>
            <p style={{ fontSize: 13, color: T.textDim, maxWidth: 380, margin: '0 auto 28px', lineHeight: 1.7 }}>
              Connect your Solana wallet to view and interact with campaigns.
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
              Connect Wallet
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

            {/* Loading */}
            {loading && (
              <div style={{ padding: '48px', textAlign: 'center', color: T.textDim, fontSize: 13 }}>
                Loading campaigns…
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding: '12px 16px', borderRadius: 10,
                background: T.redA1, border: `1px solid ${T.red}`,
                fontSize: 12, color: T.red, marginBottom: 16,
              }}>
                Error: {error} · <button onClick={load} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 12 }}>Retry</button>
              </div>
            )}

            {/* Campaign cards */}
            {!loading && campaigns.length === 0 && !error && (
              <div style={{
                padding: '48px 32px', borderRadius: 16, textAlign: 'center',
                background: T.bg1, border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 13, color: T.textDim, marginBottom: 14 }}>
                  No campaigns found on devnet.
                </div>
                <Link href="/campaigns/create" style={{ color: T.accent, fontSize: 13, textDecoration: 'none' }}>
                  Create your first campaign →
                </Link>
              </div>
            )}

            {!loading && campaigns.map(camp => {
              const ms = milestones[camp.pubkey.toBase58()] || [];
              const status = getVerificationStatus(ms);
              const progressPct = camp.totalBudget.gt(0)
                ? Math.round(Number(camp.allocatedAmount.muln(100).div(camp.totalBudget)))
                : 0;
              const isFounder = publicKey && camp.founder.equals(publicKey);

              return (
                <Link key={camp.pubkey.toBase58()} href={`/campaigns/${camp.pubkey.toBase58()}`} style={{ textDecoration: 'none' }}>
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
                            background: T.accentA1, border: `1px solid ${T.accent}`, color: T.accent,
                            fontFamily: T.mono,
                          }}>CAMPAIGN</span>
                          {isFounder && (
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700,
                              background: T.goldA1, border: `1px solid ${T.gold}`, color: T.gold,
                              fontFamily: T.mono,
                            }}>FOUNDER</span>
                          )}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.textDim, marginBottom: 2 }}>
                          {camp.pubkey.toBase58().slice(0, 12)}…
                        </div>
                        <div style={{ fontSize: 12, color: T.textDim }}>
                          {fmtMilestoneCount(camp, ms)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 9.5, color: T.textDim, letterSpacing: '.06em', marginBottom: 3, textTransform: 'uppercase' }}>
                          Total Budget
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 800, color: T.green }}>
                          {fmtBudget(camp.totalBudget)}
                        </div>
                        <div style={{ fontSize: 10, color: T.textDim }}>USDC</div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.textDim, marginBottom: 5 }}>
                        <span>Allocated</span>
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
                          background: status.includes('All verified') ? T.green : status.includes('Pending') ? T.gold : T.textDim,
                          boxShadow: `0 0 5px ${status.includes('All verified') ? T.green : status.includes('Pending') ? T.gold : T.textDim}`,
                        }} />
                        <span style={{ fontSize: 12, color: status.includes('All verified') ? T.green : status.includes('Pending') ? T.gold : T.textDim, fontWeight: 600 }}>
                          {status}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>
                        View Details →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

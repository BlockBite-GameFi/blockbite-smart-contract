'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import { RPC_URL } from '@/lib/solana/config';
import {
  fetchCampaign,
  getMilestonesByCampaign,
  deriveCampaignEscrowPDA,
  type CampaignInfo,
  type MilestoneInfo,
} from '@/lib/anchor/campaign-client';
import { useMilestoneAction } from '@/lib/hooks/useMilestoneAction';
import { KNOWN_DEVNET_TOKENS, KNOWN_MAINNET_TOKENS } from '@/lib/solana/token-registry';
import { IS_DEVNET } from '@/lib/solana/config';
import { T } from '@/lib/theme';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [milestones, setMilestones] = useState<MilestoneInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Token info fetched from escrow
  const [tokenMint, setTokenMint] = useState<PublicKey | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState(6);

  const { status, error: actionError, claimMilestoneAction } = useMilestoneAction();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      let campaignPda: PublicKey;
      try {
        campaignPda = new PublicKey(id);
      } catch {
        setError('Invalid campaign address');
        setLoading(false);
        return;
      }

      const camp = await fetchCampaign(connection, campaignPda);
      if (!camp) {
        setError('Campaign not found');
        setLoading(false);
        return;
      }
      setCampaign(camp);

      const ms = await getMilestonesByCampaign(connection, campaignPda);
      setMilestones(ms);

      // Fetch token mint from escrow account
      const [campaignEscrow] = deriveCampaignEscrowPDA(campaignPda);
      try {
        const escrowInfo = await getAccount(connection, campaignEscrow);
        setTokenMint(escrowInfo.mint);

        // Look up symbol from registry
        const mintStr = escrowInfo.mint.toBase58();
        const known = IS_DEVNET ? KNOWN_DEVNET_TOKENS[mintStr] : KNOWN_MAINNET_TOKENS[mintStr];
        if (known) {
          setTokenSymbol(known.symbol);
          setTokenDecimals(known.decimals);
        } else {
          setTokenSymbol(mintStr.slice(0, 6) + '…');
          // Fetch decimals from chain
          const mintInfo = await connection.getParsedAccountInfo(escrowInfo.mint);
          if (mintInfo.value) {
            const data = mintInfo.value.data as any;
            if (data.parsed?.info?.decimals != null) {
              setTokenDecimals(data.parsed.info.decimals);
            }
          }
        }
      } catch {
        // Escrow not created yet or not a token account
        setTokenSymbol('???');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RPC error');
    } finally { setLoading(false); }
  }, [id]);

  const refreshMilestones = useCallback(async () => {
    if (!id || !campaign) return;
    setRefreshing(true);
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const ms = await getMilestonesByCampaign(connection, campaign.pubkey);
      setMilestones(ms);
    } catch {
      // Silently fail on refresh
    } finally { setRefreshing(false); }
  }, [id, campaign]);

  useEffect(() => { load(); }, [load]);

  // Poll for milestone updates when game might be in progress
  useEffect(() => {
    const hasPending = milestones.some(ms => !ms.isVerified && ms.verificationType === 1);
    if (!hasPending) return;

    const interval = setInterval(refreshMilestones, 3000);
    return () => clearInterval(interval);
  }, [milestones, refreshMilestones]);

  function fmtBudget(n: CampaignInfo['totalBudget']): string {
    const raw = BigInt(n.toString());
    const divisor = BigInt(10 ** tokenDecimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').slice(0, 2);
    return `${whole.toLocaleString()}.${fracStr} ${tokenSymbol}`;
  }

  function fmtMilestoneAmount(n: MilestoneInfo['tokenAmount']): string {
    const raw = BigInt(n.toString());
    const divisor = BigInt(10 ** tokenDecimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').slice(0, 2);
    return `${whole.toLocaleString()}.${fracStr} ${tokenSymbol}`;
  }

  const handleClaim = async (ms: MilestoneInfo) => {
    if (!publicKey || !campaign || !tokenMint) return;
    const campaignSeed = BigInt(0);
    const milestoneSeed = BigInt(0);

    const [campaignEscrow] = deriveCampaignEscrowPDA(campaign.pubkey);

    await claimMilestoneAction(
      publicKey,
      ms.pubkey,
      campaign.pubkey,
      tokenMint,
      milestoneSeed,
      campaignSeed,
      sendTransaction,
    );
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div style={{ fontSize: 13, color: T.textDim }}>Loading campaign…</div>
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 32, opacity: .3 }}>◈</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.textDim }}>Campaign not found</div>
          <Link href="/campaigns" style={{ color: T.accent, fontSize: 13, textDecoration: 'none' }}>
            ← My Campaigns
          </Link>
        </div>
      </div>
    );
  }

  const isFounder = publicKey && campaign.founder.equals(publicKey);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>

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
            ← My Campaigns
          </Link>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>
            Campaign Detail
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px', fontFamily: T.mono }}>
            {campaign.pubkey.toBase58().slice(0, 16)}…
          </h1>
          <p style={{ fontSize: 13, color: T.textDim, margin: 0 }}>
            {campaign.milestoneCount} milestone{campaign.milestoneCount !== 1 ? 's' : ''} · {fmtBudget(campaign.totalBudget)} budget
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 32px 100px' }}>

        {!connected && (
          <div style={{
            padding: '32px', borderRadius: 18, textAlign: 'center',
            background: T.bg1, border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 16, opacity: .5 }}>◈</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Connect Your Wallet</div>
            <p style={{ fontSize: 13, color: T.textDim, maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.7 }}>
              Connect your Solana wallet to interact with this campaign.
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '13px 32px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: T.grad,
                color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: T.serif,
                boxShadow: `0 0 20px ${T.accent}44`,
              }}
            >
              Connect Wallet →
            </button>
          </div>
        )}

        {connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Campaign summary */}
            <div style={{ padding: '20px 22px', borderRadius: 16, background: T.bg1, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: T.textDim, marginBottom: 14 }}>
                Campaign Info
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { l: 'Founder', v: `${campaign.founder.toBase58().slice(0, 8)}…${campaign.founder.toBase58().slice(-6)}`, c: T.accent },
                  { l: 'Total Budget', v: `${fmtBudget(campaign.totalBudget)}`, c: T.green },
                  { l: 'Allocated', v: `${fmtBudget(campaign.allocatedAmount)}`, c: T.blue },
                  { l: 'Milestones', v: `${campaign.milestoneCount}`, c: T.text },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 12, color: T.textDim }}>{r.l}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 12, color: r.c, fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Milestones */}
            {milestones.length === 0 ? (
              <div style={{
                padding: '36px 24px', borderRadius: 14, textAlign: 'center',
                background: T.surface, border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 14, color: T.gold }}>◈</div>
                <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>No Milestones Yet</div>
                <p style={{ color: T.textDim, fontSize: 12.5, lineHeight: 1.7, maxWidth: 440, margin: '0 auto 22px' }}>
                  The founder has not added any milestones to this campaign yet.
                </p>
              </div>
            ) : (
              milestones.map((ms, idx) => {
                const isRecipient = publicKey && ms.recipient.equals(publicKey);
                const isGameVerified = ms.verificationType === 1 && ms.isVerified;
                const isGamePending = ms.verificationType === 1 && !ms.isVerified;

                return (
                  <div key={ms.pubkey.toBase58()} style={{
                    background: isGameVerified ? T.greenA1 : T.bg1,
                    border: `1px solid ${isGameVerified ? T.green : T.border}`,
                    borderRadius: 16, padding: '20px 22px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: T.mono, fontSize: 14, fontWeight: 700,
                        background: isGameVerified ? T.greenA1 : T.surface,
                        border: `2px solid ${isGameVerified ? T.green : T.border}`,
                        color: isGameVerified ? T.green : T.textDim,
                      }}>
                        {isGameVerified ? '✓' : idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                          Milestone {idx + 1}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 11.5, color: isGameVerified ? T.green : T.textDim }}>
                          {fmtMilestoneAmount(ms.tokenAmount)} · {isGameVerified ? 'Verified' : 'Pending'}
                        </div>
                      </div>
                      {isGameVerified && (
                        <span style={{
                          padding: '6px 14px', borderRadius: 9, fontSize: 11,
                          background: T.greenA1, border: `1px solid ${T.green}`,
                          color: T.green, fontWeight: 600,
                        }}>Verified</span>
                      )}
                      {refreshing && isGamePending && (
                        <span style={{
                          padding: '6px 14px', borderRadius: 9, fontSize: 11,
                          background: T.accentA1, border: `1px solid ${T.accent}`,
                          color: T.accent, fontWeight: 600,
                        }}>Checking…</span>
                      )}
                    </div>

                    {/* Actions for recipient - game pending */}
                    {isRecipient && isGamePending && (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <Link
                          href={`/game?milestone=${ms.pubkey.toBase58()}&gameProgram=${ms.gameProgramId.toBase58()}&campaign=${campaign.pubkey.toBase58()}&level=1`}
                          style={{
                            flex: 1, minWidth: 160,
                            padding: '12px 20px', borderRadius: 10, textAlign: 'center',
                            background: `linear-gradient(135deg, ${T.green}cc, #16a34acc)`,
                            color: '#0a0a14', fontWeight: 800, fontSize: 13,
                            textDecoration: 'none',
                            boxShadow: `0 0 18px ${T.greenA1}`,
                          }}
                        >
                          ▶ Play BlockBite to Verify
                        </Link>
                      </div>
                    )}

                    {/* Actions for recipient - verified, ready to claim */}
                    {isRecipient && ms.isVerified && (
                      <button
                        onClick={() => handleClaim(ms)}
                        disabled={status === 'claiming'}
                        style={{
                          width: '100%', padding: '14px 32px', borderRadius: 12, border: 'none',
                          background: `linear-gradient(135deg,${T.gold}cc,#a36a17)`,
                          color: '#0b0a14', fontWeight: 900, fontSize: 15,
                          cursor: status === 'claiming' ? 'not-allowed' : 'pointer',
                          fontFamily: T.serif, letterSpacing: '.02em',
                          boxShadow: `0 0 20px ${T.goldA1}`,
                        }}
                      >
                        {status === 'claiming' ? 'Claiming…' : '↓ Claim Tokens'}
                      </button>
                    )}
                  </div>
                );
              })
            )}

            {actionError && (
              <div style={{
                padding: '12px 16px', borderRadius: 10,
                background: T.redA1, border: `1px solid ${T.red}`,
                fontSize: 12, color: T.red,
              }}>
                Error: {actionError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

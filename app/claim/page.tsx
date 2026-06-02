'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { SystemProgram } from '@solana/web3.js';
import {
  getStreamsByBeneficiary,
  computeUnlocked,
  withdraw,
  deriveStreamPDA,
  deriveVaultPDA,
  deriveProofCachePDA,
  StreamInfo,
} from '@/lib/anchor/vesting-client';
import { withRpcFallback } from '@/lib/solana/rpc-manager';
import { BN } from '@coral-xyz/anchor';
import type { SendTx } from '@/lib/anchor/vesting-client';
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

function streamType(s: StreamInfo): string {
  const cliff  = Number(s.cliffTs.toString());
  const start  = Number(s.startTs.toString());
  const hasMilestone = (s.milestoneCount ?? 0) > 0;
  const hasCliff     = cliff > start;
  // Hybrid (milestone+cliff) reclassified as milestone — hybrid type removed
  if (hasMilestone) return 'milestone';
  if (hasCliff) return 'cliff';
  return 'linear';
}

function streamStatus(s: StreamInfo, nowSec: number): string {
  if (s.cancelled) return 'cancelled';
  if (nowSec < Number(s.cliffTs.toString())) return 'pending';
  if (nowSec >= Number(s.endTs.toString())) return 'completed';
  return 'active';
}

function fmtU(bn: BN): string {
  return (Number(bn.toString()) / 1e6).toFixed(2);
}

export default function ClaimPage() {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const { lang } = useApp();
  const tx = I18N.claim[lang];
  const txCommon = I18N.common[lang];

  const [streams,     setStreams]     = useState<StreamInfo[]>([]);
  const [selected,    setSelected]    = useState<number>(0);
  const [loading,     setLoading]     = useState(false);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [claimStage,  setClaimStage]  = useState<'idle' | 'approving' | 'confirming' | 'done'>('idle');
  const [txSig,       setTxSig]       = useState<string | null>(null);
  const [claimErr,    setClaimErr]    = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [nowSec,      setNowSec]      = useState(Math.floor(Date.now() / 1000));
  const claiming = claimStage === 'approving' || claimStage === 'confirming';

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const g = parseInt(localStorage.getItem('bb_games_played') ?? '0', 10);
    setGamesPlayed(isNaN(g) ? 0 : g);
  }, []);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const all = await withRpcFallback(conn => getStreamsByBeneficiary(conn, publicKey));
      // Only show non-cancelled streams that have something locked
      const relevant = all.filter(s => !s.cancelled || Number(s.amountWithdrawn.toString()) < Number(s.amountTotal.toString()));
      relevant.sort((a, b) => Number(computeUnlocked(b, now)) - Number(computeUnlocked(a, now)));
      setStreams(relevant);
      setSelected(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load streams');
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { load(); }, [load]);

  const stream   = streams[selected] ?? null;
  const claimable = stream ? Number(computeUnlocked(stream, nowSec)) : 0;
  const total     = stream ? Number(stream.amountTotal.toString()) : 0;
  const withdrawn = stream ? Number(stream.amountWithdrawn.toString()) : 0;
  const pctUnlocked = total > 0 ? Math.min(100, ((withdrawn + claimable) / total) * 100) : 0;
  const pctClaimed  = total > 0 ? Math.min(100, (withdrawn / total) * 100) : 0;
  const status = stream ? streamStatus(stream, nowSec) : null;
  const requiredTier = stream ? (stream.requiredTier ?? 0) : 0;
  const gameGateBlocked = requiredTier > 0 && gamesPlayed === 0;

  const handleClaim = useCallback(async () => {
    if (!stream || !publicKey || claimable === 0) return;
    setClaimStage('approving');
    setClaimErr(null);
    setTxSig(null);
    try {
      const streamIdBn = stream.streamId;
      const [streamPda] = deriveStreamPDA(stream.authority, streamIdBn);
      const [vaultPda]  = deriveVaultPDA(stream.authority, streamIdBn);
      const beneficiaryAta = await getAssociatedTokenAddress(stream.mint, publicKey);
      // If stream has a tier gate, pass the ProofCache PDA; otherwise pass SystemProgram
      const proofCache = (stream.requiredTier ?? 0) > 0
        ? deriveProofCachePDA(streamPda, publicKey)[0]
        : SystemProgram.programId;

      const sig = await withdraw({
        connection,
        beneficiary:    publicKey,
        stream:         streamPda,
        vault:          vaultPda,
        beneficiaryAta,
        mint:           stream.mint,
        proofCache,
        sendTransaction: async (tx, conn) => {
          const s = await (sendTransaction as unknown as SendTx)(tx, conn);
          setClaimStage('confirming'); // wallet approved, now waiting for chain
          return s;
        },
      });
      setTxSig(sig);
      setClaimStage('done');
      await load();
    } catch (e) {
      setClaimErr(e instanceof Error ? e.message : (lang === 'id' ? 'Transaksi gagal' : 'Transaction failed'));
      setClaimStage('idle');
    }
  }, [stream, publicKey, claimable, connection, sendTransaction, load]);

  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      <Navbar />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '100px 24px 80px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>
            {tx.badge}
          </div>
          <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(28px,5vw,40px)', fontWeight: 800, letterSpacing: '0.03em', marginBottom: 10, color: T.text }}>
            {tx.title}
          </h1>
          <p style={{ fontSize: 13, color: T.textDim, maxWidth: 500 }}>
            {tx.subtitle}
          </p>
          <div style={{ marginTop: 10 }}>
            <Link href="/demo#claim" style={{ fontSize: 12, color: T.accent, textDecoration: 'none' }}>
              {tx.demoLink}
            </Link>
          </div>
        </div>

        {/* ── Wallet gate ── */}
        {!connected && (
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 20, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>◎</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 10 }}>{tx.walletTitle}</div>
            <div style={{ fontSize: 13, color: T.textDim, marginBottom: 24 }}>
              {tx.walletSub}
            </div>
            <button onClick={() => setVisible(true)} style={{
              padding: '12px 32px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: T.grad, color: T.text,
              fontWeight: 700, fontSize: 14,
            }}>
              {tx.connectBtn}
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{ background: T.redA1, border: `1px solid ${T.red}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: T.red }}>
            ✗ {error}
          </div>
        )}

        {/* ── Loading ── */}
        {connected && loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim, fontSize: 13 }}>
            {tx.loadingMsg}
          </div>
        )}

        {/* ── No streams ── */}
        {connected && !loading && streams.length === 0 && (
          <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 20, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>{tx.noStreamsTitle}</div>
            <div style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
              {tx.noStreamsSub}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/streams/new" style={{ padding: '10px 22px', borderRadius: 10, background: T.grad, color: T.text, fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
                {tx.createStream}
              </Link>
              <Link href="/demo#claim" style={{ padding: '10px 22px', borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, color: T.textDim, fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>
                {tx.viewDemo}
              </Link>
            </div>
          </div>
        )}

        {/* ── Stream selector + claim panel ── */}
        {connected && !loading && streams.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 20, alignItems: 'start' }}>

            {/* Stream list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {streams.map((s, i) => {
                const c = Number(computeUnlocked(s, nowSec));
                const type = streamType(s);
                const typeCol = ({ linear: T.accent, milestone: T.blue, cliff: T.gold } as Record<string, string>)[type] ?? T.accent;
                return (
                  <button
                    key={s.pubkey.toBase58()}
                    onClick={() => { setSelected(i); setTxSig(null); setClaimErr(null); }}
                    style={{
                      background: selected === i ? T.accentA2 : T.surface,
                      border: `1px solid ${selected === i ? T.accentA4 : T.border}`,
                      borderRadius: 14, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: typeCol, marginBottom: 4 }}>
                      {type.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 11, color: T.text, marginBottom: 2 }}>
                      {s.pubkey.toBase58().slice(0, 8)}…
                    </div>
                    <div style={{ fontSize: 11, color: c > 0 ? T.green : T.textDim, fontWeight: 700 }}>
                      {(c / 1e6).toFixed(4)} {lang === 'id' ? 'tersedia' : 'claimable'}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Claim detail */}
            {stream && (
              <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 20, padding: '28px' }}>

                {/* Stream header */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.mono, marginBottom: 6 }}>
                    {stream.pubkey.toBase58()}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: T.accentA2, color: T.accent, border: `1px solid ${T.accentA4}` }}>
                      {streamType(stream).toUpperCase()}
                    </span>
                    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 10.5, fontWeight: 700,
                      background: status === 'active' ? T.greenA1 : T.goldA1,
                      color: status === 'active' ? T.green : T.gold,
                      border: `1px solid ${status === 'active' ? T.green : T.gold}` }}>
                      {status?.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Amount bars */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: T.textDim }}>{tx.progressLabel}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>{tx.unlockedPct(pctUnlocked)}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ height: '100%', width: `${pctUnlocked}%`, background: T.grad, borderRadius: 99 }} />
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pctClaimed}%`, background: T.green, borderRadius: 99 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 3, borderRadius: 99, background: T.accent }} />
                      <span style={{ fontSize: 10, color: T.textDim }}>{tx.unlocked}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 3, borderRadius: 99, background: T.green }} />
                      <span style={{ fontSize: 10, color: T.textDim }}>{tx.claimed}</span>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: tx.statsLabels.total,     val: fmtU(stream.amountTotal), col: T.accent },
                    { label: tx.statsLabels.withdrawn,  val: fmtU(stream.amountWithdrawn), col: T.textDim },
                    { label: tx.statsLabels.claimable,  val: (claimable / 1e6).toFixed(4), col: claimable > 0 ? T.green : T.textDim },
                  ].map(s => (
                    <div key={s.label} style={{ background: T.surface, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ fontSize: 9.5, color: T.textDim, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: s.col }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Timestamps */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                  {[
                    { label: tx.cliffLabel, val: new Date(Number(stream.cliffTs.toString()) * 1000).toLocaleDateString() },
                    { label: tx.endLabel,   val: new Date(Number(stream.endTs.toString()) * 1000).toLocaleDateString() },
                  ].map(s => (
                    <div key={s.label} style={{ background: T.surface, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 9.5, color: T.textDim, marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 12, color: T.text }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Pending cliff warning */}
                {status === 'pending' && (
                  <div style={{ background: T.goldA1, border: `1px solid ${T.gold}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: T.gold }}>
                    {tx.pendingWarning(new Date(Number(stream.cliffTs.toString()) * 1000).toLocaleDateString())}
                  </div>
                )}

                {/* Success */}
                {txSig && (
                  <div style={{ background: T.greenA1, border: `1px solid ${T.green}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: T.green }}>
                    {tx.claimedSuccess}{' '}
                    <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>
                      {txCommon.viewExplorer}
                    </a>
                  </div>
                )}

                {/* Error */}
                {claimErr && (
                  <div style={{ background: T.redA1, border: `1px solid ${T.red}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: T.red }}>
                    ✗ {claimErr}
                  </div>
                )}

                {/* Game gate warning */}
                {gameGateBlocked && claimable > 0 && status !== 'pending' && status !== 'cancelled' && (
                  <div style={{ background: T.goldA1, border: `1px solid ${T.gold}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: T.gold, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span>{tx.gameGateWarning}</span>
                    <a href="/map/1" style={{ padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg,#00F5FF,#7c3aed)', color: '#000', fontWeight: 800, fontSize: 11, textDecoration: 'none', whiteSpace: 'nowrap' }}>{txCommon.playGame}</a>
                  </div>
                )}

                {/* Claim button */}
                <button
                  onClick={handleClaim}
                  disabled={claimable === 0 || claiming || status === 'pending' || status === 'cancelled' || gameGateBlocked}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                    cursor: claimable > 0 && !claiming && !gameGateBlocked && status !== 'pending' ? 'pointer' : 'default',
                    background: claimable > 0 && !claiming && !gameGateBlocked && status !== 'pending'
                      ? `linear-gradient(135deg,${T.green},#2d8f4e)`
                      : 'rgba(255,255,255,.06)',
                    color: claimable > 0 && !claiming && !gameGateBlocked && status !== 'pending' ? T.text : T.textDim,
                    fontWeight: 700, fontSize: 14, fontFamily: T.serif,
                    opacity: claiming ? 0.7 : 1,
                  }}
                >
                  {claimStage === 'approving'
                    ? tx.btnApproving
                    : claimStage === 'confirming'
                      ? tx.btnConfirming
                      : gameGateBlocked
                        ? tx.btnGameGate
                        : claimable === 0
                          ? status === 'pending' ? tx.btnCliffNotMet : tx.btnNoClaim
                          : tx.btnClaim((claimable / 1e6).toFixed(4))}
                </button>

                <div style={{ fontSize: 10.5, color: T.textDim, textAlign: 'center', marginTop: 10 }}>
                  {tx.footerNote}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

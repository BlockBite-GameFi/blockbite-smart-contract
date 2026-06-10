'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/useApp';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { withRpcFallback } from '@/lib/solana/rpc-manager';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  fetchStream,
  fetchVaultBalance,
  computeUnlocked,
  withdraw as doWithdraw,
  cancelStream,
  closeStream,
  deriveVaultPDA,
  deriveProofCachePDA,
  StreamInfo,
} from '@/lib/anchor/vesting-client';
import { useGameVerification } from '@/lib/hooks/useGameVerification';
import { useRouter } from 'next/navigation';

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  accent: 'var(--p-accent)',
  gold:   'var(--p-gold)',
  green:  'var(--p-green)',
  blue:   'var(--p-blue)',
  ember:  'var(--p-ember)',
  red:    'var(--p-red)',
  muted:  'var(--p-muted)',
  border: 'var(--p-border)',
  bg0:    'var(--p-bg0)',
  bg1:    'var(--p-bg1)',
  bg2:    'var(--p-bg2)',
  mono:   '"JetBrains Mono",monospace',
  serif:  '"Space Grotesk",system-ui,sans-serif',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', ...style }}>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em',
      background: `color-mix(in srgb, ${color} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`, color,
      fontFamily: C.mono,
    }}>
      {label}
    </span>
  );
}

function truncatePk(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function fmtDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Format raw token units to a human-readable string (no decimals assumed) */
function fmtTokens(raw: bigint): string {
  if (raw >= 1_000_000n) return `${(Number(raw) / 1_000_000).toFixed(2)}M`;
  if (raw >= 1_000n)     return `${(Number(raw) / 1_000).toFixed(1)}K`;
  return raw.toLocaleString();
}

/** Infer a vesting schedule label from on-chain timestamps */
type VestType = 'linear' | 'cliff' | 'milestone' | 'hybrid';
function inferType(
  startTs: number,
  cliffTs: number,
  endTs: number,
  milestoneCount: number,
  requiredTier: number,
): VestType {
  if (milestoneCount > 0 || requiredTier > 0) return 'milestone';
  const hasCliff = cliffTs > startTs;
  if (!hasCliff) return 'linear';
  // Pure cliff: cliff == end (all-or-nothing release)
  if (cliffTs >= endTs - 60) return 'cliff';
  // Has both cliff gate + linear decay after
  return 'hybrid';
}

// ─── Error humanizer (mirrors _shared.tsx version, no cross-import needed) ───
function humanizeRpcError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes('user rejected') || msg.includes('user cancelled') || msg.includes('user denied'))
    return 'Transaction cancelled — you rejected the wallet prompt.';
  if (msg.includes('insufficient funds') || msg.includes('insufficient balance'))
    return 'Insufficient balance — not enough tokens or SOL for fees.';
  if (msg.includes('blockhash') || msg.includes('expired'))
    return 'Transaction expired — please try again.';
  if (msg.includes('wallet not connected') || msg.includes('not connected'))
    return 'Wallet disconnected — reconnect and try again.';
  if (msg.includes('timeout') || msg.includes('timed out'))
    return 'Network timeout — Solana devnet may be slow. Retry in a moment.';
  const raw = (e instanceof Error ? e.message : String(e));
  return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
}

// ─── Main page ────────────────────────────────────────────────────────────────
type RawStream = NonNullable<Awaited<ReturnType<typeof fetchStream>>>;

export default function StreamDetailPage() {
  const { lang } = useApp();
  const params      = useParams();
  const searchParams = useSearchParams();
  const idParam     = params?.id as string | undefined;

  const { connection }                 = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible }                 = useWalletModal();

  const [stream,   setStream]   = useState<RawStream | null>(null);
  const [vault,    setVault]    = useState<bigint>(0n);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  type TxStage = 'idle' | 'approving' | 'confirming' | 'done' | 'error';
  const [claimStage,     setClaimStage]     = useState<TxStage>('idle');
  const [claimSig,       setClaimSig]       = useState<string | null>(null);
  const [claimErr,       setClaimErr]       = useState<string | null>(null);
  const [confirmCancel,  setConfirmCancel]  = useState(false);
  const [cancelStage,    setCancelStage]    = useState<TxStage>('idle');
  const [cancelSig,      setCancelSig]      = useState<string | null>(null);
  const [cancelErr,      setCancelErr]      = useState<string | null>(null);
  const [confirmClose,   setConfirmClose]   = useState(false);
  const [closeStage,     setCloseStage]     = useState<TxStage>('idle');
  const [closeSig,       setCloseSig]       = useState<string | null>(null);
  const [closeErr,       setCloseErr]       = useState<string | null>(null);
  const claiming  = claimStage  === 'approving' || claimStage  === 'confirming';
  const cancelling = cancelStage === 'approving' || cancelStage === 'confirming';
  const closing   = closeStage  === 'approving' || closeStage  === 'confirming';
  const [nowSec,         setNowSec]         = useState(Math.floor(Date.now() / 1000));
  const [copiedLink,     setCopiedLink]     = useState(false);
  const [copiedMint,     setCopiedMint]     = useState(false);
  const router = useRouter();
  const { status: gameStatus, submitScore, submitMilestoneOnChain } = useGameVerification();

  // Auto-open cancel modal when navigated from list with ?cancel=1
  useEffect(() => {
    if (searchParams?.get('cancel') === '1') {
      setConfirmCancel(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(t);
  }, []);

  // Read game history from localStorage — gate for claim
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const g = parseInt(localStorage.getItem('bb_games_played') ?? '0', 10);
    setGamesPlayed(isNaN(g) ? 0 : g);
  }, []);

  // Parse PDA from URL — must be a valid base58 Solana pubkey
  const streamPda = (() => {
    if (!idParam) return null;
    try { return new PublicKey(idParam); } catch { return null; }
  })();

  const load = useCallback(async () => {
    if (!streamPda) {
      setFetchErr('Invalid stream address in URL');
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchErr(null);
    try {
      // withRpcFallback: 403/429/timeout → auto-switch endpoint, zero human touch.
      const s = await withRpcFallback(conn => fetchStream(conn, streamPda!));
      setStream(s);
      if (s) {
        const [vaultPda] = deriveVaultPDA(s.authority, s.beneficiary, s.streamId);
        const bal = await withRpcFallback(conn => fetchVaultBalance(conn, vaultPda))
          .catch(() => 0n); // vault may not exist yet — non-fatal
        setVault(bal);
      }
    } catch (e) {
      setFetchErr((e as Error)?.message ?? 'RPC error');
    } finally {
      setLoading(false);
    }
  }, [idParam]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Withdraw / Claim handler — 3-stage (approving → confirming → done) ──────
  const handleClaim = async () => {
    if (!stream || !publicKey || !streamPda) return;
    setClaimStage('approving');
    setClaimErr(null);
    setClaimSig(null);
    try {
      const [vaultPda] = deriveVaultPDA(stream.authority, stream.beneficiary, stream.streamId);
      const beneficiaryAta = await getAssociatedTokenAddress(stream.mint, publicKey);
      // Tier gate: pass ProofCache PDA if required_tier > 0; SystemProgram otherwise
      const proofCache = (stream.requiredTier ?? 0) > 0
        ? deriveProofCachePDA(streamPda, publicKey)[0]
        : SystemProgram.programId;
      const sig = await doWithdraw({
        connection,
        beneficiary:    publicKey,
        stream:         streamPda,
        vault:          vaultPda,
        beneficiaryAta,
        mint:           stream.mint,
        proofCache,
        sendTransaction: async (tx, conn) => {
          const s = await sendTransaction(tx, conn); // user approves here
          setClaimStage('confirming');                // move to stage 2
          return s;
        },
      });
      setClaimSig(sig);
      setClaimStage('done');
      load();
    } catch (e: unknown) {
      const msg = humanizeRpcError(e);
      setClaimErr(msg);
      setClaimStage('error');
    }
  };

  // ── Cancel handler — 3-stage ─────────────────────────────────────────────
  const handleCancel = async () => {
    if (!stream || !publicKey || !streamPda) return;
    setCancelStage('approving');
    setCancelErr(null);
    setCancelSig(null);
    setConfirmCancel(false);
    try {
      const [vaultPda]     = deriveVaultPDA(stream.authority, stream.beneficiary, stream.streamId);
      const authorityAta   = await getAssociatedTokenAddress(stream.mint, stream.authority);
      const beneficiaryAta = await getAssociatedTokenAddress(stream.mint, stream.beneficiary);
      const sig = await cancelStream({
        connection,
        authority:      publicKey,
        beneficiary:    stream.beneficiary,
        stream:         streamPda,
        vault:          vaultPda,
        authorityAta,
        beneficiaryAta,
        sendTransaction: async (tx, conn) => {
          const s = await sendTransaction(tx, conn);
          setCancelStage('confirming');
          return s;
        },
      });
      setCancelSig(sig);
      setCancelStage('done');
      load();
    } catch (e: unknown) {
      const msg = humanizeRpcError(e);
      setCancelErr(msg);
      setCancelStage('error');
    }
  };

  // ── Close handler — reclaim SOL rent from settled stream ─────────────────
  const handleClose = async () => {
    if (!stream || !publicKey || !streamPda) return;
    setCloseStage('approving');
    setCloseErr(null);
    setCloseSig(null);
    setConfirmClose(false);
    try {
      const [vaultPda]     = deriveVaultPDA(stream.authority, stream.beneficiary, stream.streamId);
      const creatorAta     = await getAssociatedTokenAddress(stream.mint, stream.authority);
      const sig = await closeStream({
        connection,
        creator:       publicKey,
        recipient:     stream.beneficiary,
        stream:        streamPda,
        vault:         vaultPda,
        creatorAta,
        mint:          stream.mint,
        sendTransaction: async (tx, conn) => {
          const s = await sendTransaction(tx, conn);
          setCloseStage('confirming');
          return s;
        },
      });
      setCloseSig(sig);
      setCloseStage('done');
      load();
    } catch (e: unknown) {
      const msg = humanizeRpcError(e);
      setCloseErr(msg);
      setCloseStage('error');
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 'calc(100vh - 64px)',
        }}>
          <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 14 }}>
            Fetching stream from chain…
          </div>
        </div>
      </div>
    );
  }

  // ── Game verification handler ────────────────────────────────────────────
  const handleGameVerified = useCallback(async (level: number, score: number) => {
    if (!publicKey || !streamPda || !stream) return;
    const result = await submitScore(level, score, publicKey.toBase58(), streamPda.toBase58());
    if (result.verified && sendTransaction) {
      try {
        await submitMilestoneOnChain(stream.authority, streamPda, sendTransaction);
        setStream({ ...stream, milestoneReached: true });
      } catch (e) {
        console.error('Failed to submit milestone on-chain:', e);
      }
    }
  }, [publicKey, streamPda, stream, submitScore, submitMilestoneOnChain]);

  // ── Not found / error state ──────────────────────────────────────────────
  if (fetchErr || !stream || !streamPda) {
    return (
      <div style={{
        minHeight: '100vh', background: C.bg0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <div style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 800, color: 'var(--p-text)' }}>
          Stream not found
        </div>
        <div style={{ color: C.muted, fontSize: 13, maxWidth: 360, textAlign: 'center' }}>
          {fetchErr ?? 'No stream account exists at this address on devnet.'}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/streams" style={{ color: C.accent, textDecoration: 'none', fontSize: 13 }}>
            {lang === 'id' ? '← Semua Stream' : '← All Streams'}
          </Link>
          <Link href="/demo#streams" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>
            {lang === 'id' ? 'Lihat data demo' : 'View demo data'}
          </Link>
        </div>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const startTs   = Number(stream.startTs.toString());
  const cliffTs   = Number(stream.cliffTs.toString());
  const endTs     = Number(stream.endTs.toString());
  const total     = BigInt(stream.amountTotal.toString());
  const withdrawn = BigInt(stream.amountWithdrawn.toString());

  // Extra fields decoded by Anchor (present at runtime, not typed by fetchStream)
  const milestoneCount     = (stream as unknown as StreamInfo).milestoneCount    ?? 0;
  const requiredTier       = (stream as unknown as StreamInfo).requiredTier       ?? 0;
  const milestonesVerified = (stream as unknown as StreamInfo).milestonesVerified ?? [];
  const milestonePct       = (stream as unknown as StreamInfo).milestonePct       ?? [];

  const claimable  = computeUnlocked(stream as unknown as StreamInfo, nowSec);
  const type       = inferType(startTs, cliffTs, endTs, milestoneCount, requiredTier);
  const typeCol    = ({ linear: C.accent, milestone: C.blue, cliff: C.gold, hybrid: '#c084fc' } as Record<string, string>)[type] ?? C.accent;

  const statusLabel = stream.cancelled ? 'CANCELLED'
    : nowSec < cliffTs ? 'PENDING'
    : nowSec >= endTs  ? 'COMPLETED'
    : 'ACTIVE';
  const statusColor = stream.cancelled ? C.red
    : statusLabel === 'PENDING'    ? C.gold
    : statusLabel === 'COMPLETED'  ? C.muted
    : C.green;

  /**
   * Clawback-Multisig protection heuristic.
   *
   * The on-chain Stream struct stores a single `authority` pubkey — the Anchor
   * program validates only that signer against cancelStream().  There is no
   * embedded multisig threshold in the account data, so we cannot tell from
   * chain data alone whether that key is a personal wallet or a Squads vault.
   *
   * Architectural implication (see memory: arch-clawback-multisig):
   *   • If authority === connected wallet  → solo key, unilateral cancel possible.
   *   • If authority !== connected wallet  → could be multisig vault OR just a
   *     different personal key; either way THIS client can't fire cancel.
   *
   * We conservatively surface the risk to recipients any time the stream is
   * not yet cancelled, so they understand their exposure.
   */
  const authorityIsSolo = !!(
    publicKey && stream && publicKey.equals(stream.authority)
  );
  // True when the connected wallet IS the creator (most dangerous case for recipient)
  const clawbackRisk = !stream.cancelled && authorityIsSolo;

  const unlockedTotal = withdrawn + claimable;
  const nowPct = total > 0n ? Math.min(1, Number(unlockedTotal) / Number(total)) : 0;

  // ── Vesting curve SVG (built from real timestamps) ───────────────────────
  const W = 560, H = 160, PX = 36, PY = 14;
  const iw = W - PX * 2;
  const ih = H - PY * 2;

  const cliffFrac = endTs > startTs ? Math.min(1, (cliffTs - startTs) / (endTs - startTs)) : 0;

  const curvePts = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    let y: number;
    const postCliff = cliffFrac >= 1 ? 0 : (t - cliffFrac) / (1 - cliffFrac);
    if      (type === 'linear')    y = t;
    else if (type === 'cliff')     y = t < cliffFrac ? 0 : 1;
    else if (type === 'milestone') y = t < cliffFrac ? 0 : postCliff < 0.33 ? 0.3 : postCliff < 0.67 ? 0.6 : 1;
    else                           y = t < cliffFrac ? 0 : Math.pow(Math.max(0, postCliff), 0.65);
    return { x: PX + t * iw, y: H - PY - y * ih };
  });

  const pathD = curvePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${PX + iw},${H - PY} L${PX},${H - PY} Z`;
  const nowX  = PX + nowPct * iw;
  const nowY  = curvePts[Math.round(nowPct * 59)]?.y ?? (H - PY);

  const vestDays  = Math.max(1, Math.round((endTs - startTs) / 86400));
  const cliffDays = Math.max(0, Math.round((cliffTs - startTs) / 86400));
  const activeDays = Math.max(1, Math.round((endTs - cliffTs) / 86400));

  const timeRemaining = (() => {
    if (stream.cancelled) return 'Cancelled';
    if (nowSec >= endTs) return 'Ended';
    if (nowSec < cliffTs) {
      const d = Math.ceil((cliffTs - nowSec) / 86400);
      return `${d}d to cliff`;
    }
    const secs = endTs - nowSec;
    if (secs < 3600)      return `${Math.ceil(secs / 60)}min left`;
    if (secs < 86400)     return `${Math.ceil(secs / 3600)}h left`;
    if (secs < 86400 * 7) return `${Math.ceil(secs / 86400)}d left`;
    return `${Math.ceil(secs / (86400 * 30))}mo left`;
  })();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg0, padding: '0 0 60px' }}>

      {/* Header */}
      <div style={{
        padding: 'clamp(80px,10vw,100px) clamp(16px,5vw,40px) 20px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ marginBottom: 4 }}>
            <Link href="/streams" style={{ color: C.muted, fontSize: 12, textDecoration: 'none' }}>{lang === 'id' ? '← Semua Stream' : '← All Streams'}</Link>
          </div>
          <h1 style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 800, color: 'var(--p-text)', margin: 0 }}>
            Stream Detail
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <p style={{ fontSize: 11, color: C.muted, margin: 0, fontFamily: C.mono, wordBreak: 'break-all' }}>
              {streamPda.toBase58()}
            </p>
            {/* Copy stream link */}
            <button
              onClick={() => {
                const url = typeof window !== 'undefined'
                  ? `${window.location.origin}/streams/${streamPda.toBase58()}`
                  : '';
                navigator.clipboard.writeText(url).then(() => {
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 1800);
                });
              }}
              title={lang === 'id' ? 'Salin link stream ini' : 'Copy stream link'}
              style={{
                padding: '3px 10px', borderRadius: 7, border: `1px solid color-mix(in srgb, ${C.accent} 25%, transparent)`,
                background: copiedLink ? `color-mix(in srgb, ${C.accent} 10%, transparent)` : 'rgba(255,255,255,.03)',
                color: copiedLink ? C.accent : C.muted, fontSize: 10.5, fontWeight: 600,
                cursor: 'pointer', flexShrink: 0, transition: 'all .15s',
              }}
            >
              {copiedLink
                ? (lang === 'id' ? '✓ Link Disalin!' : '✓ Link Copied!')
                : (lang === 'id' ? '⎘ Salin Link' : '⎘ Copy Link')}
            </button>
            {/* Copy contract address (mint) */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(streamPda.toBase58()).then(() => {
                  // use copiedLink slot for stream PDA copy feedback
                });
                // copy mint address
                navigator.clipboard.writeText(stream?.mint.toBase58() ?? '').then(() => {
                  setCopiedMint(true);
                  setTimeout(() => setCopiedMint(false), 1800);
                });
              }}
              title={lang === 'id' ? 'Salin alamat kontrak (mint)' : 'Copy contract address (mint)'}
              style={{
                padding: '3px 10px', borderRadius: 7, border: `1px solid color-mix(in srgb, ${C.gold} 25%, transparent)`,
                background: copiedMint ? `color-mix(in srgb, ${C.gold} 10%, transparent)` : 'rgba(255,255,255,.03)',
                color: copiedMint ? C.gold : C.muted, fontSize: 10.5, fontWeight: 600,
                cursor: 'pointer', flexShrink: 0, transition: 'all .15s',
              }}
            >
              {copiedMint
                ? (lang === 'id' ? '✓ CA Disalin!' : '✓ CA Copied!')
                : (lang === 'id' ? '◈ Salin CA' : '◈ Copy CA')}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Game gate — shown when stream requires game play AND user hasn't played yet */}
          {publicKey && claimable > 0n && !stream.cancelled && requiredTier > 0 && gamesPlayed === 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 10,
              background: '#f5c66a1a', border: '1px solid #f5c66a44',
              fontSize: 12, color: '#f5c66a',
            }}>
              <span>⚠ Play the game first to claim</span>
              <a href="/map/1" style={{
                padding: '5px 12px', borderRadius: 8,
                background: 'linear-gradient(135deg,#00F5FF,#7c3aed)',
                color: '#000', fontWeight: 800, fontSize: 11,
                textDecoration: 'none',
              }}>▶ Play Game</a>
            </div>
          )}
          {publicKey && claimable > 0n && !stream.cancelled && (requiredTier === 0 || gamesPlayed > 0) && (
            <button
              onClick={handleClaim}
              disabled={claiming}
              style={{
                padding: '9px 20px', borderRadius: 10, border: 'none',
                cursor: claiming ? 'default' : 'pointer',
                background: `linear-gradient(135deg, color-mix(in srgb, var(--p-gold) 80%, transparent), var(--p-gold))`,
                color: '#0b0918', fontSize: 13, fontWeight: 700, fontFamily: C.serif,
                opacity: claiming ? 0.6 : 1,
              }}
            >
              {claimStage === 'approving'  ? (lang === 'id' ? '◈ Setujui di wallet…' : '◈ Approve in wallet…')
               : claimStage === 'confirming' ? (lang === 'id' ? '▶ Mengonfirmasi di Solana…' : '▶ Confirming on Solana…')
               : lang === 'id' ? `Klaim ${fmtTokens(claimable)} token` : `Claim ${fmtTokens(claimable)} tokens`}
            </button>
          )}
          {!publicKey && claimable > 0n && (
            <button onClick={() => setVisible(true)} style={{
              padding: '9px 20px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--p-accent) 33%, transparent)',
              background: 'color-mix(in srgb, var(--p-accent) 6%, transparent)', color: C.accent,
              fontSize: 13, fontWeight: 700, fontFamily: C.serif, cursor: 'pointer',
            }}>
              Connect Wallet to Claim
            </button>
          )}
          {/* Cancel button — only visible to creator, only on active/pending streams */}
          {publicKey && stream && !stream.cancelled && publicKey.equals(stream.authority) && (
            <button
              onClick={() => setConfirmCancel(true)}
              disabled={cancelling}
              style={{
                padding: '9px 20px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--p-red) 33%, transparent)',
                cursor: cancelling ? 'default' : 'pointer',
                background: 'color-mix(in srgb, var(--p-red) 6%, transparent)',
                color: C.red, fontSize: 13, fontWeight: 700, fontFamily: C.serif,
                opacity: cancelling ? 0.6 : 1,
              }}
            >
              {cancelStage === 'approving'  ? '◈ Approve in wallet…'
               : cancelStage === 'confirming' ? '▶ Confirming on Solana…'
               : lang === 'id' ? 'Batalkan Stream' : 'Cancel Stream'}
            </button>
          )}
          {/* Close button — only visible to creator, only on cancelled or fully settled streams */}
          {publicKey && stream && (stream.cancelled || (nowSec >= Number(stream.endTs.toString()))) && publicKey.equals(stream.authority) && (
            <button
              onClick={() => setConfirmClose(true)}
              disabled={closing}
              style={{
                padding: '9px 20px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--p-blue) 33%, transparent)',
                cursor: closing ? 'default' : 'pointer',
                background: 'color-mix(in srgb, var(--p-blue) 6%, transparent)',
                color: C.blue, fontSize: 13, fontWeight: 700, fontFamily: C.serif,
                opacity: closing ? 0.6 : 1,
              }}
            >
              {closeStage === 'approving'  ? '◈ Approve in wallet…'
               : closeStage === 'confirming' ? '▶ Confirming on Solana…'
               : lang === 'id' ? 'Tutup Stream' : 'Close Stream'}
            </button>
          )}
        </div>
      </div>

      {/* ── Game Verification Card ─────────────────────────────────────────── */}
      {!stream.cancelled && cliffTs > startTs && !stream.milestoneReached && publicKey && (
        <div style={{
          margin: '20px clamp(16px,5vw,40px) 0',
          padding: '20px 24px',
          borderRadius: 16,
          border: '1px solid rgba(153,69,255,0.25)',
          background: 'linear-gradient(135deg, rgba(153,69,255,0.05), rgba(0,194,255,0.05))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', letterSpacing: '1.5px', marginBottom: 4 }}>
              GAME VERIFICATION REQUIRED
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--p-text)' }}>
              Play BlockBite to unlock this stream
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              Reach the required level in-game, then tokens will unlock automatically.
            </div>
          </div>
          <button
            onClick={() => router.push(`/game?stream=${streamPda.toBase58()}&level=${Math.max(1, cliffDays > 30 ? 25 : 10)}`)}
            style={{
              padding: '10px 24px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #9945FF, #00C2FF)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ▶ Play to Verify
          </button>
        </div>
      )}

      {/* ── Cancel confirmation modal ──────────────────────────────────────── */}
      {confirmCancel && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(8,8,26,.88)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: C.bg1, border: '1px solid color-mix(in srgb, var(--p-red) 27%, transparent)', borderRadius: 20,
            padding: '32px 36px', maxWidth: 400, width: '90%', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontFamily: C.serif, fontSize: 20, fontWeight: 800, color: 'var(--p-text)', margin: '0 0 10px' }}>
              {lang === 'id' ? 'Batalkan stream ini?' : 'Cancel this stream?'}
            </h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, margin: '0 0 12px' }}>
              {lang === 'id'
                ? <>{`Tindakan ini `}<strong style={{ color: C.red }}>tidak dapat dibatalkan</strong>{`. Semua token yang belum vesting akan dikembalikan ke wallet kamu. Penerima tetap mendapatkan token yang sudah vesting.`}</>
                : <>{'This action is '}<strong style={{ color: C.red }}>irreversible</strong>{'. All unvested tokens will be returned to your wallet. The beneficiary keeps tokens already vested.'}</>
              }
            </p>
            {/* Clawback risk disclosure — informs both creator and any observers */}
            <div style={{
              margin: '0 0 20px', padding: '10px 14px', borderRadius: 10,
              background: 'color-mix(in srgb, var(--p-ember) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--p-ember) 21%, transparent)',
              fontSize: 11.5, color: C.ember, textAlign: 'left', lineHeight: 1.65,
            }}>
              <strong>⚠ SOLO AUTHORITY — No Multisig Protection</strong>
              <br />
              Your wallet is the sole cancel key. This clawback requires only{' '}
              <strong>your single signature</strong> — no co-signers or time-lock.
              To enforce M-of-N governance, create future streams with a Squads
              multisig vault as the authority address.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '11px 28px', borderRadius: 11, border: 'none',
                  background: C.red, color: 'var(--p-text)', fontWeight: 800, fontSize: 14,
                  cursor: 'pointer', fontFamily: C.serif,
                }}
              >
                {lang === 'id' ? 'Ya, Batalkan Stream' : 'Yes, Cancel Stream'}
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                style={{
                  padding: '11px 24px', borderRadius: 11, border: `1px solid ${C.border}`,
                  background: 'rgba(255,255,255,.03)', color: C.muted, fontSize: 14,
                  cursor: 'pointer', fontFamily: C.serif,
                }}
              >
                {lang === 'id' ? 'Pertahankan Stream' : 'Keep Stream'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close confirmation modal ──────────────────────────────────────── */}
      {confirmClose && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(8,8,26,.88)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: C.bg1, border: '1px solid color-mix(in srgb, var(--p-blue) 27%, transparent)', borderRadius: 20,
            padding: '32px 36px', maxWidth: 400, width: '90%', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontFamily: C.serif, fontSize: 20, fontWeight: 800, color: 'var(--p-text)', margin: '0 0 10px' }}>
              {lang === 'id' ? 'Tutup stream ini?' : 'Close this stream?'}
            </h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, margin: '0 0 12px' }}>
              {lang === 'id'
                ? <>Tindakan ini akan <strong style={{ color: C.blue }}>menghapus akun stream dari blockchain</strong> dan mengembalikan SOL deposit (rent) ke wallet kamu. Semua token sudah harus ditarik atau stream harus dibatalkan terlebih dahulu.</>
                : <>This will <strong style={{ color: C.blue }}>delete the stream account from the blockchain</strong> and reclaim the SOL rent deposit to your wallet. All tokens must be withdrawn or the stream must be cancelled first.</>
              }
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={handleClose}
                style={{
                  padding: '11px 28px', borderRadius: 11, border: 'none',
                  background: C.blue, color: '#0b0918', fontWeight: 800, fontSize: 14,
                  cursor: 'pointer', fontFamily: C.serif,
                }}
              >
                {lang === 'id' ? 'Ya, Tutup Stream' : 'Yes, Close Stream'}
              </button>
              <button
                onClick={() => setConfirmClose(false)}
                style={{
                  padding: '11px 24px', borderRadius: 11, border: `1px solid ${C.border}`,
                  background: 'rgba(255,255,255,.03)', color: C.muted, fontSize: 14,
                  cursor: 'pointer', fontFamily: C.serif,
                }}
              >
                {lang === 'id' ? 'Batal' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '24px clamp(16px,5vw,40px)', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* 3-stage claim progress */}
        {(claimStage === 'approving' || claimStage === 'confirming') && (
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--p-accent) 20%, transparent)',
            background: 'color-mix(in srgb, var(--p-accent) 2%, transparent)', display: 'flex', alignItems: 'center', gap: 14 }}>
            {[
              { label: 'Wallet Approval', done: claimStage === 'confirming' },
              { label: 'Sending to Solana', done: false },
              { label: 'Confirmed On-Chain', done: false },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: s.done ? 'color-mix(in srgb, var(--p-green) 13%, transparent)' : i === (claimStage === 'confirming' ? 1 : 0) ? 'color-mix(in srgb, var(--p-accent) 13%, transparent)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${s.done ? 'color-mix(in srgb, var(--p-green) 40%, transparent)' : i === (claimStage === 'confirming' ? 1 : 0) ? 'color-mix(in srgb, var(--p-accent) 40%, transparent)' : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  {s.done ? '✓' : '·'}
                </div>
                <span style={{ fontSize: 11, color: s.done ? C.green : i === (claimStage === 'confirming' ? 1 : 0) ? 'var(--ds-text)' : C.muted,
                  whiteSpace: 'nowrap' }}>{s.label}</span>
                {i < 2 && <div style={{ width: 24, height: 1, background: C.border, marginLeft: 4 }} />}
              </div>
            ))}
          </div>
        )}
        {/* 3-stage cancel progress */}
        {(cancelStage === 'approving' || cancelStage === 'confirming') && (
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--p-red) 20%, transparent)',
            background: 'color-mix(in srgb, var(--p-red) 2%, transparent)', display: 'flex', alignItems: 'center', gap: 14 }}>
            {[
              { label: 'Wallet Approval', done: cancelStage === 'confirming' },
              { label: 'Sending to Solana', done: false },
              { label: 'Confirmed On-Chain', done: false },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: s.done ? 'color-mix(in srgb, var(--p-green) 13%, transparent)' : i === (cancelStage === 'confirming' ? 1 : 0) ? 'color-mix(in srgb, var(--p-red) 13%, transparent)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${s.done ? 'color-mix(in srgb, var(--p-green) 40%, transparent)' : i === (cancelStage === 'confirming' ? 1 : 0) ? 'color-mix(in srgb, var(--p-red) 40%, transparent)' : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  {s.done ? '✓' : '·'}
                </div>
                <span style={{ fontSize: 11, color: s.done ? C.green : i === (cancelStage === 'confirming' ? 1 : 0) ? C.red : C.muted,
                  whiteSpace: 'nowrap' }}>{s.label}</span>
                {i < 2 && <div style={{ width: 24, height: 1, background: C.border, marginLeft: 4 }} />}
              </div>
            ))}
          </div>
        )}
        {/* 3-stage close progress */}
        {(closeStage === 'approving' || closeStage === 'confirming') && (
          <div style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--p-blue) 20%, transparent)',
            background: 'color-mix(in srgb, var(--p-blue) 2%, transparent)', display: 'flex', alignItems: 'center', gap: 14 }}>
            {[
              { label: 'Wallet Approval', done: closeStage === 'confirming' },
              { label: 'Sending to Solana', done: false },
              { label: 'Confirmed On-Chain', done: false },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: s.done ? 'color-mix(in srgb, var(--p-green) 13%, transparent)' : i === (closeStage === 'confirming' ? 1 : 0) ? 'color-mix(in srgb, var(--p-blue) 13%, transparent)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${s.done ? 'color-mix(in srgb, var(--p-green) 40%, transparent)' : i === (closeStage === 'confirming' ? 1 : 0) ? 'color-mix(in srgb, var(--p-blue) 40%, transparent)' : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  {s.done ? '✓' : '·'}
                </div>
                <span style={{ fontSize: 11, color: s.done ? C.green : i === (closeStage === 'confirming' ? 1 : 0) ? C.blue : C.muted,
                  whiteSpace: 'nowrap' }}>{s.label}</span>
                {i < 2 && <div style={{ width: 24, height: 1, background: C.border, marginLeft: 4 }} />}
              </div>
            ))}
          </div>
        )}

        {/* Claim result banner */}
        {claimSig && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-green) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-green) 27%, transparent)',
            fontSize: 12, color: C.green,
          }}>
            ✓ Claimed ·{' '}
            <a
              href={`https://explorer.solana.com/tx/${claimSig}?cluster=devnet`}
              target="_blank" rel="noreferrer"
              style={{ color: C.green }}
            >
              {claimSig.slice(0, 8)}…{claimSig.slice(-6)} ↗
            </a>
          </div>
        )}
        {claimErr && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-red) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-red) 27%, transparent)',
            fontSize: 12, color: C.red,
          }}>
            ✗ {claimErr}
          </div>
        )}
        {cancelSig && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-red) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-red) 27%, transparent)',
            fontSize: 12, color: C.red,
          }}>
            Stream cancelled ·{' '}
            <a
              href={`https://explorer.solana.com/tx/${cancelSig}?cluster=devnet`}
              target="_blank" rel="noreferrer"
              style={{ color: C.red }}
            >
              {cancelSig.slice(0, 8)}…{cancelSig.slice(-6)} ↗
            </a>
          </div>
        )}
        {cancelErr && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-red) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-red) 27%, transparent)',
            fontSize: 12, color: C.red,
          }}>
            ✗ {cancelErr}
          </div>
        )}
        {closeSig && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-blue) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-blue) 27%, transparent)',
            fontSize: 12, color: C.blue,
          }}>
            Stream closed ·{' '}
            <a
              href={`https://explorer.solana.com/tx/${closeSig}?cluster=devnet`}
              target="_blank" rel="noreferrer"
              style={{ color: C.blue }}
            >
              {closeSig.slice(0, 8)}…{closeSig.slice(-6)} ↗
            </a>
          </div>
        )}
        {closeErr && (
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-red) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-red) 27%, transparent)',
            fontSize: 12, color: C.red,
          }}>
            ✗ {closeErr}
          </div>
        )}

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,140px),1fr))', gap: 12 }}>
          {[
            { l: lang === 'id' ? 'Total' : 'Total',       v: fmtTokens(total),                                                  c: 'var(--ds-text)' },
            { l: 'Claimed',     v: fmtTokens(withdrawn),                                              c: C.green   },
            { l: 'Unlocked',    v: fmtTokens(claimable),                                              c: C.gold    },
            { l: 'Still Locked',v: fmtTokens(total > unlockedTotal ? total - unlockedTotal : 0n),    c: C.accent  },
            { l: 'Time Left',   v: timeRemaining,                                                     c: stream.cancelled || nowSec >= endTs ? C.muted : C.blue },
          ].map(x => (
            <Card key={x.l} style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 9.5, color: C.muted, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                {x.l}
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700, color: x.c, lineHeight: 1 }}>
                {x.v}
              </div>
            </Card>
          ))}
        </div>

        {/* Meta badges */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge label={type.toUpperCase()} color={typeCol} />
          <Badge label={statusLabel}        color={statusColor} />

          {/* Clawback-Multisig protection indicator */}
          {!stream.cancelled && (
            <span
              title={clawbackRisk
                ? 'This wallet is the sole cancel authority — unilateral clawback is possible. Multisig protection would require M-of-N signers.'
                : 'Cancel authority is held by a different address. This connected wallet cannot trigger a clawback.'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 6,
                fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em',
                fontFamily: C.mono, cursor: 'default',
                background: clawbackRisk ? 'color-mix(in srgb, var(--p-ember) 8%, transparent)' : 'color-mix(in srgb, var(--p-green) 7%, transparent)',
                border: `1px solid color-mix(in srgb, ${clawbackRisk ? C.ember : C.green} 25%, transparent)`,
                color: clawbackRisk ? C.ember : C.green,
              }}
            >
              {clawbackRisk ? '⚠ SOLO AUTHORITY' : '🔒 RESTRICTED'}
            </span>
          )}

          <span style={{ fontSize: 11.5, color: C.muted }}>
            Start: <b style={{ color: 'var(--p-text)' }}>{fmtDate(startTs)}</b>
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            Cliff: <b style={{ color: 'var(--p-text)' }}>{fmtDate(cliffTs)}</b>
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            End: <b style={{ color: 'var(--p-text)' }}>{fmtDate(endTs)}</b>
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            Creator: <code style={{ color: C.accent, fontFamily: C.mono, fontSize: 11 }}>{truncatePk(stream.authority)}</code>
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            Recipient: <code style={{ color: C.blue, fontFamily: C.mono, fontSize: 11 }}>{truncatePk(stream.beneficiary)}</code>
          </span>
          <span style={{ fontSize: 11.5, color: C.muted }}>
            Mint: <code style={{ color: C.gold, fontFamily: C.mono, fontSize: 11 }}>{truncatePk(stream.mint)}</code>
          </span>
        </div>

        {/* Curve + schedule/milestone panel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>

          {/* Vesting curve SVG */}
          <Card>
            <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 700, color: 'var(--p-text)', marginBottom: 12 }}>
              Vesting Curve — {type.charAt(0).toUpperCase() + type.slice(1)} Model
            </div>
            <svg width="100%" viewBox={`0 0 ${W} ${H + 28}`} style={{ display: 'block' }}>
              <defs>
                <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={typeCol} stopOpacity="0.35" />
                  <stop offset="1" stopColor={typeCol} stopOpacity="0" />
                </linearGradient>
                <filter id="glow"><feGaussianBlur stdDeviation="2.5" /></filter>
              </defs>
              {[0, 0.5, 1].map(v => (
                <line key={v}
                  x1={PX} y1={H - PY - v * ih}
                  x2={PX + iw} y2={H - PY - v * ih}
                  stroke="rgba(255,255,255,.05)" strokeWidth="1"
                />
              ))}
              <path d={areaD} fill="url(#vg)" />
              <path d={pathD} fill="none" stroke={typeCol} strokeWidth="2.5"
                filter="url(#glow)" strokeLinecap="round" />
              <path d={pathD} fill="none" stroke={typeCol} strokeWidth="1.5" strokeLinecap="round" />
              {/* NOW indicator */}
              <line
                x1={nowX} y1={PY / 2}
                x2={nowX} y2={H - PY}
                stroke={C.gold} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.8"
              />
              <circle cx={nowX} cy={nowY} r="5" fill={C.gold}
                style={{ filter: `drop-shadow(0 0 6px ${C.gold})` }} />
              <text x={nowX} y={PY / 2 - 2} textAnchor="middle" fontSize="8.5"
                fontFamily="JetBrains Mono,monospace" fill={C.gold}>
                NOW
              </text>
            </svg>

            {/* Progress bar */}
            <div style={{ marginTop: 10 }}>
              <div style={{
                height: 8, borderRadius: 99, background: 'rgba(255,255,255,.06)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${total > 0n ? Math.round(Number(unlockedTotal) * 100 / Number(total)) : 0}%`,
                  background: `color-mix(in srgb, ${typeCol} 27%, transparent)`, transition: 'width .5s',
                }} />
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${total > 0n ? Math.round(Number(withdrawn) * 100 / Number(total)) : 0}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${typeCol} 53%, transparent), ${typeCol})`,
                  transition: 'width .5s',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginTop: 4 }}>
                <span>Withdrawn {total > 0n ? Math.round(Number(withdrawn) * 100 / Number(total)) : 0}%</span>
                <span>Unlocked {total > 0n ? Math.round(Number(unlockedTotal) * 100 / Number(total)) : 0}%</span>
                <span>Total {fmtTokens(total)} tokens</span>
              </div>
            </div>
          </Card>

          {/* Milestones or schedule */}
          <Card>
            <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 700, color: 'var(--p-text)', marginBottom: 12 }}>
              {milestoneCount > 0 ? 'Milestone Gates' : 'Schedule'}
            </div>

            {milestoneCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: milestoneCount }).map((_, i) => {
                  const done = milestonesVerified[i] ?? false;
                  const pct  = milestonePct[i] ?? 0;
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 10, alignItems: 'center',
                      padding: '9px 12px', borderRadius: 10,
                      background: done ? 'color-mix(in srgb, var(--p-green) 4%, transparent)' : 'rgba(255,255,255,.03)',
                      border: `1px solid ${done ? C.green : C.border}`,
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                        background: done ? C.green : 'rgba(255,255,255,.06)',
                        border: `1.5px solid ${done ? C.green : C.border}`,
                        display: 'grid', placeItems: 'center',
                        fontSize: 12, color: done ? '#0b0a14' : C.muted,
                      }}>
                        {done ? '✓' : i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: done ? 'var(--ds-text)' : C.muted, fontWeight: done ? 600 : 400 }}>
                          {lang === 'id' ? 'Milestone' : 'Milestone'} {i + 1}
                        </div>
                        <div style={{ fontSize: 9.5, color: C.muted }}>{pct}% unlock · {done ? (lang === 'id' ? 'terverifikasi' : 'verified') : (lang === 'id' ? 'menunggu' : 'pending')}</div>
                      </div>
                      <div style={{ fontFamily: C.mono, fontSize: 11, color: done ? C.green : C.muted }}>
                        {pct}%
                      </div>
                    </div>
                  );
                })}
                {requiredTier > 0 && (
                  <div style={{ fontSize: 11, color: C.muted, paddingTop: 4 }}>
                    Tier gate: requires tier ≥ {requiredTier}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { l: 'Start',      v: fmtDate(startTs),             c: C.muted  },
                  { l: 'Cliff',      v: fmtDate(cliffTs),             c: C.gold   },
                  { l: 'End',        v: fmtDate(endTs),               c: C.accent },
                  { l: 'Stream ID',  v: stream.streamId.toString(),   c: C.blue   },
                ].map((r, i, arr) => (
                  <div key={r.l} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '9px 0',
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{r.l}</span>
                    <span style={{ fontSize: 12, color: r.c, fontFamily: C.mono }}>{r.v}</span>
                  </div>
                ))}
                {!publicKey && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 10, padding: '8px 10px', background: 'rgba(255,255,255,.02)', borderRadius: 8 }}>
                    Connect wallet to claim vested tokens
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Math breakdown */}
        <Card>
          <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 700, color: 'var(--p-text)', marginBottom: 12 }}>
            Mathematical Breakdown — On-Chain Formula
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Total Duration',   val: `${vestDays} days`,     col: typeCol  },
              { label: 'Cliff Period',      val: `${cliffDays} days`,    col: C.ember  },
              { label: 'Vesting Rate',      val: activeDays > 0
                ? `${fmtTokens(total / BigInt(activeDays))} T/day`
                : '—',                                                    col: typeCol  },
            ].map(x => (
              <div key={x.label} style={{
                padding: '12px 14px', background: 'rgba(255,255,255,.03)',
                borderRadius: 10, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 9.5, color: C.muted, marginBottom: 4 }}>{x.label}</div>
                <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: x.col }}>{x.val}</div>
              </div>
            ))}
          </div>
          <div style={{
            fontFamily: C.mono, fontSize: 12, color: C.muted,
            background: 'rgba(0,0,0,.3)', borderRadius: 10, padding: '12px 16px',
            lineHeight: 1.8,
          }}>
            <span style={{ color: C.accent }}>claimable(t)</span>
            {' = min('}
            <span style={{ color: C.gold }}>{fmtTokens(total)}</span>
            {', R × (t − cliff_ts)) − withdrawn'}
            <br />
            <span style={{ color: C.muted }}>
              {'// gated by: cliff_passed'}
              {requiredTier > 0 ? ` AND tier ≥ ${requiredTier}` : ''}
            </span>
          </div>
        </Card>

        {/* Explorer link */}
        <div style={{ textAlign: 'center', fontSize: 12, color: C.muted }}>
          <a
            href={`https://explorer.solana.com/address/${streamPda.toBase58()}?cluster=devnet`}
            target="_blank" rel="noreferrer"
            style={{ color: C.accent, textDecoration: 'none' }}
          >
            View stream account on Solana Explorer ↗
          </a>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress, getMint,
} from '@solana/spl-token';
import {
  fetchStream, deriveStreamPDA, deriveVaultPDA,
  withdraw, ensureAtaIx, deriveProofCachePDA, computeUnlocked,
} from '@/lib/anchor/vesting-client';
import { useApp } from '@/lib/useApp';
import { T } from '@/lib/theme';

const ONE_DAY = 86_400;

function shortPk(pk: PublicKey) {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/**
 * Public claim page.
 *
 * URL: /claim/<stream PDA base58> OR /claim/<authority>:<stream_id>
 *
 * Renders vested progress, recipient address, total/withdrawn breakdown.
 * When the connected wallet matches stream.beneficiary, exposes a Withdraw
 * button that calls the program's withdraw() instruction.
 *
 * Shareable link: founders can DM this URL to their recipients and that's
 * all the recipient needs — wallet picker handles the rest.
 */
export default function ClaimPage() {
  const params = useParams<{ stream: string }>();
  const streamParam = params?.stream ?? '';
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const { lang } = useApp();

  // Keep lang in a ref so callbacks can read current value without being re-created
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  // Resolve URL param into a stream PDA. Supports two forms.
  const streamPda = useMemo(() => {
    if (!streamParam) return null;
    // Form 1: direct base58 PDA
    try { return new PublicKey(streamParam); } catch { /* fall through */ }
    // Form 2: authority:recipient:stream_id derivation (mancer PDA)
    const parts = streamParam.split(':');
    if (parts.length === 3) {
      try {
        const auth      = new PublicKey(parts[0]);
        const recipient = new PublicKey(parts[1]);
        const sid       = new BN(parts[2]);
        const [pda] = deriveStreamPDA(auth, recipient, sid);
        return pda;
      } catch { /* invalid */ }
    }
    return null;
  }, [streamParam]);

  const [stream,    setStream]    = useState<Awaited<ReturnType<typeof fetchStream>>>(null);
  const [decimals,  setDecimals]  = useState<number>(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [sig,       setSig]       = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!streamPda) {
      setError(langRef.current === 'id' ? 'URL stream tidak valid.' : 'Invalid stream URL.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchStream(connection, streamPda);
      if (!data) {
        setError(langRef.current === 'id'
          ? 'Stream tidak ditemukan on-chain. Verifikasi tautannya.'
          : 'Stream not found on-chain. Verify the link.');
        setStream(null);
      } else {
        setStream(data);
        const mintInfo = await getMint(connection, data.mint);
        setDecimals(mintInfo.decimals);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [streamPda, connection]);

  useEffect(() => { refresh(); }, [refresh]);

  const ui = useMemo(() => {
    if (!stream || decimals === 0) return null;
    const now     = Math.floor(Date.now() / 1000);
    const total   = Number(stream.amountTotal.toString()) / 10 ** decimals;
    const taken   = Number(stream.amountWithdrawn.toString()) / 10 ** decimals;
    const startTs = stream.startTs.toNumber();
    const cliffTs = stream.cliffTs.toNumber();
    const endTs   = stream.endTs.toNumber();

    // Use computeUnlocked which mirrors the Rust logic EXACTLY:
    // cliff_time=0 → pure linear; cliff_time>0 && !milestoneReached → 0;
    // cliff_time>0 && milestoneReached → linear from cliff to end.
    const claimableRaw = computeUnlocked(stream, now);
    const claimable    = Number(claimableRaw) / 10 ** decimals;

    // Vested fraction for progress bar — only show > 0 when actually unlocked
    const totalRaw  = BigInt(stream.amountTotal.toString());
    const vestedFrac = totalRaw > 0n
      ? Math.min(1, Number(claimableRaw + BigInt(stream.amountWithdrawn.toString())) / Number(totalRaw))
      : 0;

    const cliffActive = cliffTs > 0 && now < cliffTs;
    const cliffDays   = Math.max(0, Math.ceil((cliffTs - now) / ONE_DAY));
    return {
      now, total, taken,
      vested:    claimable + taken,
      claimable, vestedFrac,
      startTs, cliffTs, endTs, cliffActive, cliffDays,
    };
  }, [stream, decimals]);

  const isRecipient = !!(stream && publicKey && publicKey.equals(stream.beneficiary));

  const handleWithdraw = useCallback(async () => {
    if (!publicKey || !stream || !streamPda) return;
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const [vault] = deriveVaultPDA(stream.authority, stream.beneficiary, stream.streamId);
      const beneficiaryAta = await getAssociatedTokenAddress(stream.mint, publicKey);

      // If the recipient's ATA doesn't exist yet, create it in a separate tx first.
      const createIx = await ensureAtaIx(connection, publicKey, publicKey, stream.mint);

      if (createIx) {
        const tx = new Transaction().add(createIx);
        tx.feePayer = publicKey;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        tx.recentBlockhash = blockhash;
        const ataSig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(
          { signature: ataSig, blockhash, lastValidBlockHeight },
          'confirmed',
        );
      }

      // Tier gate: pass ProofCache PDA if required; SystemProgram otherwise
      const proofCache = (stream.requiredTier ?? 0) > 0
        ? deriveProofCachePDA(streamPda, publicKey)[0]
        : SystemProgram.programId;

      const signature = await withdraw({
        connection,
        beneficiary:    publicKey,
        stream:         streamPda,
        vault,
        beneficiaryAta,
        mint:           stream.mint,
        proofCache,
        sendTransaction,
      });
      setSig(signature);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [publicKey, stream, streamPda, sendTransaction, connection, refresh]);

  const id = lang === 'id';
  const vestedLabel  = id ? 'TERVESTING'         : 'VESTED';
  const claimNow     = id ? 'BISA DIKLAIM'        : 'CLAIMABLE NOW';
  const alreadyWith  = id ? 'SUDAH DITARIK'       : 'ALREADY WITHDRAWN';
  const statusLabel  = id ? 'STATUS'              : 'STATUS';
  const cancelledLbl = id ? 'DIBATALKAN'          : 'CANCELLED';
  const fullyVested  = id ? 'SEPENUHNYA VESTING'  : 'FULLY VESTED';
  const vestingLbl   = id ? 'VESTING'             : 'VESTING';
  const cliffLbl     = (d: number) => id ? `CLIFF · ${d}h` : `CLIFF · ${d}d`;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '120px 24px 80px' }}>

        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, marginBottom: 4 }}>
          {id ? 'Klaim Token' : 'Claim Tokens'}
        </h1>
        <p style={{ color: T.textDim, fontSize: 13, marginBottom: 30 }}>
          {id ? 'Stream vesting on-chain ·' : 'On-chain vesting stream ·'}{' '}
          {streamPda ? shortPk(streamPda) : 'invalid'}
        </p>

        {loading && (
          <div style={{ padding: 30, textAlign: 'center', color: T.textDim }}>
            {id ? 'Membaca stream dari devnet…' : 'Reading stream from devnet…'}
          </div>
        )}

        {!loading && error && (
          <div style={{
            padding: 18, borderRadius: 12,
            background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.4)',
            color: '#f472b6', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {!loading && stream && ui && (
          <>
            {/* Vesting progress */}
            <section style={{
              padding: 22, borderRadius: 16,
              background: T.surface, border: `1px solid ${T.border}`,
              marginBottom: 18,
            }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.accent, marginBottom: 6 }}>
                {vestedLabel}
              </div>
              <div style={{ fontSize: 34, fontWeight: 900, marginBottom: 4 }}>
                {ui.vested.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                <span style={{ fontSize: 14, fontWeight: 600, color: T.textDim, marginLeft: 8 }}>
                  / {ui.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: T.surface2, overflow: 'hidden', marginTop: 12 }}>
                <div style={{
                  height: '100%', width: `${ui.vestedFrac * 100}%`,
                  background: T.grad, transition: 'width 0.6s',
                }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: T.textDim }}>
                <span>{id ? 'mulai' : 'start'} {new Date(ui.startTs * 1000).toLocaleDateString()}</span>
                <span>{(ui.vestedFrac * 100).toFixed(2)}%</span>
                <span>{id ? 'akhir' : 'end'} {new Date(ui.endTs * 1000).toLocaleDateString()}</span>
              </div>
            </section>

            {/* Stats grid */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
              <StatBox label={claimNow}    value={ui.claimable.toFixed(2)} accent={ui.claimable > 0}/>
              <StatBox label={alreadyWith} value={ui.taken.toFixed(2)}/>
              <StatBox label={statusLabel} value={
                stream.cancelled  ? cancelledLbl
                : ui.cliffActive  ? cliffLbl(ui.cliffDays)
                : ui.vestedFrac >= 1 ? fullyVested
                : vestingLbl
              }/>
            </section>

            {/* Action area */}
            <section style={{
              padding: 22, borderRadius: 16,
              background: T.surface, border: `1px solid ${T.border}`,
            }}>
              {!connected && (
                <>
                  <p style={{ color: T.textDim, fontSize: 13, marginBottom: 14 }}>
                    {id ? 'Alamat penerima:' : 'Recipient address:'}{' '}
                    <span style={{ fontFamily: 'monospace', color: T.text }}>{shortPk(stream.beneficiary)}</span>
                    <br/>{id ? 'Hubungkan wallet ini untuk klaim.' : 'Connect with this wallet to claim.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setVisible(true)}
                    style={{
                      padding: '12px 22px', borderRadius: 12, border: 'none',
                      background: T.grad, color: '#0a0a14',
                      fontWeight: 900, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    {id ? 'HUBUNGKAN WALLET' : 'CONNECT WALLET'}
                  </button>
                </>
              )}

              {connected && !isRecipient && (
                <p style={{ color: T.textDim, fontSize: 13 }}>
                  {id
                    ? `Wallet yang terhubung tidak cocok dengan penerima stream ini. Ganti ke ${shortPk(stream.beneficiary)} untuk klaim.`
                    : `Connected wallet doesn't match the recipient of this stream. Switch to ${shortPk(stream.beneficiary)} to claim.`}
                </p>
              )}

              {connected && isRecipient && (
                <>
                  {stream.cancelled && (
                    <p style={{ color: '#f472b6', fontSize: 13, marginBottom: 12 }}>
                      {id
                        ? 'Stream dibatalkan oleh pembuat. Tidak ada klaim lebih lanjut.'
                        : 'Stream cancelled by creator. No further claims possible.'}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={busy || ui.claimable <= 0 || stream.cancelled}
                    style={{
                      padding: '14px 22px', borderRadius: 12, border: 'none',
                      background: ui.claimable > 0 && !stream.cancelled ? T.grad : T.surface2,
                      color: ui.claimable > 0 && !stream.cancelled ? '#0a0a14' : T.textDim,
                      fontWeight: 900, fontSize: 15,
                      cursor: ui.claimable > 0 && !stream.cancelled ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {busy
                      ? (id ? 'MENGKLAIM…' : 'CLAIMING…')
                      : ui.claimable > 0
                        ? (id ? `KLAIM ${ui.claimable.toFixed(2)}` : `CLAIM ${ui.claimable.toFixed(2)}`)
                        : (id ? 'BELUM ADA YANG BISA DIKLAIM' : 'NOTHING TO CLAIM YET')}
                  </button>
                </>
              )}

              {sig && (
                <div style={{
                  marginTop: 14, padding: 12, borderRadius: 10,
                  background: 'rgba(94,234,212,0.08)', border: '1px solid rgba(94,234,212,0.5)',
                }}>
                  <div style={{ fontSize: 11, color: '#5eead4', fontWeight: 800, marginBottom: 4 }}>
                    {id ? 'DITARIK' : 'WITHDRAWN'}
                  </div>
                  <a
                    href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: '#5eead4', fontFamily: 'monospace', wordBreak: 'break-all' }}
                  >
                    {sig.slice(0, 16)}…{sig.slice(-16)} ↗
                  </a>
                </div>
              )}
            </section>

            {/* Clawback-Multisig disclosure for recipients */}
            {!stream.cancelled && (
              <div style={{
                marginTop: 16, padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,122,58,0.07)', border: '1px solid rgba(255,122,58,0.28)',
                fontSize: 11.5, color: 'rgba(255,165,100,0.9)', lineHeight: 1.6,
              }}>
                <strong style={{ display: 'block', marginBottom: 2 }}>
                  {id ? '⚠ Risiko Clawback' : '⚠ Clawback Risk'}
                </strong>
                {id
                  ? 'Pembuat memegang otoritas pembatalan satu kunci — mereka dapat membekukan stream ini secara sepihak kapan saja. Token yang belum vesting akan dikembalikan kepada mereka, dan tidak ada klaim lebih lanjut. Stream yang dilindungi oleh vault multisig Squads memerlukan M-dari-N penandatangan sebelum pembatalan berlaku.'
                  : 'The creator holds a single-key cancel authority — they can freeze this stream unilaterally at any time. Unvested tokens would be returned to them, and no further claims would be possible. Streams protected by a Squads multisig vault require M-of-N co-signers before any cancellation takes effect.'}
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 11, color: T.textDim, textAlign: 'center' }}>
              From {shortPk(stream.authority)} · Mint {shortPk(stream.mint)}
              <br/>
              <Link href="/distribute" style={{ color: T.accent, textDecoration: 'none' }}>
                {id ? 'Apa ini?' : 'What is this?'}
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: accent ? 'rgba(94,234,212,0.10)' : T.surface,
      border: `1px solid ${accent ? 'rgba(94,234,212,0.4)' : T.border}`,
    }}>
      <div style={{ fontSize: 10, color: T.textDim, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: accent ? '#5eead4' : T.text }}>
        {value}
      </div>
    </div>
  );
}

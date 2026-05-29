'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Navbar from '@/components/Navbar';
import {
  getStreamsByAuthority, StreamInfo, setMilestone, deriveStreamPDA,
} from '@/lib/anchor/vesting-client';
import { BN } from '@coral-xyz/anchor';
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

type VerifyMethod = 'game' | 'oracle' | 'multisig' | 'manual';

const VERIFY_METHODS: {
  id: VerifyMethod; label: string; icon: string; color: string;
  title: string; desc: string; badge: string; detail: string; action: string;
}[] = [
  { id: 'game',     label: 'Game',     icon: '◈', color: T.accent,
    title: 'Play to Unlock',       badge: 'Sybil-Resistant', action: 'Play & Verify',
    desc:   'Score thresholds trigger on-chain milestone verification. Gamified, sybil-resistant.',
    detail: 'Score ≥ 1,000 pts → signed proof submitted to TDP ProofCache PDA.' },
  { id: 'oracle',   label: 'Oracle',   icon: '⬡', color: T.blue,
    title: 'Chainlink Automated',  badge: 'Fully Automated', action: 'Connect Feed',
    desc:   'KPI thresholds (user count, revenue, TVL) trigger milestone unlock automatically.',
    detail: 'Configure an oracle endpoint and threshold. TDP polls on a schedule and auto-verifies.' },
  { id: 'multisig', label: 'MultiSig', icon: '◉', color: T.gold,
    title: 'Multi-Sig Approval',   badge: 'DAO Native',      action: 'Collect Signatures',
    desc:   '3-of-5 designated signers approve milestone completion. Ideal for DAO governance.',
    detail: '3 of 5 configured signers co-sign a verify_milestone instruction. Signer list locked at creation.' },
  { id: 'manual',   label: 'Manual',   icon: '✦', color: T.green,
    title: 'Creator Signs',        badge: 'Permissioned',    action: 'Creator Verify',
    desc:   'Stream creator manually verifies KPI completion with a signed transaction.',
    detail: 'Stream creator submits a signed verify_milestone transaction. Simple and auditable.' },
];

function fmtTs(ts: BN | undefined): string {
  if (!ts) return '—';
  const sec = Number(ts.toString());
  if (sec === 0) return 'No cliff';
  return new Date(sec * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtAmt(n: BN | undefined): string {
  if (!n) return '—';
  const raw = BigInt(n.toString());
  return (raw / 1_000_000n).toLocaleString();
}

export default function MilestonesPage() {
  const { lang } = useApp();
  const tx = I18N.milestones[lang];

  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const { sendTransaction } = useWallet();

  const [streams, setStreams]   = useState<StreamInfo[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [selIdx,  setSelIdx]    = useState(0);
  const [selMethod, setMethod]  = useState<VerifyMethod>('game');
  const [verifying, setVerifying] = useState(false);
  const [verifyOk,  setVerifyOk]  = useState<string | null>(null); // tx sig
  const [verifyErr, setVerifyErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true); setError(null);
    try {
      setStreams(await getStreamsByAuthority(connection, publicKey));
      setSelIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RPC error');
    } finally { setLoading(false); }
  }, [connection, publicKey]);

  useEffect(() => { if (connected) load(); else setStreams([]); }, [connected, load]);

  const method = VERIFY_METHODS.find(v => v.id === selMethod)!;
  const stream = streams[selIdx];
  const nowSec = Math.floor(Date.now() / 1000);

  // ── setMilestone on-chain call ────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    if (!publicKey || !sendTransaction || !stream) return;
    setVerifying(true); setVerifyErr(null); setVerifyOk(null);
    try {
      const sig = await setMilestone(connection, publicKey, stream.pubkey, async (tx, conn) => {
        const s = await sendTransaction(tx, conn);
        return s;
      });
      setVerifyOk(sig);
      await load();
    } catch (e: unknown) {
      setVerifyErr((e as Error)?.message ?? 'Transaction failed');
    } finally {
      setVerifying(false);
    }
  }, [publicKey, sendTransaction, stream, connection, load]);
  const mCount = (stream as any)?.milestoneCount ?? 0;
  const isActive = stream && !stream.cancelled && Number(stream.endTs.toString()) > nowSec;

  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      <Navbar />

      {/* Header */}
      <div style={{ padding: '80px 24px 40px', background: T.header, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ fontSize: 11, letterSpacing: '2px', color: T.blue, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>{tx.badge}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(26px,5vw,42px)', fontWeight: 900, marginBottom: 10 }}>{tx.title}</h1>
              <p style={{ fontSize: 14, color: T.textDim, maxWidth: 580, lineHeight: 1.65 }}>
                {tx.subtitle}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/streams" style={{ fontSize: 12, color: T.textDim, textDecoration: 'none' }}>{tx.backStreams}</Link>
              <Link href="/demo#milestones" style={{ fontSize: 12, color: T.accent, textDecoration: 'none' }}>Demo ↗</Link>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 100px' }}>

        {/* Verification method selector — product documentation, not live data */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: '1.8px', color: T.accent, fontWeight: 700, marginBottom: 18, textTransform: 'uppercase' }}>{tx.sectionHeader}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            {VERIFY_METHODS.map(m => {
              const on = selMethod === m.id;
              return (
                <button key={m.id} onClick={() => setMethod(m.id)} style={{
                  padding: '20px 18px', borderRadius: 18, textAlign: 'left', cursor: 'pointer',
                  background: on ? T.accentA2 : T.surface,
                  border: `1.5px solid ${on ? m.color : T.border}`,
                  color: T.text, fontFamily: T.serif, transition: 'all .18s',
                  boxShadow: on ? `0 0 24px ${m.color}22` : 'none',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: T.accentA1, border: `1px solid ${m.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: m.color, marginBottom: 12 }}>{m.icon}</div>
                  <div style={{ fontSize: 10, color: m.color, fontWeight: 700, letterSpacing: '1.4px', marginBottom: 4 }}>{m.label.toUpperCase()}</div>
                  <div style={{ fontFamily: T.serif, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{m.title}</div>
                  <div style={{ fontSize: 11.5, color: T.textDim, lineHeight: 1.5 }}>{m.desc}</div>
                  <div style={{ marginTop: 12, display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: T.accentA1, color: m.color, border: `1px solid ${m.color}30` }}>{m.badge}</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 16, padding: '18px 22px', borderRadius: 14, background: T.accentA1, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: method.color, fontWeight: 700, marginBottom: 4 }}>{method.icon} {method.label} — {method.title}</div>
              <div style={{ fontSize: 13, color: T.textDim }}>{method.detail}</div>
            </div>
            {method.id === 'game'
              ? <Link href="/streams/new" style={{ padding: '9px 20px', borderRadius: 10, background: T.grad, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>{method.action} →</Link>
              : (
                <button
                  onClick={isActive && !stream?.milestoneReached ? handleVerify : undefined}
                  disabled={verifying || !isActive || stream?.milestoneReached}
                  style={{
                    padding: '9px 20px', borderRadius: 10, cursor: (isActive && !stream?.milestoneReached && !verifying) ? 'pointer' : 'not-allowed',
                    background: stream?.milestoneReached ? T.greenA1 : T.accentA2,
                    border: `1px solid ${stream?.milestoneReached ? T.green : T.border}`,
                    color: stream?.milestoneReached ? T.green : method.color,
                    fontWeight: 700, fontSize: 13, fontFamily: T.serif,
                    opacity: (verifying || !isActive) ? 0.6 : 1,
                  }}
                >
                  {verifying ? 'Confirming…' : stream?.milestoneReached ? '✓ Milestone Reached' : `${method.action} →`}
                </button>
              )
            }
          </div>
        </div>

        {/* Wallet gate */}
        {!connected && (
          <div style={{ padding: '52px 24px', textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18 }}>
            <div style={{ fontSize: 36, marginBottom: 16, color: T.gold }}>◉</div>
            <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{tx.walletTitle}</div>
            <p style={{ color: T.textDim, fontSize: 13, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              {tx.walletSub}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setVisible(true)} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer', background: T.grad, color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: T.serif }}>{tx.connectBtn}</button>
              <Link href="/demo#milestones" style={{ padding: '12px 24px', borderRadius: 12, border: `1px solid ${T.border}`, color: T.textDim, fontSize: 13, textDecoration: 'none', display: 'inline-block' }}>{I18N.common[lang].viewDemo}</Link>
            </div>
          </div>
        )}

        {connected && loading && <div style={{ padding: '48px', textAlign: 'center', color: T.textDim, fontSize: 13 }}>{tx.loadingMsg}</div>}

        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: T.redA1, border: `1px solid ${T.red}`, fontSize: 12, color: T.red, marginBottom: 16 }}>
            RPC error: {error} · <button onClick={load} style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 12 }}>{I18N.common[lang].retry}</button>
          </div>
        )}

        {connected && !loading && streams.length === 0 && !error && (
          <div style={{ padding: '52px 24px', textAlign: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18 }}>
            <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{tx.noStreamsTitle}</div>
            <p style={{ color: T.textDim, fontSize: 13, marginBottom: 20 }}>{tx.noStreamsSub}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/streams/new" style={{ padding: '10px 22px', borderRadius: 10, background: T.grad, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>{I18N.common[lang].createStream}</Link>
              <Link href="/demo#milestones" style={{ padding: '10px 18px', borderRadius: 10, border: `1px solid ${T.border}`, color: T.textDim, fontSize: 12, textDecoration: 'none' }}>{I18N.common[lang].viewDemo}</Link>
            </div>
          </div>
        )}

        {connected && !loading && streams.length > 0 && (
          <>
            {/* setMilestone tx feedback */}
            {verifyOk && (
              <div style={{ padding:'12px 16px', borderRadius:12, marginBottom:14, background:T.greenA1, border:`1px solid ${T.green}`, fontSize:12, color:T.green }}>
                ✓ Milestone set on-chain! Vesting now unlocks for recipient.{' '}
                <a href={`https://explorer.solana.com/tx/${verifyOk}?cluster=devnet`} target="_blank" rel="noreferrer" style={{color:T.accent}}>View tx ↗</a>
              </div>
            )}
            {verifyErr && (
              <div style={{ padding:'12px 16px', borderRadius:12, marginBottom:14, background:T.redA1, border:`1px solid ${T.red}`, fontSize:12, color:T.red }}>
                ⚠ {verifyErr}
                <button onClick={()=>setVerifyErr(null)} style={{marginLeft:12,background:'none',border:'none',color:T.accent,cursor:'pointer',fontSize:11}}>Dismiss</button>
              </div>
            )}

            {/* Program upgrade notice */}
            <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 24, background: T.goldA1, border: `1px solid ${T.gold}`, display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 20, color: T.gold, flexShrink: 0 }}>◉</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.gold, marginBottom: 3 }}>{tx.upgradeTitle}</div>
                <div style={{ fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
                  {tx.upgradeSub}{' '}
                  <code style={{ fontFamily: T.mono, fontSize: 10.5, color: T.blue }}>configure_milestones</code> /{' '}
                  <code style={{ fontFamily: T.mono, fontSize: 10.5, color: T.blue }}>verify_milestone</code>{' '}
                  deploy in the next release. Your streams below are live on-chain now.
                </div>
              </div>
            </div>

            {/* Stream tabs */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {streams.map((s, i) => (
                <button key={s.pubkey.toBase58()} onClick={() => setSelIdx(i)} style={{
                  padding: '9px 16px', borderRadius: 11, cursor: 'pointer',
                  border: `1.5px solid ${selIdx === i ? T.blue : T.border}`,
                  background: selIdx === i ? T.blueA1 : T.surface,
                  color: selIdx === i ? T.blue : T.textDim,
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all .15s', fontFamily: T.serif,
                }}>
                  {s.pubkey.toBase58().slice(0, 8)}…
                  <span style={{ marginLeft: 8, fontFamily: T.mono, fontSize: 10, color: s.cancelled ? T.red : Number(s.endTs.toString()) < nowSec ? T.textDim : T.green }}>
                    {s.cancelled ? tx.statusLabels.cancelled : Number(s.endTs.toString()) < nowSec ? tx.statusLabels.ended : tx.statusLabels.active}
                  </span>
                </button>
              ))}
            </div>

            {stream && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
                <div>
                  {/* Stream info bar */}
                  <div style={{ padding: '14px 18px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, marginBottom: 18, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {[
                      { l: 'PDA',         v: stream.pubkey.toBase58().slice(0,12)+'…',     c: T.accent  },
                      { l: 'Total',       v: fmtAmt(stream.amountTotal)+' tokens',          c: T.text    },
                      { l: 'Withdrawn',   v: fmtAmt(stream.amountWithdrawn)+' tokens',      c: T.blue    },
                      { l: 'Beneficiary', v: stream.beneficiary.toBase58().slice(0,10)+'…', c: T.textDim },
                    ].map(r => (
                      <div key={r.l}>
                        <div style={{ fontSize: 9.5, color: T.textDim, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 2 }}>{r.l}</div>
                        <div style={{ fontFamily: T.mono, fontSize: 11.5, color: r.c }}>{r.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Milestone state */}
                  {mCount === 0 ? (
                    <div style={{ padding: '36px 24px', borderRadius: 14, textAlign: 'center', background: T.surface, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 32, marginBottom: 14, color: T.gold }}>◉</div>
                      <div style={{ fontFamily: T.serif, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{tx.noMilestonesTitle}</div>
                      <p style={{ color: T.textDim, fontSize: 12.5, lineHeight: 1.7, maxWidth: 440, margin: '0 auto 22px' }}>
                        {tx.noMilestonesSub}{' '}
                        <code style={{ fontFamily: T.mono, color: T.blue, fontSize: 11 }}>configure_milestones</code>{' '}
                        after the program upgrade deploys. Pick a method above to learn how each works.
                      </p>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link href="/audit" style={{ padding: '8px 18px', borderRadius: 10, background: T.blueA1, border: `1px solid ${T.blue}`, color: T.blue, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>{tx.viewAuditTrail}</Link>
                        <Link href="/demo#milestones" style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.border}`, color: T.textDim, fontSize: 12, textDecoration: 'none' }}>{I18N.common[lang].viewDemo}</Link>
                      </div>
                    </div>
                  ) : Array.from({ length: mCount }).map((_, idx) => {
                    const done = ((stream as any).milestonesVerified?.[idx]) ?? false;
                    const pct  = ((stream as any).milestonePct?.[idx]) ?? 0;
                    return (
                      <div key={idx} style={{ background: done ? T.greenA1 : T.surface, border: `1px solid ${done ? T.green : T.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 14, fontWeight: 700, background: done ? T.greenA1 : T.surface, border: `2px solid ${done ? T.green : T.border}`, color: done ? T.green : T.textDim }}>
                            {done ? '✓' : idx}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{tx.milestoneLabel(idx)}</div>
                            <div style={{ fontFamily: T.mono, fontSize: 11.5, color: done ? T.green : T.textDim }}>{pct}% allocation · {done ? tx.verifiedOnChain : tx.pendingVerif}</div>
                          </div>
                          {!done && <span style={{ padding: '6px 14px', borderRadius: 9, fontSize: 11, background: T.goldA1, border: `1px solid ${T.gold}`, color: T.gold, fontWeight: 600 }}>{tx.awaitingUpgrade}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Side panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '18px 20px' }}>
                    <div style={{ fontFamily: T.serif, fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>{tx.streamDetails}</div>
                    {[
                      { l: tx.streamLabels.status,   v: stream.cancelled ? tx.statusLabels.cancelled : isActive ? tx.statusLabels.active : tx.statusLabels.ended, c: stream.cancelled ? T.red : isActive ? T.green : T.textDim },
                      { l: tx.streamLabels.start,    v: fmtTs(stream.startTs),     c: T.text    },
                      { l: tx.streamLabels.cliff,    v: fmtTs(stream.cliffTs),     c: T.gold    },
                      { l: tx.streamLabels.end,      v: fmtTs(stream.endTs),       c: T.text    },
                      { l: tx.streamLabels.streamId, v: stream.streamId.toString(), c: T.textDim },
                    ].map((r, i, a) => (
                      <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < a.length-1 ? `1px solid ${T.border}` : 'none' }}>
                        <span style={{ fontSize: 11, color: T.textDim }}>{r.l}</span>
                        <span style={{ fontFamily: T.mono, fontSize: 11, color: r.c, fontWeight: 600 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: T.blueA1, border: `1px solid ${T.blue}`, borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ fontSize: 10, color: T.blue, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>{tx.claimFormula}</div>
                    <pre style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{`claimable(t) = min(\n  unlocked(t),\n  total × Σ pct[i]\n  where verified[i]=true\n)`}</pre>
                  </div>
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>{tx.related}</div>
                    {tx.relatedLinks.map(l => (
                      <Link key={l.href} href={l.href} style={{ fontSize: 12.5, color: T.accent, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent, flexShrink: 0 }} />
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

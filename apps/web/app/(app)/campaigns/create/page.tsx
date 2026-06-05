'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import { RPC_URL, USDC_MINT } from '@/lib/solana/config';
import { useCampaignCreate } from '@/lib/hooks/useCampaignCreate';
import { toUsdcLamports } from '@/lib/solana/config';

// ─── Design tokens ───────────────────────────────────────────────────────────────
const C = {
  accent: '#a78bfa', accentDk: '#5e35d4', gold: '#f5c66a', green: '#5fd07a',
  blue: '#7ad7ff', ember: '#ff7a3a', red: '#ff3b6b', game: '#4ade80',
  gameDk: '#16a34a', muted: 'var(--p-muted)', border: 'var(--p-border)',
  bg0: 'var(--p-bg0)', bg1: 'var(--p-bg1)', bg2: 'var(--p-bg2)',
  card: 'rgba(255,255,255,.03)', mono: "'JetBrains Mono', monospace",
  serif: "'Space Grotesk', system-ui, sans-serif",
};

// ─── Atoms ────────────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em',
      textTransform: 'uppercase', color: C.muted, marginBottom: 7 }}>{children}</div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', mono = true }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} type={type}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: '100%', padding: '11px 14px', boxSizing: 'border-box',
        background: C.bg2, border: `1px solid ${focus ? C.accent : C.border}`,
        borderRadius: 10, color: '#e8e1f8', fontSize: 13, outline: 'none',
        fontFamily: mono ? C.mono : C.serif, transition: 'border-color .15s',
      }} />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: '100%', padding: '11px 14px', boxSizing: 'border-box', resize: 'vertical',
        background: C.bg2, border: `1px solid ${focus ? C.accent : C.border}`,
        borderRadius: 10, color: '#e8e1f8', fontSize: 13, outline: 'none',
        fontFamily: C.serif, lineHeight: 1.6, transition: 'border-color .15s',
      }} />
  );
}

function Slider({ label, value, onChange, min, max, step = 1, unit = '', color = C.accent }: {
  label: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step?: number; unit?: string; color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: '#e8e1f8', fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 800, color }}>
          {value.toLocaleString()}{unit}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0, height: 4,
          background: C.border, borderRadius: 99, transform: 'translateY(-50%)', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: 0, width: `${pct}%`, height: 4,
          background: color, borderRadius: 99, transform: 'translateY(-50%)', zIndex: 1,
          boxShadow: `0 0 8px ${color}88`,
        }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'relative', zIndex: 2, width: '100%',
            appearance: 'none', background: 'transparent', height: 20, cursor: 'pointer', accentColor: color,
          }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.muted }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function Toggle({ value, onChange, label, sub }: {
  value: boolean; onChange: (v: boolean) => void; label: string; sub?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e1f8' }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      <button type="button" onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value ? `linear-gradient(90deg, ${C.accent}, ${C.accentDk})` : 'rgba(255,255,255,.1)',
          position: 'relative', transition: 'background .2s',
        }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.4)',
        }} />
      </button>
    </div>
  );
}

// ─── Recipient row ────────────────────────────────────────────────────────────────
interface Recipient { wallet: string; amount: string; }
function RecipientRow({ r, i, onChange, onRemove }: {
  r: Recipient; i: number;
  onChange: (field: 'wallet' | 'amount', v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 36px', gap: 8, alignItems: 'center' }}>
      <Input value={r.wallet} onChange={v => onChange('wallet', v)} placeholder={`Recipient ${i + 1} wallet`} />
      <Input value={r.amount} onChange={v => onChange('amount', v)} placeholder="Amount" type="number" />
      <button onClick={onRemove} style={{
        width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.red}44`,
        background: `${C.red}0d`, color: C.red, cursor: 'pointer', fontSize: 15,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────────
export default function CreateCampaignPage() {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [gameGate, setGameGate] = useState(true);
  const [gameLevel, setGameLevel] = useState(10);
  const [recipient, setRecipient] = useState('');
  const [milestoneAmount, setMilestoneAmount] = useState('');
  const [milestoneDesc, setMilestoneDesc] = useState('');

  const { status, error, result, create, reset } = useCampaignCreate();

  const totalBudget = Number(budget) || 0;
  const milestoneAmt = Number(milestoneAmount) || 0;

  const STEPS = [
    { label: 'Campaign', icon: '◈' },
    { label: 'Milestone', icon: '◎' },
    { label: 'Review', icon: '▲' },
  ];

  const handleLaunch = useCallback(async () => {
    if (!publicKey) return;

    const titleHash = new Uint8Array(32);
    const descHash = new Uint8Array(32);
    const encoder = new TextEncoder();
    const titleEncoded = encoder.encode(name);
    const descEncoded = encoder.encode(milestoneDesc);
    titleHash.set(titleEncoded.slice(0, 32));
    descHash.set(descEncoded.slice(0, 32));

    const seed = BigInt(Date.now());
    const milestoneSeed = BigInt(Date.now() + 1);
    const gameProgramId = new PublicKey('Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq');
    const recipientPk = new PublicKey(recipient || publicKey.toBase58());

    await create(
      publicKey,
      USDC_MINT,
      toUsdcLamports(totalBudget),
      titleHash,
      seed,
      [{
        descriptionHash: descHash,
        tokenAmount: toUsdcLamports(milestoneAmt),
        gameProgramId,
        recipient: recipientPk,
        milestoneSeed,
      }],
      sendTransaction,
    );
  }, [publicKey, name, milestoneDesc, totalBudget, milestoneAmt, recipient, gameLevel, sendTransaction, create]);

  // ── Success screen ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 460 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
              background: `${C.green}18`, border: `2px solid ${C.green}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
            }}>✓</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Campaign Launched!</h2>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
              <strong style={{ color: '#e8e1f8' }}>{name}</strong> is live on Solana devnet.
            </p>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.blue, marginBottom: 20, wordBreak: 'break-all' }}>
              Campaign PDA: {result.campaignPda.toBase58()}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Link href="/campaigns" style={{
                padding: '11px 24px', borderRadius: 11,
                background: `linear-gradient(135deg,${C.accent},${C.accentDk})`,
                color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13,
              }}>View Campaigns →</Link>
              <button onClick={reset} style={{
                padding: '11px 24px', borderRadius: 11, border: `1px solid ${C.border}`,
                background: C.card, color: C.muted, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>Create Another</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>

      {/* ── Page header ── */}
      <div style={{
        padding: '80px 32px 28px',
        borderBottom: `1px solid ${C.border}`,
        background: 'linear-gradient(180deg, #0a0820 0%, #08081a 100%)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/campaigns" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 14,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.02)',
          }}>← My Campaigns</Link>
          <h1 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 900, letterSpacing: '-.5px', margin: 0 }}>
            Create Campaign
          </h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            Deploy token distributions with game-based milestone verification.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 100px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28 }}>

        {/* ── Left: form ── */}
        <div>
          {/* Step bar */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, gap: 0 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: i <= step ? 'pointer' : 'default' }}
                  onClick={() => i <= step && setStep(i)}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, transition: 'all .2s',
                    background: step === i ? `linear-gradient(135deg,${C.accent},${C.accentDk})` : i < step ? C.green : 'rgba(255,255,255,.06)',
                    border: `1.5px solid ${step === i ? C.accent : i < step ? C.green : C.border}`,
                    boxShadow: step === i ? `0 0 12px ${C.accent}55` : 'none',
                    color: step === i || i < step ? '#fff' : C.muted,
                  }}>{i < step ? '✓' : s.icon}</div>
                  <span style={{
                    fontSize: 11.5, fontWeight: step === i ? 700 : 500, whiteSpace: 'nowrap',
                    color: step === i ? '#e8e1f8' : i < step ? C.green : C.muted,
                  }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 1, margin: '0 8px', background: i < step ? `${C.green}55` : C.border }} />
                )}
              </div>
            ))}
          </div>

          {/* Step content card */}
          <div style={{
            background: C.bg1, border: `1px solid ${C.border}`,
            borderRadius: 18, padding: '28px 26px', display: 'flex', flexDirection: 'column', gap: 22,
          }}>

            {/* ── Step 0: Campaign Details ── */}
            {step === 0 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Campaign Details</div>
                <div>
                  <Label>Campaign Name *</Label>
                  <Input value={name} onChange={setName} placeholder="e.g. Team Token Distribution Q3 2026" mono={false} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={description} onChange={setDescription}
                    placeholder="What is this campaign for?" />
                </div>
                <div>
                  <Label>Total Budget (USDC) *</Label>
                  <Input value={budget} onChange={setBudget} placeholder="500000" type="number" />
                </div>
                {totalBudget > 0 && (
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: `${C.accent}0a`, border: `1px solid ${C.accent}22`,
                    fontSize: 12, color: C.muted, fontFamily: C.mono,
                  }}>
                    <span style={{ color: C.gold, fontWeight: 700 }}>{totalBudget.toLocaleString()} USDC</span>
                    {' '} will be locked into the campaign escrow PDA.
                  </div>
                )}
              </>
            )}

            {/* ── Step 1: Milestone Config ── */}
            {step === 1 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Milestone Configuration</div>

                {/* Game Gate */}
                <div style={{
                  padding: '20px 20px', borderRadius: 14,
                  background: gameGate ? `linear-gradient(135deg, ${C.game}0a, ${C.gameDk}06)` : C.card,
                  border: `1.5px solid ${gameGate ? C.game + '55' : C.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: gameGate ? 20 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: gameGate ? `${C.game}18` : 'rgba(255,255,255,.04)',
                        border: `1px solid ${gameGate ? C.game + '44' : C.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                      }}>◈</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: gameGate ? C.game : '#e8e1f8' }}>
                          BlockBite Game Gate
                        </div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                          Recipients must complete a BlockBite level to unlock tokens
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setGameGate(v => !v)}
                      style={{
                        width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
                        background: gameGate ? `linear-gradient(90deg, ${C.game}, ${C.gameDk})` : 'rgba(255,255,255,.1)',
                        position: 'relative', transition: 'background .2s',
                      }}>
                      <div style={{
                        position: 'absolute', top: 3, left: gameGate ? 23 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.4)',
                      }} />
                    </button>
                  </div>

                  {gameGate && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ padding: '16px 18px', borderRadius: 12, background: `${C.game}0a`, border: `1px solid ${C.game}22` }}>
                        <Slider label="Required Level" value={gameLevel} onChange={setGameLevel}
                          min={1} max={50} color={C.game} />
                      </div>
                      <div style={{
                        padding: '14px 16px', borderRadius: 11,
                        background: 'rgba(255,255,255,.02)', border: `1px solid ${C.border}`,
                        fontSize: 12.5, color: C.muted, lineHeight: 1.7,
                      }}>
                        <div style={{ fontWeight: 700, color: '#e8e1f8', marginBottom: 6 }}>How it works</div>
                        <div>① Recipient receives the campaign invite</div>
                        <div>② They play BlockBite and reach <strong style={{ color: C.game }}>Level {gameLevel}</strong></div>
                        <div>③ Game completion is verified on-chain</div>
                        <div>④ Tokens are unlocked for claiming</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Milestone details */}
                <div>
                  <Label>Milestone Description *</Label>
                  <Textarea value={milestoneDesc} onChange={setMilestoneDesc}
                    placeholder="e.g. Complete Level 10 of BlockBite" />
                </div>
                <div>
                  <Label>Reward Amount (USDC) *</Label>
                  <Input value={milestoneAmount} onChange={setMilestoneAmount} placeholder="10000" type="number" />
                </div>
                <div>
                  <Label>Recipient Wallet *</Label>
                  <Input value={recipient} onChange={setRecipient} placeholder="Recipient Solana address" />
                </div>

                {milestoneAmt > 0 && totalBudget > 0 && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 9, fontSize: 12, fontFamily: C.mono,
                    background: milestoneAmt > totalBudget ? `${C.red}12` : `${C.green}12`,
                    border: `1px solid ${milestoneAmt > totalBudget ? C.red : C.green}44`,
                    color: milestoneAmt > totalBudget ? C.red : C.green,
                  }}>
                    Milestone reward: {milestoneAmt.toLocaleString()} / {totalBudget.toLocaleString()} USDC
                    {milestoneAmt > totalBudget ? ' ⚠ exceeds budget' : ' ✓ within budget'}
                  </div>
                )}
              </>
            )}

            {/* ── Step 2: Review & Launch ── */}
            {step === 2 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Review & Launch</div>

                {[
                  {
                    title: 'Campaign', color: C.accent,
                    rows: [
                      { l: 'Name', v: name || '—' },
                      { l: 'Budget', v: `${totalBudget.toLocaleString()} USDC` },
                    ],
                  },
                  {
                    title: 'Milestone', color: C.game,
                    rows: [
                      { l: 'Description', v: milestoneDesc || '—' },
                      { l: 'Reward', v: `${milestoneAmt.toLocaleString()} USDC` },
                      { l: 'Verification', v: gameGate ? `BlockBite Level ${gameLevel}` : 'None' },
                      { l: 'Recipient', v: recipient ? `${recipient.slice(0, 8)}…${recipient.slice(-6)}` : '—' },
                    ],
                  },
                ].map(section => (
                  <div key={section.title} style={{
                    padding: '14px 16px', borderRadius: 12,
                    background: `${section.color}07`, border: `1px solid ${section.color}22`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
                      color: section.color, marginBottom: 10 }}>{section.title}</div>
                    {section.rows.map((r, i, a) => (
                      <div key={r.l} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '5px 0', borderBottom: i < a.length - 1 ? `1px solid ${C.border}` : 'none',
                      }}>
                        <span style={{ fontSize: 12, color: C.muted }}>{r.l}</span>
                        <span style={{
                          fontFamily: C.mono, fontSize: 12, color: '#e8e1f8',
                          fontWeight: r.l === 'Verification' && gameGate ? 700 : 400,
                          ...(r.l === 'Verification' && gameGate ? { color: C.game } : {}),
                        }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                ))}

                <div style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: `${C.gold}0a`, border: `1px solid ${C.gold}33`,
                  fontSize: 12, color: C.gold,
                }}>
                  ⚠ Launching calls <code style={{ fontFamily: C.mono }}>create_campaign</code> + <code style={{ fontFamily: C.mono }}>create_milestone</code> on Solana devnet.
                </div>

                {error && (
                  <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: `${C.red}0a`, border: `1px solid ${C.red}33`,
                    fontSize: 12, color: C.red,
                  }}>
                    Error: {error}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Nav buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button onClick={() => step > 0 && setStep(s => s - 1)}
              disabled={step === 0}
              style={{
                padding: '11px 22px', borderRadius: 11,
                border: `1px solid ${C.border}`, background: C.card,
                color: step === 0 ? C.border : C.muted,
                fontWeight: 600, fontSize: 13, cursor: step === 0 ? 'not-allowed' : 'pointer',
                fontFamily: C.serif,
              }}>← Back</button>

            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} style={{
                padding: '11px 28px', borderRadius: 11, border: 'none',
                background: `linear-gradient(135deg,${C.accent},${C.accentDk})`,
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                boxShadow: `0 0 18px ${C.accent}44`, fontFamily: C.serif,
              }}>Continue →</button>
            ) : (
              <button onClick={handleLaunch}
                disabled={status === 'creating' || !connected}
                style={{
                  padding: '11px 32px', borderRadius: 11, border: 'none',
                  background: status === 'creating' ? C.muted : `linear-gradient(135deg,${C.gold}cc,#a36a17)`,
                  color: status === 'creating' ? '#fff' : '#0b0a14', fontWeight: 900, fontSize: 14,
                  cursor: status === 'creating' || !connected ? 'not-allowed' : 'pointer',
                  boxShadow: `0 0 20px ${C.gold}44`, fontFamily: C.serif, letterSpacing: '.02em',
                }}>
                {status === 'creating' ? 'Deploying…' : '▲ Launch Campaign'}
              </button>
            )}
          </div>
        </div>

        {/* ── Right: sticky summary card ── */}
        <div style={{ position: 'sticky', top: 88, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Campaign summary */}
          <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase',
              color: C.muted, marginBottom: 14 }}>Campaign Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { l: 'Name', v: name || '—', c: '#e8e1f8' },
                { l: 'Budget', v: `${totalBudget.toLocaleString()} USDC`, c: C.green },
                { l: 'Milestone', v: `${milestoneAmt.toLocaleString()} USDC`, c: C.game },
                { l: 'Game Gate', v: gameGate ? `Level ${gameLevel}` : 'OFF', c: gameGate ? C.game : C.muted },
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: C.muted }}>{r.l}</span>
                  <span style={{ fontFamily: C.mono, color: r.c, fontWeight: 600 }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Wallet status */}
          {!connected && (
            <div style={{
              background: C.bg1, border: `1px solid ${C.gold}44`,
              borderRadius: 16, padding: '16px 18px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: C.gold, marginBottom: 10 }}>Wallet not connected</div>
              <button onClick={() => setVisible(true)} style={{
                padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg,${C.accent},${C.accentDk})`,
                color: '#fff', fontWeight: 700, fontSize: 13,
              }}>Connect Wallet</button>
            </div>
          )}
          {connected && (
            <div style={{
              background: `${C.green}0a`, border: `1px solid ${C.green}44`,
              borderRadius: 16, padding: '12px 18px',
              fontSize: 11, fontFamily: C.mono, color: C.green,
            }}>
              ✓ {publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}
            </div>
          )}

          {/* Protocol info */}
          <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase',
              color: C.muted, marginBottom: 12 }}>Protocol · Devnet</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11.5, color: C.muted }}>
              <div>✓ Campaign escrow PDA vault</div>
              <div>✓ Game-verified milestone unlock</div>
              <div>✓ On-chain token claim</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

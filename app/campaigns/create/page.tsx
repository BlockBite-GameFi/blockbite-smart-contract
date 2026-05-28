'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

// ─── Design tokens — BlockBite palette ───────────────────────────────────────
const C = {
  accent:   '#a78bfa',
  accentDk: '#5e35d4',
  gold:     '#f5c66a',
  green:    '#5fd07a',
  blue:     '#7ad7ff',
  ember:    '#ff7a3a',
  red:      '#ff3b6b',
  game:     '#4ade80',    // BlockBite game gate — distinct green
  gameDk:   '#16a34a',
  muted:    'var(--p-muted)',
  border:   'var(--p-border)',
  bg0:      'var(--p-bg0)',
  bg1:      'var(--p-bg1)',
  bg2:      'var(--p-bg2)',
  card:     'rgba(255,255,255,.03)',
  mono:     "'JetBrains Mono', monospace",
  serif:    "'Space Grotesk', system-ui, sans-serif",
};

// ─── Tiny re-usable atoms ─────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em',
      textTransform: 'uppercase', color: C.muted, marginBottom: 7 }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', mono = true }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} type={type}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: '100%', padding: '11px 14px', boxSizing: 'border-box',
        background: C.bg2, border: `1px solid ${focus ? C.accent : C.border}`,
        borderRadius: 10, color: '#e8e1f8', fontSize: 13, outline: 'none',
        fontFamily: mono ? C.mono : C.serif, transition: 'border-color .15s',
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={{
        width: '100%', padding: '11px 14px', boxSizing: 'border-box', resize: 'vertical',
        background: C.bg2, border: `1px solid ${focus ? C.accent : C.border}`,
        borderRadius: 10, color: '#e8e1f8', fontSize: 13, outline: 'none',
        fontFamily: C.serif, lineHeight: 1.6, transition: 'border-color .15s',
      }}
    />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '11px 14px', boxSizing: 'border-box',
      background: C.bg2, border: `1px solid ${C.border}`,
      borderRadius: 10, color: '#e8e1f8', fontSize: 13, outline: 'none',
      fontFamily: C.mono, cursor: 'pointer', appearance: 'none',
    }}>
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, unit = '', color = C.accent, note }: {
  label: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step?: number; unit?: string;
  color?: string; note?: string;
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
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'relative', zIndex: 2, width: '100%',
            appearance: 'none', background: 'transparent',
            height: 20, cursor: 'pointer', accentColor: color,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.muted }}>
        <span>{min}{unit}</span>
        {note && <span style={{ color }}>{note}</span>}
        <span>{max}{unit}</span>
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
      <button
        type="button" onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value
            ? `linear-gradient(90deg, ${C.accent}, ${C.accentDk})`
            : 'rgba(255,255,255,.1)',
          position: 'relative', transition: 'background .2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left .2s',
          boxShadow: '0 1px 4px rgba(0,0,0,.4)',
        }} />
      </button>
    </div>
  );
}

// ─── Stream-type cards ────────────────────────────────────────────────────────
const STREAM_TYPES = [
  {
    id: 'linear', label: 'Linear', icon: '∿',
    color: C.accent,
    desc: 'Tokens release continuously from cliff to end date. Smooth, proportional unlock.',
  },
  {
    id: 'cliff', label: 'Cliff', icon: '⌐',
    color: C.gold,
    desc: 'All tokens locked until cliff date, then released at once. Simple & predictable.',
  },
  {
    id: 'milestone', label: 'Milestone', icon: '◎',
    color: C.blue,
    desc: 'Token batches unlock when specific achievements are verified on-chain.',
  },
  {
    id: 'hybrid', label: 'Hybrid', icon: '◆',
    color: '#c084fc',
    desc: 'Cliff + milestone + linear combined. Most flexible distribution model.',
  },
] as const;

type StreamType = (typeof STREAM_TYPES)[number]['id'];

// ─── Gate types ───────────────────────────────────────────────────────────────
const GATE_OPTIONS = [
  { id: 'manual',   label: 'Manual',   icon: '◈', desc: 'Creator approves each recipient manually.' },
  { id: 'oracle',   label: 'Oracle',   icon: '◎', desc: 'On-chain oracle verifies conditions automatically.' },
  { id: 'multisig', label: 'Multi-sig', icon: '⌐', desc: 'Requires M-of-N wallet signatures to unlock.' },
] as const;
type GateType = (typeof GATE_OPTIONS)[number]['id'];

// ─── Recipient row ────────────────────────────────────────────────────────────
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CreateCampaignPage() {
  const [step, setStep] = useState(0);
  const [launched, setLaunched] = useState(false);

  // ── Campaign Details ──
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [token,       setToken]       = useState('BBT');
  const [budget,      setBudget]      = useState('');

  // ── Vesting schedule ──
  const [streamType, setStreamType] = useState<StreamType>('linear');
  const [cliffDays,  setCliffDays]  = useState(90);
  const [vestDays,   setVestDays]   = useState(365);
  const [startDate,  setStartDate]  = useState('');
  const [cancelable, setCancelable] = useState(true);

  // ── Unlock gates ──
  const [gateType, setGateType]     = useState<GateType>('manual');
  const [gameGate, setGameGate]     = useState(false);
  const [gameLevel, setGameLevel]   = useState(10);

  // ── Milestone gates ──
  const [milestones, setMilestones] = useState([
    { label: '', pct: 25 }, { label: '', pct: 25 },
    { label: '', pct: 25 }, { label: '', pct: 25 },
  ]);
  const [milestoneCount, setMilestoneCount] = useState(0);

  // ── Recipients ──
  const [recipients, setRecipients] = useState<Recipient[]>([{ wallet: '', amount: '' }]);

  const addRecipient = () => setRecipients(r => [...r, { wallet: '', amount: '' }]);
  const removeRecipient = (i: number) => setRecipients(r => r.filter((_, idx) => idx !== i));
  const updateRecipient = useCallback((i: number, field: 'wallet' | 'amount', v: string) => {
    setRecipients(r => r.map((row, idx) => idx === i ? { ...row, [field]: v } : row));
  }, []);

  const totalBudget   = Number(budget) || 0;
  const allocatedSum  = recipients.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const dailyRate     = vestDays > 0 ? (totalBudget / vestDays).toFixed(1) : '0';
  const msTotal       = milestones.slice(0, milestoneCount).reduce((s, m) => s + m.pct, 0);

  const STEPS = [
    { label: 'Campaign',   icon: '◈' },
    { label: 'Schedule',   icon: '∿' },
    { label: 'Gates',      icon: '⌐' },
    { label: 'Recipients', icon: '◆' },
    { label: 'Review',     icon: '▲' },
  ];

  const selType = STREAM_TYPES.find(t => t.id === streamType)!;

  // ── Success screen ────────────────────────────────────────────────────────
  if (launched) {
    return (
      <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
        <Navbar />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 460 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
              background: `${C.green}18`, border: `2px solid ${C.green}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
            }}>🎉</div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Campaign Launched!</h2>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
              <strong style={{ color: '#e8e1f8' }}>{name || 'Your campaign'}</strong> is live on Solana devnet.
              Tokens locked into PDA vault — recipients can start claiming based on your conditions.
            </p>
            {gameGate && (
              <div style={{
                padding: '14px 18px', background: `${C.game}0d`, border: `1px solid ${C.game}33`,
                borderRadius: 12, marginBottom: 20, fontSize: 13, color: C.game,
              }}>
                ◈ BlockBite Game Gate active — recipients must reach <strong>Level {gameLevel}</strong> to unlock
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Link href="/campaigns" style={{
                padding: '11px 24px', borderRadius: 11,
                background: `linear-gradient(135deg,${C.accent},${C.accentDk})`,
                color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 13,
              }}>View Campaigns →</Link>
              <button onClick={() => { setLaunched(false); setStep(0); }} style={{
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
      <Navbar />

      {/* ── Page header ── */}
      <div style={{
        padding: '80px 32px 28px',
        borderBottom: `1px solid ${C.border}`,
        background: 'linear-gradient(180deg, #0a0820 0%, #08081a 100%)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/streams" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 14,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.02)',
          }}>← Streams Dashboard</Link>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 2, color: C.accent, fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>
                TDP Protocol · B2B Creator Campaigns
              </div>
              <h1 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 900, letterSpacing: '-.5px', margin: 0 }}>
                Create Campaign
              </h1>
              <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                Deploy token distributions with vesting, milestones, and game-based unlock conditions.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 100px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28 }}>

        {/* ── Left: form ── */}
        <div>

          {/* Step bar */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, gap: 0 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: i <= step ? 'pointer' : 'default' }}
                  onClick={() => i <= step && setStep(i)}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, transition: 'all .2s',
                    background: step === i
                      ? `linear-gradient(135deg,${C.accent},${C.accentDk})`
                      : i < step ? C.green : 'rgba(255,255,255,.06)',
                    border: `1.5px solid ${step === i ? C.accent : i < step ? C.green : C.border}`,
                    boxShadow: step === i ? `0 0 12px ${C.accent}55` : 'none',
                    color: step === i || i < step ? '#fff' : C.muted,
                  }}>
                    {i < step ? '✓' : s.icon}
                  </div>
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
                    placeholder="What is this campaign for? Who are the recipients? What conditions apply?" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <Label>Token *</Label>
                    <Select value={token} onChange={setToken} options={[
                      { v: 'BBT',  l: 'BBT — BlockBite Token' },
                      { v: 'USDC', l: 'USDC' },
                      { v: 'SOL',  l: 'SOL (wrapped)' },
                    ]} />
                  </div>
                  <div>
                    <Label>Total Budget *</Label>
                    <Input value={budget} onChange={setBudget} placeholder="500000" type="number" />
                  </div>
                </div>
                {totalBudget > 0 && (
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: `${C.accent}0a`, border: `1px solid ${C.accent}22`,
                    fontSize: 12, color: C.muted, fontFamily: C.mono,
                  }}>
                    <span style={{ color: C.gold, fontWeight: 700 }}>{totalBudget.toLocaleString()} {token}</span>
                    {' '} will be locked into a PDA vault · {recipients.length} recipient{recipients.length !== 1 ? 's' : ''} configured
                  </div>
                )}
              </>
            )}

            {/* ── Step 1: Vesting Schedule ── */}
            {step === 1 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Vesting Schedule</div>

                {/* Stream type cards */}
                <div>
                  <Label>Stream Type *</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {STREAM_TYPES.map(t => (
                      <button key={t.id} type="button" onClick={() => setStreamType(t.id)}
                        style={{
                          padding: '14px 16px', borderRadius: 13, cursor: 'pointer', textAlign: 'left',
                          background: streamType === t.id ? `${t.color}12` : C.bg2,
                          border: `1.5px solid ${streamType === t.id ? t.color : C.border}`,
                          transition: 'all .15s',
                          boxShadow: streamType === t.id ? `0 0 16px ${t.color}22` : 'none',
                        }}
                      >
                        <div style={{ fontSize: 22, marginBottom: 7 }}>{t.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: streamType === t.id ? t.color : '#e8e1f8', marginBottom: 4 }}>
                          {t.label}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Start Date</Label>
                  <Input value={startDate} onChange={setStartDate} placeholder="" type="date" mono />
                </div>

                <Slider
                  label="Cliff Period" value={cliffDays} onChange={setCliffDays}
                  min={0} max={730} unit=" days" color={C.ember}
                  note={cliffDays === 0 ? 'No cliff' : `Cliff: Day ${cliffDays}`}
                />
                <Slider
                  label="Vesting Duration" value={vestDays} onChange={setVestDays}
                  min={30} max={1460} unit=" days" color={C.accent}
                  note={`Completes: Day ${cliffDays + vestDays}`}
                />

                <Toggle value={cancelable} onChange={setCancelable}
                  label="Allow Cancellation"
                  sub="Creator can cancel and reclaim unvested tokens after a 7-day grace period" />

                {totalBudget > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { l: 'Cliff unlock',   v: `Day ${cliffDays}`, c: C.ember },
                      { l: 'Fully vested',   v: `Day ${cliffDays + vestDays}`, c: C.accent },
                      { l: 'Daily rate',     v: `${dailyRate} ${token}/day`, c: C.green },
                      { l: 'Rate / second',  v: `${(totalBudget / (vestDays * 86400)).toFixed(5)} T/s`, c: C.blue },
                    ].map(r => (
                      <div key={r.l} style={{
                        padding: '10px 12px', borderRadius: 9,
                        background: `${r.c}08`, border: `1px solid ${r.c}22`,
                      }}>
                        <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{r.l}</div>
                        <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: r.c }}>{r.v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Step 2: Unlock Gates ── */}
            {step === 2 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Unlock Requirements</div>
                <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                  Define the conditions a recipient must meet before tokens unlock. You can combine
                  a standard gate with the BlockBite Game Gate for gamified distribution.
                </p>

                {/* Standard gate selector */}
                <div>
                  <Label>Verification Method</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {GATE_OPTIONS.map(g => (
                      <button key={g.id} type="button" onClick={() => setGateType(g.id)}
                        style={{
                          padding: '13px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                          background: gateType === g.id ? `${C.accent}10` : C.bg2,
                          border: `1.5px solid ${gateType === g.id ? C.accent : C.border}`,
                          transition: 'all .15s',
                        }}
                      >
                        <div style={{ fontSize: 22, marginBottom: 6 }}>{g.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: gateType === g.id ? C.accent : '#e8e1f8', marginBottom: 3 }}>{g.label}</div>
                        <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5 }}>{g.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ height: 1, background: C.border }} />

                {/* ─ BlockBite Game Gate — unique feature ─ */}
                <div style={{
                  padding: '20px 20px',
                  borderRadius: 14,
                  background: gameGate
                    ? `linear-gradient(135deg, ${C.game}0a, ${C.gameDk}06)`
                    : `${C.card}`,
                  border: `1.5px solid ${gameGate ? C.game + '55' : C.border}`,
                  transition: 'all .2s',
                  boxShadow: gameGate ? `0 0 24px ${C.game}12` : 'none',
                }}>
                  {/* Header */}
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
                    <button
                      type="button" onClick={() => setGameGate(v => !v)}
                      style={{
                        width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
                        background: gameGate
                          ? `linear-gradient(90deg, ${C.game}, ${C.gameDk})`
                          : 'rgba(255,255,255,.1)',
                        position: 'relative', transition: 'background .2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, left: gameGate ? 23 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.4)',
                      }} />
                    </button>
                  </div>

                  {/* Expanded content when enabled */}
                  {gameGate && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* Level slider */}
                      <div style={{
                        padding: '16px 18px', borderRadius: 12,
                        background: `${C.game}0a`, border: `1px solid ${C.game}22`,
                      }}>
                        <Slider
                          label="Required Level"
                          value={gameLevel}
                          onChange={setGameLevel}
                          min={1} max={50} unit=""
                          color={C.game}
                          note={`Level ${gameLevel} of 50`}
                        />

                        {/* Level difficulty badge */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                          {[
                            { max: 10, label: 'Beginner', color: C.green },
                            { max: 25, label: 'Intermediate', color: C.gold },
                            { max: 40, label: 'Advanced', color: C.ember },
                            { max: 50, label: 'Expert', color: C.red },
                          ].map(tier => {
                            const active = gameLevel <= tier.max &&
                              gameLevel > ([0, 10, 25, 40].find((_, i, a) => a[i + 1] === tier.max) ?? 0);
                            return (
                              <div key={tier.label} style={{
                                padding: '3px 10px', borderRadius: 99, fontSize: 10.5, fontWeight: 700,
                                background: active ? `${tier.color}18` : 'rgba(255,255,255,.04)',
                                border: `1px solid ${active ? tier.color + '55' : C.border}`,
                                color: active ? tier.color : C.muted,
                                transition: 'all .15s',
                              }}>{tier.label} (1–{tier.max})</div>
                            );
                          })}
                        </div>
                      </div>

                      {/* How it works */}
                      <div style={{
                        padding: '14px 16px', borderRadius: 11,
                        background: 'rgba(255,255,255,.02)', border: `1px solid ${C.border}`,
                        fontSize: 12.5, color: C.muted, lineHeight: 1.7,
                      }}>
                        <div style={{ fontWeight: 700, color: '#e8e1f8', marginBottom: 6 }}>How it works</div>
                        <div>① Recipient receives the campaign invite with their wallet address</div>
                        <div>② They play BlockBite and reach <strong style={{ color: C.game }}>Level {gameLevel}</strong></div>
                        <div>③ Game completion is verified on-chain via the BlockBite program</div>
                        <div>④ <code style={{ fontFamily: C.mono, color: C.blue }}>verify_game_gate()</code> unlocks the cliff/stream</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Milestone gates (if milestone stream type) */}
                {(streamType === 'milestone' || streamType === 'hybrid') && (
                  <>
                    <div style={{ height: 1, background: C.border }} />
                    <div>
                      <Label>Milestone Gates</Label>
                      <Slider
                        label="Number of Milestones"
                        value={milestoneCount} onChange={setMilestoneCount}
                        min={0} max={4} color={C.blue}
                      />
                    </div>
                    {milestoneCount > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {milestones.slice(0, milestoneCount).map((m, i) => (
                          <div key={i} style={{
                            padding: '14px 16px', borderRadius: 11,
                            background: C.bg2, border: `1px solid ${C.blue}33`,
                            display: 'flex', flexDirection: 'column', gap: 10,
                          }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.blue }}>
                              Milestone {i + 1}
                            </div>
                            <Input
                              value={m.label}
                              onChange={v => setMilestones(ms => ms.map((x, idx) => idx === i ? { ...x, label: v } : x))}
                              placeholder={`e.g. Token Launch, 10k Users, Revenue $1M`}
                              mono={false}
                            />
                            <Slider
                              label={`Allocation`} value={m.pct} color={C.blue}
                              onChange={v => setMilestones(ms => ms.map((x, idx) => idx === i ? { ...x, pct: v } : x))}
                              min={0} max={100} unit="%"
                            />
                          </div>
                        ))}
                        <div style={{
                          padding: '8px 12px', borderRadius: 9, fontSize: 12, fontFamily: C.mono,
                          background: msTotal > 100 ? `${C.red}12` : msTotal === 100 ? `${C.green}12` : `${C.gold}12`,
                          border: `1px solid ${msTotal > 100 ? C.red : msTotal === 100 ? C.green : C.gold}44`,
                          color: msTotal > 100 ? C.red : msTotal === 100 ? C.green : C.gold,
                        }}>
                          Milestone total: {msTotal}%
                          {msTotal > 100 ? ' ⚠ exceeds 100%' : msTotal === 100 ? ' ✓ perfect' : ` (${100 - msTotal}% linear remainder)`}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Step 3: Recipients ── */}
            {step === 3 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Recipients</div>
                <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                  Add individual wallet addresses and token amounts. Each recipient gets their own on-chain PDA stream.
                </p>

                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 36px', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>Wallet Address</div>
                    <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>Amount ({token})</div>
                    <div />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recipients.map((r, i) => (
                      <RecipientRow
                        key={i} r={r} i={i}
                        onChange={(f, v) => updateRecipient(i, f, v)}
                        onRemove={() => removeRecipient(i)}
                      />
                    ))}
                  </div>
                </div>

                <button onClick={addRecipient} style={{
                  padding: '10px 16px', borderRadius: 10,
                  border: `1px dashed ${C.accent}55`, background: `${C.accent}06`,
                  color: C.accent, fontSize: 13, cursor: 'pointer', fontFamily: C.serif, fontWeight: 600,
                }}>+ Add Recipient</button>

                {/* Allocation bar */}
                {totalBudget > 0 && (
                  <div style={{ padding: '14px 16px', borderRadius: 12, background: C.bg2, border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                      <span style={{ color: C.muted }}>Allocated</span>
                      <span style={{ fontFamily: C.mono, color: allocatedSum > totalBudget ? C.red : C.green, fontWeight: 700 }}>
                        {allocatedSum.toLocaleString()} / {totalBudget.toLocaleString()} {token}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99, transition: 'width .3s',
                        width: `${Math.min(100, (allocatedSum / totalBudget) * 100)}%`,
                        background: allocatedSum > totalBudget
                          ? C.red
                          : allocatedSum === totalBudget
                          ? C.green
                          : `linear-gradient(90deg, ${C.accent}, ${C.blue})`,
                      }} />
                    </div>
                    {allocatedSum !== totalBudget && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                        {allocatedSum > totalBudget
                          ? `⚠ Over by ${(allocatedSum - totalBudget).toLocaleString()} ${token}`
                          : `${(totalBudget - allocatedSum).toLocaleString()} ${token} unallocated`}
                      </div>
                    )}
                  </div>
                )}

                {/* CSV option */}
                <div style={{
                  padding: '14px 16px', borderRadius: 11,
                  background: 'rgba(255,255,255,.02)', border: `1px dashed ${C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#e8e1f8' }}>Bulk Upload via CSV</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                      Upload a CSV file with wallet,amount columns for large campaigns
                    </div>
                  </div>
                  <button style={{
                    padding: '7px 14px', borderRadius: 8,
                    border: `1px solid ${C.border}`, background: C.bg2,
                    color: C.muted, fontSize: 12, cursor: 'pointer',
                  }}>Upload CSV</button>
                </div>
              </>
            )}

            {/* ── Step 4: Review & Launch ── */}
            {step === 4 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Review & Launch</div>

                {/* Summary sections */}
                {[
                  {
                    title: 'Campaign', color: C.accent,
                    rows: [
                      { l: 'Name',     v: name || '—' },
                      { l: 'Token',    v: token },
                      { l: 'Budget',   v: `${totalBudget.toLocaleString()} ${token}` },
                    ],
                  },
                  {
                    title: 'Vesting', color: C.gold,
                    rows: [
                      { l: 'Type',           v: selType.label },
                      { l: 'Cliff',          v: `${cliffDays} days` },
                      { l: 'Duration',       v: `${vestDays} days` },
                      { l: 'Cancelable',     v: cancelable ? 'Yes' : 'No' },
                      { l: 'Daily rate',     v: `${dailyRate} ${token}/day` },
                    ],
                  },
                  {
                    title: 'Gates', color: C.blue,
                    rows: [
                      { l: 'Verification',   v: GATE_OPTIONS.find(g => g.id === gateType)!.label },
                      { l: 'BlockBite Gate', v: gameGate ? `Enabled — Level ${gameLevel}` : 'Disabled' },
                      ...(milestoneCount > 0
                        ? [{ l: 'Milestones', v: `${milestoneCount} gates (${msTotal}% gated)` }]
                        : []),
                    ],
                  },
                  {
                    title: 'Recipients', color: C.green,
                    rows: [
                      { l: 'Count',      v: `${recipients.filter(r => r.wallet).length} wallets` },
                      { l: 'Allocated',  v: `${allocatedSum.toLocaleString()} ${token}` },
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
                          fontWeight: r.l === 'BlockBite Gate' && gameGate ? 700 : 400,
                          ...(r.l === 'BlockBite Gate' && gameGate ? { color: C.game } : {}),
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
                  ⚠ Launching calls <code style={{ fontFamily: C.mono }}>create_stream()</code> on Solana devnet
                  and permanently locks tokens into PDA vaults. Connect your wallet before proceeding.
                </div>
              </>
            )}
          </div>

          {/* Nav buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              onClick={() => step > 0 && setStep(s => s - 1)}
              disabled={step === 0}
              style={{
                padding: '11px 22px', borderRadius: 11,
                border: `1px solid ${C.border}`, background: C.card,
                color: step === 0 ? C.border : C.muted,
                fontWeight: 600, fontSize: 13, cursor: step === 0 ? 'not-allowed' : 'pointer',
                fontFamily: C.serif,
              }}
            >← Back</button>

            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} style={{
                padding: '11px 28px', borderRadius: 11, border: 'none',
                background: `linear-gradient(135deg,${C.accent},${C.accentDk})`,
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                boxShadow: `0 0 18px ${C.accent}44`, fontFamily: C.serif,
              }}>Continue →</button>
            ) : (
              <button onClick={() => setLaunched(true)} style={{
                padding: '11px 32px', borderRadius: 11, border: 'none',
                background: `linear-gradient(135deg,${C.gold}cc,#a36a17)`,
                color: '#0b0a14', fontWeight: 900, fontSize: 14, cursor: 'pointer',
                boxShadow: `0 0 20px ${C.gold}44`, fontFamily: C.serif,
                letterSpacing: '.02em',
              }}>▲ Launch Campaign</button>
            )}
          </div>
        </div>

        {/* ── Right: sticky summary card ── */}
        <div style={{ position: 'sticky', top: 88, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Campaign summary */}
          <div style={{
            background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 18px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase',
              color: C.muted, marginBottom: 14 }}>Campaign Summary</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { l: 'Name',      v: name || '—',                          c: '#e8e1f8' },
                { l: 'Token',     v: token,                                c: C.gold    },
                { l: 'Budget',    v: `${totalBudget.toLocaleString()} ${token}`, c: C.green },
                { l: 'Type',      v: `${selType.icon} ${selType.label}`,   c: selType.color },
                { l: 'Cliff',     v: `${cliffDays}d`,                      c: C.ember   },
                { l: 'Vest',      v: `${vestDays}d`,                       c: C.accent  },
                { l: 'Recipients',v: `${recipients.length}`,               c: C.blue    },
              ].map(r => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: C.muted }}>{r.l}</span>
                  <span style={{ fontFamily: C.mono, color: r.c, fontWeight: 600 }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* BlockBite Game Gate status */}
          <div style={{
            background: gameGate ? `${C.game}0a` : C.bg1,
            border: `1px solid ${gameGate ? C.game + '44' : C.border}`,
            borderRadius: 16, padding: '16px 18px',
            transition: 'all .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: gameGate ? 12 : 0 }}>
              <span style={{ fontSize: 18 }}>◈</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: gameGate ? C.game : C.muted }}>
                BlockBite Game Gate
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <div style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: 9.5, fontWeight: 800,
                  background: gameGate ? `${C.game}18` : 'rgba(255,255,255,.05)',
                  color: gameGate ? C.game : C.muted,
                  border: `1px solid ${gameGate ? C.game + '33' : C.border}`,
                  letterSpacing: '.05em', textTransform: 'uppercase',
                }}>
                  {gameGate ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>
            {gameGate && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Recipients must reach{' '}
                <strong style={{ color: C.game, fontFamily: C.mono }}>Level {gameLevel}</strong>
                {' '}in BlockBite to unlock their allocation.
              </div>
            )}
          </div>

          {/* Protocol info */}
          <div style={{
            background: C.bg1, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase',
              color: C.muted, marginBottom: 12 }}>Protocol · TDP Devnet</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11.5, color: C.muted }}>
              <div>✓ Smart contract enforced vesting</div>
              <div>✓ PDA vault — tokens leave only via program</div>
              <div>✓ On-chain milestone verification</div>
              {gameGate && <div style={{ color: C.game }}>✓ BlockBite game level verification</div>}
              <div>✓ Anchor IDL-typed instructions</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

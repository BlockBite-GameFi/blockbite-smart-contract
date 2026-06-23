'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

// ─── Design tokens — ALL values are CSS custom-property references so that
//     dark/light theme toggle propagates instantly to every inline style.
//     Alpha variants use color-mix() instead of hex suffixes (e.g. ${C.accent}18).
export const C = {
  accent:   'var(--p-accent)',
  accentDk: 'var(--p-accent-dk)',
  gold:     'var(--p-gold)',
  green:    'var(--p-green)',
  blue:     'var(--p-blue)',
  ember:    'var(--p-ember)',
  red:      'var(--p-red)',
  game:     'var(--p-game)',
  gameDk:   'var(--p-game-dk)',
  muted:    'var(--p-muted)',
  border:   'var(--p-border)',
  bg0:      'var(--p-bg0)',
  bg1:      'var(--p-bg1)',
  bg2:      'var(--p-bg2)',
  mono:     "'JetBrains Mono', monospace",
  serif:    "'Space Grotesk', system-ui, sans-serif",
};

// ─── Atoms ───────────────────────────────────────────────────────────────────
export function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em',
      textTransform: 'uppercase', color: C.muted, marginBottom: 7 }}>
      {children}{required && <span style={{ color: C.red }}> *</span>}
    </div>
  );
}

export function SInput({ value, onChange, placeholder, type = 'text', mono = true, prefix }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean; prefix?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      {prefix && (
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, color: C.muted, pointerEvents: 'none', fontFamily: C.mono }}>
          {prefix}
        </span>
      )}
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} type={type}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', padding: prefix ? '11px 14px 11px 32px' : '11px 14px',
          boxSizing: 'border-box',
          background: C.bg2, border: `1px solid ${focus ? C.accent : C.border}`,
          borderRadius: 10, color: 'var(--p-text)', fontSize: 13, outline: 'none',
          fontFamily: mono ? C.mono : C.serif, transition: 'border-color .15s',
        }}
      />
    </div>
  );
}

export function SSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[]; placeholder?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '11px 14px', boxSizing: 'border-box',
      background: C.bg2, border: `1px solid ${C.border}`,
      borderRadius: 10, color: value ? 'var(--p-text)' : C.muted,
      fontSize: 13, outline: 'none', fontFamily: C.mono,
      cursor: 'pointer', appearance: 'none',
    }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

export function STextarea({ value, onChange, placeholder, rows = 2 }: {
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
        borderRadius: 10, color: 'var(--p-text)', fontSize: 13, outline: 'none',
        fontFamily: C.serif, lineHeight: 1.6, transition: 'border-color .15s',
      }}
    />
  );
}

export function SSlider({ label, value, onChange, min, max, step = 1, unit = '', color = C.accent, note }: {
  label: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step?: number; unit?: string; color?: string; note?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--p-text)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 800, color }}>
          {value.toLocaleString()}{unit}
        </span>
      </div>
      <div style={{ position: 'relative', height: 20 }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4,
          background: 'rgba(255,255,255,.08)', borderRadius: 99, transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, width: `${pct}%`, height: 4,
          background: color, borderRadius: 99, transform: 'translateY(-50%)',
          boxShadow: `0 0 8px color-mix(in srgb, ${color} 40%, transparent)` }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'relative', zIndex: 2, width: '100%', appearance: 'none',
            background: 'transparent', height: '100%', cursor: 'pointer', accentColor: color }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.muted }}>
        <span>{min}{unit}</span>
        {note && <span style={{ color }}>{note}</span>}
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

export function SToggle({ value, onChange, label, sub }: {
  value: boolean; onChange: (v: boolean) => void; label: string; sub?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      <button type="button" onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: value ? `linear-gradient(90deg,${C.accent},${C.accentDk})` : 'rgba(255,255,255,.1)',
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

// ─── Section card wrapper ─────────────────────────────────────────────────────
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: '22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--p-text)', fontFamily: C.serif }}>{title}</div>
      {children}
    </div>
  );
}

// ─── Manual / CSV toggle row ──────────────────────────────────────────────────
export function ManualCsvToggle({ mode, onChange }: { mode: 'manual' | 'csv'; onChange: (m: 'manual' | 'csv') => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 10, overflow: 'hidden',
      border: `1px solid ${C.border}` }}>
      {(['manual', 'csv'] as const).map(m => (
        <button key={m} type="button" onClick={() => onChange(m)} style={{
          padding: '10px 0', border: 'none', cursor: 'pointer', fontFamily: C.serif,
          fontSize: 13, fontWeight: 700, letterSpacing: '.02em',
          background: mode === m ? C.accent : C.bg2,
          color: mode === m ? '#fff' : C.muted,
          transition: 'all .15s',
        }}>
          {m === 'manual' ? 'Manual' : 'Use CSV'}
        </button>
      ))}
    </div>
  );
}

// ─── BlockBite Game Gate card ─────────────────────────────────────────────────
export function GameGateCard({ enabled, onChange, level, onLevelChange }: {
  enabled: boolean; onChange: (v: boolean) => void;
  level: number; onLevelChange: (n: number) => void;
}) {
  const tiers = [
    { label: 'Beginner',     min: 1,  max: 10, color: C.green },
    { label: 'Intermediate', min: 11, max: 25, color: C.gold  },
    { label: 'Advanced',     min: 26, max: 40, color: C.ember },
    { label: 'Expert',       min: 41, max: 50, color: C.red   },
  ];
  const activeTier = tiers.find(t => level >= t.min && level <= t.max)!;

  return (
    <div style={{
      borderRadius: 14, padding: '18px 20px',
      background: enabled ? 'color-mix(in srgb, var(--p-game) 4%, transparent)' : 'rgba(255,255,255,.02)',
      border: `1.5px solid ${enabled ? 'color-mix(in srgb, var(--p-game) 33%, transparent)' : C.border}`,
      transition: 'all .2s',
      boxShadow: enabled ? '0 0 20px color-mix(in srgb, var(--p-game) 6%, transparent)' : 'none',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: enabled ? 18 : 0 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 9, flexShrink: 0,
          background: enabled ? 'color-mix(in srgb, var(--p-game) 9%, transparent)' : 'rgba(255,255,255,.04)',
          border: `1px solid ${enabled ? 'color-mix(in srgb, var(--p-game) 27%, transparent)' : C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>◈</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: enabled ? C.game : 'var(--p-text)' }}>
            BlockBite Game Gate
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
            Recipient must complete BlockBite levels to unlock
          </div>
        </div>
        {/* Toggle */}
        <button type="button" onClick={() => onChange(!enabled)} style={{
          width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: enabled ? `linear-gradient(90deg,${C.game},${C.gameDk})` : 'rgba(255,255,255,.1)',
          position: 'relative', transition: 'background .2s',
        }}>
          <div style={{
            position: 'absolute', top: 3, left: enabled ? 23 : 3,
            width: 18, height: 18, borderRadius: '50%', background: '#fff',
            transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.4)',
          }} />
        </button>
      </div>

      {enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Slider */}
          <div style={{ padding: '14px 16px', borderRadius: 11,
            background: 'color-mix(in srgb, var(--p-game) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-game) 13%, transparent)' }}>
            <SSlider
              label="Required Level" value={level} onChange={onLevelChange}
              min={1} max={50} color={C.game}
              note={`Level ${level} · ${activeTier.label}`}
            />
            {/* Tier badges */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {tiers.map(t => (
                <div key={t.label} style={{
                  padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: activeTier.label === t.label ? `color-mix(in srgb, ${t.color} 9%, transparent)` : 'rgba(255,255,255,.04)',
                  border: `1px solid ${activeTier.label === t.label ? `color-mix(in srgb, ${t.color} 33%, transparent)` : C.border}`,
                  color: activeTier.label === t.label ? t.color : C.muted,
                  transition: 'all .15s',
                }}>{t.label} {t.min}–{t.max}</div>
              ))}
            </div>
          </div>
          {/* Flow */}
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.8 }}>
            ① Recipient receives invite &nbsp;→&nbsp;
            ② Play BlockBite to <strong style={{ color: C.game }}>Level {level}</strong> &nbsp;→&nbsp;
            ③ On-chain verification &nbsp;→&nbsp;
            ④ <code style={{ fontFamily: C.mono, color: C.blue }}>verify_game_gate()</code> unlocks stream
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right sidebar ────────────────────────────────────────────────────────────
export function StreamSidebar({
  typeLabel, typeColor, typeIcon,
  totalDeposit, token, recipientCount,
  gameGate, gameLevel,
  multisigAuthority,
  onSubmit,
  txStatus = 'idle',
  txErr = null,
  isSubmitting = false,
}: {
  typeLabel: string; typeColor: string; typeIcon: string;
  totalDeposit: number; token: string; recipientCount: number;
  gameGate: boolean; gameLevel: number;
  /** Squads vault address when the creator opts into multisig cancel protection */
  multisigAuthority?: string;
  onSubmit: () => void;
  txStatus?: 'idle' | 'wrapping' | 'approving' | 'confirming' | 'done' | 'error';
  txErr?: string | null;
  isSubmitting?: boolean;
}) {
  return (
    <div style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Network card */}
      <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7,
              background: `color-mix(in srgb, ${typeColor} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${typeColor} 27%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
              {typeIcon}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--p-text)', fontFamily: C.serif }}>
              Solana
            </span>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em',
            color: C.green, background: 'color-mix(in srgb, var(--p-green) 9%, transparent)',
            border: '1px solid color-mix(in srgb, var(--p-green) 20%, transparent)', padding: '2px 8px', borderRadius: 6 }}>
            Devnet
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { l: 'Stream Type',       v: typeLabel,                                          c: typeColor  },
            { l: 'Total Deposit',     v: totalDeposit > 0 ? `${totalDeposit.toLocaleString()} ${token}` : '0 —', c: 'var(--p-text)' },
            { l: 'Platform fee (0.9%)', v: totalDeposit > 0 ? `${(totalDeposit * 0.009).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${token}` : '—', c: C.gold },
            { l: 'Recipients',        v: recipientCount > 0 ? String(recipientCount) : '—',  c: C.blue     },
            { l: 'Network Fee (est.)',v: '~0.000005 SOL',                                    c: C.muted    },
          ].map(r => (
            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, color: C.muted }}>{r.l}</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: r.c }}>{r.v}</span>
            </div>
          ))}
        </div>

        {/* Game gate indicator */}
        {gameGate && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 9,
            background: 'color-mix(in srgb, var(--p-game) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--p-game) 20%, transparent)',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ fontSize: 14 }}>◈</span>
            <span style={{ fontSize: 11.5, color: 'var(--p-game)', fontWeight: 600 }}>
              Game Gate: Level {gameLevel}
            </span>
          </div>
        )}

        {/* Create button */}
        <button onClick={onSubmit} disabled={isSubmitting} style={{
          marginTop: 16, width: '100%', padding: '13px 0', borderRadius: 11, border: 'none',
          background: isSubmitting
            ? 'color-mix(in srgb, var(--p-accent) 35%, transparent)'
            : `linear-gradient(135deg,${typeColor},${C.accentDk})`,
          color: '#fff', fontWeight: 800, fontSize: 14,
          cursor: isSubmitting ? 'default' : 'pointer',
          fontFamily: C.serif, letterSpacing: '.02em',
          boxShadow: isSubmitting ? 'none' : `0 0 20px color-mix(in srgb, ${typeColor} 27%, transparent)`,
          transition: 'all .15s',
        }}>
          {txStatus === 'wrapping'   ? '⟳ Approve SOL wrap (1/2)…'
           : txStatus === 'approving'  ? '◈ Approve stream (2/2)…'
           : txStatus === 'confirming' ? '▶ Confirming on Solana…'
           : `Create ${recipientCount > 1 ? `${recipientCount} ` : ''}${typeLabel} Stream${recipientCount > 1 ? 's' : ''}`}
        </button>
        {txErr && (
          <div style={{
            marginTop: 8, padding: '9px 12px', borderRadius: 9, fontSize: 11.5,
            background: 'color-mix(in srgb, var(--p-red) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--p-red) 27%, transparent)', color: C.red,
          }}>
            ✗ {txErr}
          </div>
        )}
      </div>

      {/* Protocol checklist */}
      <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase',
          color: C.muted, marginBottom: 10 }}>TDP Protocol</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, color: C.muted }}>
          <div>✓ Smart contract enforced vesting</div>
          <div>✓ PDA vault — tokens leave only via program</div>
          <div>✓ Anchor IDL-typed instructions</div>
          {gameGate && <div style={{ color: C.game }}>✓ BlockBite game level gate active</div>}
          {/* Clawback-Multisig protection status — architectural transparency */}
          {multisigAuthority && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(multisigAuthority) ? (
            <div style={{ color: C.green }}>
              🔒 Multisig authority · {multisigAuthority.slice(0, 4)}…{multisigAuthority.slice(-4)}
            </div>
          ) : (
            <div style={{ color: C.ember }}>
              ⚠ Solo authority — unilateral clawback possible
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tx status type (mirrors useStreamCreate) ────────────────────────────────
export type TxStatus = 'idle' | 'wrapping' | 'approving' | 'confirming' | 'done' | 'error';

// ─── Inline field validation error ───────────────────────────────────────────
export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div style={{ fontSize: 11, color: C.red, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>⚠</span> {msg}
    </div>
  );
}

// ─── 3-stage transaction progress bar ────────────────────────────────────────
const TX_STAGES: { key: TxStatus; label: string; icon: string }[] = [
  { key: 'wrapping',   label: 'Wrap SOL',            icon: '⟳' },
  { key: 'approving',  label: 'Wallet Approval',     icon: '◈' },
  { key: 'confirming', label: 'Sending to Solana',   icon: '▶' },
  { key: 'done',       label: 'Confirmed On-Chain',  icon: '✓' },
];

export function TxProgress({
  status, sig, error, cluster = 'devnet',
}: {
  status: TxStatus;
  sig?: string | null;
  error?: string | null;
  cluster?: string;
}) {
  if (status === 'idle') return null;

  // wrapping=0, approving=1, confirming=2, done=3
  const activeIdx = status === 'done' ? 3
    : status === 'confirming' ? 2
    : status === 'approving'  ? 1
    : 0; // wrapping

  return (
    <div style={{
      borderRadius: 14, border: `1px solid ${status === 'error' ? 'color-mix(in srgb, var(--p-red) 33%, transparent)' : 'color-mix(in srgb, var(--p-accent) 20%, transparent)'}`,
      background: status === 'error' ? 'color-mix(in srgb, var(--p-red) 3%, transparent)' : 'color-mix(in srgb, var(--p-accent) 2%, transparent)',
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Stage steps */}
      <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
        {TX_STAGES.map((stage, i) => {
          const isActive  = i === activeIdx && status !== 'done' && status !== 'error';
          const isDone    = status === 'done' || i < activeIdx;
          const isFuture  = i > activeIdx && status !== 'done';
          return (
            <div key={stage.key} style={{ display: 'flex', alignItems: 'center', flex: i < TX_STAGES.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                  background: isDone ? 'color-mix(in srgb, var(--p-green) 13%, transparent)' : isActive ? 'color-mix(in srgb, var(--p-accent) 9%, transparent)' : 'rgba(255,255,255,.04)',
                  border: `1.5px solid ${isDone ? 'color-mix(in srgb, var(--p-green) 40%, transparent)' : isActive ? 'color-mix(in srgb, var(--p-accent) 40%, transparent)' : C.border}`,
                  boxShadow: isActive ? '0 0 12px color-mix(in srgb, var(--p-accent) 20%, transparent)' : 'none',
                  transition: 'all .3s',
                }}>
                  {isDone ? '✓' : isActive ? (
                    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◆</span>
                  ) : stage.icon}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                  color: isDone ? C.green : isActive ? 'var(--p-text)' : C.muted,
                }}>
                  {stage.label}
                </span>
              </div>
              {i < TX_STAGES.length - 1 && (
                <div style={{
                  flex: 1, height: 1.5, margin: '0 8px', marginBottom: 22,
                  background: i < activeIdx || status === 'done' ? 'color-mix(in srgb, var(--p-green) 40%, transparent)' : C.border,
                  transition: 'background .3s',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Status message */}
      {status === 'wrapping' && (
        <div style={{ fontSize: 12.5, color: C.gold, textAlign: 'center' }}>
          ⟳ Step 1/2 — Approve SOL → wSOL wrap in your wallet…
        </div>
      )}
      {status === 'approving' && (
        <div style={{ fontSize: 12.5, color: C.accent, textAlign: 'center' }}>
          Open your wallet and approve the transaction…
        </div>
      )}
      {status === 'confirming' && (
        <div style={{ fontSize: 12.5, color: 'var(--p-text)', textAlign: 'center' }}>
          Transaction sent — waiting for Solana to confirm…
        </div>
      )}
      {status === 'done' && sig && (
        <div style={{ fontSize: 12, color: C.green, textAlign: 'center' }}>
          ✓ Stream created on-chain ·{' '}
          <a
            href={`https://explorer.solana.com/tx/${sig}?cluster=${cluster}`}
            target="_blank" rel="noreferrer"
            style={{ color: C.green, textDecoration: 'underline' }}
          >
            {sig.slice(0, 8)}…{sig.slice(-6)} ↗
          </a>
        </div>
      )}
      {status === 'error' && error && (
        <div style={{ fontSize: 12, color: C.red, textAlign: 'center', lineHeight: 1.6 }}>
          ✗ {humanizeError(error)}
        </div>
      )}
      {status === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <span style={{
            display: 'inline-block', fontSize: 11, color: C.muted, cursor: 'pointer',
            textDecoration: 'underline', padding: '2px 4px',
          }}
            onClick={() => window.location.reload()}
          >
            ↺ Reload page to try again
          </span>
        </div>
      )}

      {/* Spin keyframes injected inline */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Convert raw contract / RPC errors to user-friendly messages ─────────────
export function humanizeError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes('user rejected') || msg.includes('user cancelled') || msg.includes('user denied'))
    return 'Transaction cancelled — you rejected the wallet prompt.';
  if (msg.includes('insufficient funds') || msg.includes('insufficient balance') || msg.includes('insufficient lamports'))
    return 'Insufficient balance — not enough tokens or SOL for fees.';
  if (msg.includes('blockhash') || msg.includes('expired'))
    return 'Transaction expired — please try again.';
  if (msg.includes('already in use') || msg.includes('already exists'))
    return 'Stream account already exists at this address.';
  if (msg.includes('invalid account data') || msg.includes('incorrect program id'))
    return 'Program not deployed — ensure the vesting program is on devnet.';
  if (msg.includes('0x1') || msg.includes('custom program error: 0x1'))
    return 'Insufficient token balance for this stream amount.';
  if (msg.includes('0x11') || msg.includes('arithmetic'))
    return 'Arithmetic overflow — reduce the stream amount.';
  if (msg.includes('wallet not connected') || msg.includes('not connected'))
    return 'Wallet not connected — connect Phantom or Solflare first.';
  if (msg.includes('403') || msg.includes('forbidden'))
    return 'RPC blocked this request — switching endpoint automatically.';
  if (msg.includes('unauthorized') || msg.includes('api key') || msg.includes('authenticate'))
    return 'RPC requires API key (Ankr free tier ended). Switching to backup endpoint — please try again.';
  if (msg.includes('freetier') || msg.includes('paid tier') || msg.includes('not available on freetier'))
    return 'RPC free tier blocked. Switching to backup endpoint — please try again.';
  if (msg.includes('timeout') || msg.includes('timed out'))
    return 'Network timeout — Solana devnet may be slow. Retry in a moment.';
  if (msg.includes('internal error') || msg.includes('-32603'))
    return 'Devnet RPC internal error — validator was overloaded. Click the button again to retry.';
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'Network error — check your connection and try again.';
  // Fallback: surface the raw message, capped at 120 chars
  const raw = (e instanceof Error ? e.message : String(e));
  return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
}

// ─── Clawback-Multisig authority field ───────────────────────────────────────
/**
 * MultisigAuthorityField
 *
 * Architectural context (see memory: arch-clawback-multisig):
 *   The current on-chain Stream struct stores a SINGLE `authority` pubkey.
 *   If that key is a personal wallet, the creator can unilaterally cancel at
 *   any time (single-key clawback).  To enforce M-of-N governance, the
 *   `authority` must be a Squads multisig vault address — then `cancelStream`
 *   must originate from that vault and requires M co-signers.
 *
 *   Current constraint: the Anchor program marks `authority` as a `mut Signer`,
 *   so the stream can only be created when the authority itself signs.  To use a
 *   Squads vault as authority, the transaction must be submitted *through* the
 *   Squads proposal flow, not directly from a personal wallet.
 *
 *   This component surfaces the risk disclosure and collects the intended vault
 *   address for when multisig submit support is added (Phase 2).
 */
export function MultisigAuthorityField({
  value,
  onChange,
}: {
  value: string;
  onChange: (addr: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState(false);

  // Validate: 32–44 base58 chars, no obvious non-base58 chars
  const isValidish = value.length >= 32 && value.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
  const showErr = value.length > 0 && !isValidish;

  const toggle = useCallback(() => setExpanded(e => !e), []);

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      border: `1px solid ${expanded ? 'color-mix(in srgb, var(--p-ember) 33%, transparent)' : C.border}`,
      background: expanded ? 'color-mix(in srgb, var(--p-ember) 2%, transparent)' : 'rgba(255,255,255,.02)',
      transition: 'all .2s',
    }}>
      {/* Header toggle */}
      <button
        type="button"
        onClick={toggle}
        style={{
          width: '100%', padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: C.serif,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>{value && isValidish ? '🔒' : '⚠'}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: value && isValidish ? C.green : 'var(--p-text)' }}>
              {value && isValidish ? 'Multisig Authority Set' : 'Clawback Authority'}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {value && isValidish
                ? 'Cancel requires M-of-N vault co-signers'
                : 'Solo key — you alone can cancel this stream'}
            </div>
          </div>
        </div>
        <span style={{ color: C.muted, fontSize: 11, fontFamily: C.mono, flexShrink: 0 }}>
          {expanded ? '▲ collapse' : '▼ configure'}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Risk callout */}
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-ember) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--p-ember) 21%, transparent)',
            fontSize: 11.5, color: `rgba(255,165,100,.9)`, lineHeight: 1.65,
          }}>
            <strong>⚠ Default: SOLO AUTHORITY (no multisig protection)</strong>
            <br />
            Your connected wallet becomes the sole cancel key.
            A single signature — yours alone — can freeze unvested tokens instantly.
            To enforce M-of-N governance, set a <strong>Squads vault address</strong> as the
            authority below (Phase 2 feature — requires submitting via Squads).
          </div>

          {/* Address input */}
          <div>
            <Label>Squads Vault Address <span style={{ color: C.muted, fontWeight: 400 }}>(optional · Phase 2)</span></Label>
            <div style={{ position: 'relative' }}>
              <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="e.g. SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu"
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
                style={{
                  width: '100%', padding: '11px 14px', boxSizing: 'border-box',
                  background: C.bg2,
                  border: `1px solid ${showErr ? C.red : focus ? C.ember : C.border}`,
                  borderRadius: 10, color: 'var(--p-text)', fontSize: 12, outline: 'none',
                  fontFamily: C.mono, transition: 'border-color .15s',
                }}
              />
              {value && isValidish && (
                <span style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, color: C.green,
                }}>✓</span>
              )}
            </div>
            {showErr && (
              <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
                ⚠ Not a valid Solana base58 address
              </div>
            )}
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
              Leave blank to use your connected wallet as the sole cancel authority.
              When multisig submit is live, the Squads vault will sign the create_stream tx
              directly — M-of-N approval required before any cancellation can execute.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Convert game gate level → on-chain required tier (0 | 1 | 2) ────────────
export function levelToTier(level: number): 0 | 1 | 2 {
  if (level <= 0)  return 0;  // no gate
  if (level <= 25) return 1;  // beginner / intermediate
  return 2;                   // advanced / expert
}

// ─── Shared page shell ────────────────────────────────────────────────────────
const SHELL_RESPONSIVE_CSS = `
@media (max-width: 860px) {
  .sps-grid { grid-template-columns: 1fr !important; }
  .sps-sidebar { position: static !important; top: auto !important; }
}
@media (max-width: 640px) {
  .sps-header { padding: 80px 16px 20px !important; }
  .sps-body   { padding: 20px 16px 80px !important; }
}
`;

export function StreamPageShell({
  typeLabel, typeIcon, typeColor, subtitle, children, sidebar,
}: {
  typeLabel: string; typeIcon: string; typeColor: string; subtitle: string;
  children: React.ReactNode; sidebar: React.ReactNode;
}) {
  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: 'var(--p-text)', fontFamily: C.serif }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: SHELL_RESPONSIVE_CSS }} />
      <div className="sps-header" style={{
        padding: '80px 32px 24px',
        borderBottom: `1px solid ${C.border}`,
        background: 'var(--p-grad)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/new" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 14,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.02)',
          }}>← Back to types</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 13,
              background: `color-mix(in srgb, ${typeColor} 9%, transparent)`, border: `1.5px solid color-mix(in srgb, ${typeColor} 27%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
            }}>{typeIcon}</div>
            <div>
              <h1 style={{ fontSize: 'clamp(22px,3.5vw,32px)', fontWeight: 900, margin: 0, color: 'var(--p-text)' }}>
                {typeLabel} Vesting
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>{subtitle}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="sps-grid sps-body" style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px 100px',
        display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
        <div className="sps-sidebar">
          {sidebar}
        </div>
      </div>
    </main>
  );
}

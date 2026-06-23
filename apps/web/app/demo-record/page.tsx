'use client';

/**
 * /demo-record — a self-driving, screen-recording-style walkthrough of BlockBite.
 *
 * Reuses the REAL form components from app/(app)/new/_shared.tsx so the DOM/CSS
 * matches the production app exactly, wrapped in a faithful app chrome. An
 * animated synthetic cursor (see engine.tsx) drives the whole tour with no
 * wallet or RPC — deterministic and offline, built to be captured by Playwright.
 */

import { useRef, useState } from 'react';
import {
  C, Section, Label, SInput, SSlider, GameGateCard,
  StreamSidebar, StreamPageShell, MultisigAuthorityField, FieldError,
} from '@/app/(app)/new/_shared';
import { DemoEngine, Target, wait, type Cursor } from './engine';

type TxStatus = 'idle' | 'wrapping' | 'approving' | 'confirming' | 'done' | 'error';
type Scene = 'intro' | 'linear' | 'cliff' | 'milestone' | 'streams' | 'claim' | 'game' | 'outro';

const WALLET = 'EH2nq9kP4r7sVb3xLmTjF8wCdZ6yGhQpRnA1uKvXsBM';
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const RECIPIENT = '7Np4Kc2rXyB9fJ3mQvH8sLd6tZ1aE5oW0uGiPkRnYcT';

// ── faithful left nav ─────────────────────────────────────────────────────────
function Chrome({ active, children, scrollRef }: { active: Scene; children: React.ReactNode; scrollRef: React.RefObject<HTMLDivElement> }) {
  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '▦' },
    { id: 'create', label: 'Create Stream', icon: '＋', on: ['linear', 'cliff', 'milestone'] },
    { id: 'streams', label: 'My Streams', icon: '▤', on: ['streams'] },
    { id: 'claim', label: 'Claim', icon: '↧', on: ['claim'] },
    { id: 'campaigns', label: 'Campaigns', icon: '◈' },
    { id: 'game', label: 'Play BlockBite', icon: '◆', on: ['game'] },
  ];
  return (
    <div style={{ display: 'flex', width: 1920, height: 1080, background: '#0b0d12', overflow: 'hidden', fontFamily: C.serif }}>
      {/* Sidebar */}
      <aside style={{ width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,.06)', background: '#0c0e14', display: 'flex', flexDirection: 'column', padding: '18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 20px' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#9945FF,#14F195)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#0b0d12', fontSize: 16 }}>B</div>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>BlockBite</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#14F195', background: 'rgba(20,241,149,.1)', border: '1px solid rgba(20,241,149,.25)', padding: '2px 6px', borderRadius: 6, marginLeft: 'auto' }}>devnet</span>
        </div>
        {nav.map((n) => {
          const isOn = n.on?.includes(active) || n.id === active;
          return (
            <div key={n.id} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 10, marginBottom: 3,
              fontSize: 13.5, fontWeight: isOn ? 700 : 500,
              color: isOn ? '#fff' : '#8b92a5',
              background: isOn ? 'linear-gradient(90deg,rgba(153,69,255,.18),rgba(153,69,255,.04))' : 'transparent',
              border: isOn ? '1px solid rgba(153,69,255,.25)' : '1px solid transparent',
            }}>
              <span style={{ fontSize: 15, width: 18, textAlign: 'center', color: isOn ? '#b388ff' : '#6b7280' }}>{n.icon}</span>
              {n.label}
            </div>
          );
        })}
        <div style={{ marginTop: 'auto', fontSize: 10.5, color: '#4b5163', padding: '8px 10px' }}>Solana Devnet · v2.4</div>
      </aside>

      {/* Right column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header style={{ height: 56, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(11,13,18,.8)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.03)', padding: '7px 12px', fontSize: 12, color: '#8b92a5' }}>
            <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
              <span style={{ position: 'absolute', width: 8, height: 8, borderRadius: 99, background: '#34d399', opacity: .5 }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#34d399' }} />
            </span>
            Devnet <span style={{ color: '#555d73' }}>#471,352,990</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, border: '1px solid rgba(153,69,255,.3)', background: 'rgba(153,69,255,.08)', padding: '7px 13px', fontSize: 12.5, fontWeight: 600, color: '#cbb6ff' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#14F195' }} />
            {short(WALLET)}
          </div>
        </header>

        {/* Scroll content */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── caption (tutorial subtitle) ───────────────────────────────────────────────
function Caption({ text }: { text: string }) {
  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 34, transform: 'translateX(-50%)', zIndex: 99990, pointerEvents: 'none', maxWidth: 1100 }}>
      {text && (
        <div key={text} style={{
          padding: '12px 24px', borderRadius: 13, textAlign: 'center',
          background: 'rgba(12,14,20,.86)', border: '1px solid rgba(153,69,255,.28)',
          backdropFilter: 'blur(12px)', boxShadow: '0 8px 40px rgba(0,0,0,.5)',
          fontSize: 17, fontWeight: 600, color: '#f0ecf8', letterSpacing: '.005em',
          animation: 'capIn .4s ease-out',
        }}>{text}</div>
      )}
      <style>{`@keyframes capIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ── intro / outro title cards ────────────────────────────────────────────────
function TitleCard({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div style={{ minHeight: 1024, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 40%, rgba(153,69,255,.10), transparent 60%), #0b0d12' }}>
      <div style={{ textAlign: 'center', animation: 'capIn .6s ease-out' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.3em', textTransform: 'uppercase', color: '#14F195', marginBottom: 18 }}>{kicker}</div>
        <h1 style={{ fontSize: 64, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.05, letterSpacing: '-.02em' }}>{title}</h1>
        <p style={{ fontSize: 20, color: '#8b92a5', marginTop: 18 }}>{sub}</p>
      </div>
    </div>
  );
}

// ── create-stream scene (config driven; reuses real _shared components) ───────
interface CreateVals {
  token: string; mint: string; name: string; recipient: string; amount: string;
  startDate: string; cliffDays: number; vestDays: number;
  gameOn: boolean; gameLevel: number; multisig: string;
  txStatus: TxStatus; txSig: string | null;
}
interface CreateCfg {
  typeLabel: string; typeIcon: string; typeColor: string; subtitle: string;
  showCliff: boolean; tokenLogo: string;
}

function TokenField({ token, logo }: { token: string; logo: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
      padding: '11px 14px', background: C.bg2, border: `1px solid ${token ? C.accent : C.border}`,
      borderRadius: 10, fontSize: 13, color: token ? 'var(--p-text)' : C.muted, fontFamily: C.mono,
      transition: 'border-color .15s',
    }}>
      {token ? (
        <>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: 'linear-gradient(135deg,#9945FF,#14F195)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#0b0d12', fontWeight: 800 }}>{logo}</span>
          <span style={{ fontWeight: 700 }}>{token}</span>
          <span style={{ color: C.muted, fontSize: 11 }}>· Solana SPL</span>
          <span style={{ marginLeft: 'auto', color: C.green, fontSize: 12 }}>✓ selected</span>
        </>
      ) : (
        <>Select a token… <span style={{ marginLeft: 'auto', color: C.muted }}>▾</span></>
      )}
    </div>
  );
}

function CreateScene({ vals, cfg }: { vals: CreateVals; cfg: CreateCfg }) {
  const COLOR = cfg.typeColor;
  const deposit = Number(vals.amount) || 0;
  const daily = vals.vestDays > 0 ? (deposit / vals.vestDays).toFixed(2) : '0';
  const perSec = vals.vestDays > 0 ? (deposit / (vals.vestDays * 86400)).toFixed(6) : '0';

  if (vals.txStatus === 'done') {
    return (
      <main style={{ minHeight: 1024, background: C.bg0, color: '#e8e1f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
        <div style={{ textAlign: 'center', maxWidth: 520, padding: '0 24px', animation: 'capIn .5s ease-out' }}>
          <div style={{ fontSize: 60, marginBottom: 18 }}>{cfg.typeIcon}</div>
          <h2 style={{ fontSize: 34, fontWeight: 900, color: C.gold, marginBottom: 10 }}>{cfg.typeLabel} Stream Created!</h2>
          <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.7, marginBottom: 18 }}>
            {cfg.typeLabel} vesting active — <strong style={{ color: COLOR }}>{daily} {vals.token}/day</strong> unlock rate.
            {vals.gameOn && ` BlockBite Game Gate active at Level ${vals.gameLevel}.`}
          </p>
          {vals.txSig && (
            <div style={{ marginBottom: 22, padding: '12px 16px', borderRadius: 10, background: 'color-mix(in srgb, var(--p-green) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-green) 20%, transparent)', fontSize: 13 }}>
              <span style={{ color: C.muted }}>Tx: </span>
              <span style={{ color: C.green, wordBreak: 'break-all' }}>{vals.txSig} ↗</span>
            </div>
          )}
          <div style={{ display: 'inline-flex', gap: 12 }}>
            <div style={{ padding: '12px 26px', borderRadius: 11, fontWeight: 700, fontSize: 14, background: `linear-gradient(135deg,${COLOR},${C.accentDk})`, color: '#fff' }}>View Streams →</div>
            <div style={{ padding: '12px 26px', borderRadius: 11, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.03)', color: C.muted, fontSize: 14 }}>Create Another</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <StreamPageShell
      typeLabel={cfg.typeLabel} typeIcon={cfg.typeIcon} typeColor={COLOR} subtitle={cfg.subtitle}
      sidebar={
        <Target name="sidebar">
          <StreamSidebar
            typeLabel={cfg.typeLabel} typeColor={COLOR} typeIcon={cfg.typeIcon}
            totalDeposit={deposit} token={vals.token || 'TOKEN'}
            recipientCount={vals.recipient ? 1 : 0}
            gameGate={vals.gameOn} gameLevel={vals.gameLevel}
            multisigAuthority={vals.multisig}
            onSubmit={() => {}}
            isSubmitting={vals.txStatus !== 'idle'}
            txStatus={vals.txStatus}
            txErr={null}
          />
        </Target>
      }
    >
      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>
        <Target name="f.token">
          <Label required>Token — Any SPL (devnet · mainnet · testnet · wrapped)</Label>
          <TokenField token={vals.token} logo={cfg.tokenLogo} />
          {vals.mint && (
            <div style={{ fontSize: 10, color: '#666', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
              Mint: {vals.mint.slice(0, 16)}… · 9 decimals
            </div>
          )}
        </Target>
        <Target name="f.name">
          <Label>Stream Name <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></Label>
          <SInput value={vals.name} onChange={() => {}} placeholder="e.g. Team Salary Q3 2026" mono={false} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
            {vals.name.length > 0 ? `${vals.name.length}/31 chars · stored on-chain as a 32-byte UTF-8 label` : 'Optional human-readable label stored on-chain (max 31 chars)'}
          </div>
        </Target>
        <Target name="f.recipient">
          <Label required>Recipient</Label>
          <SInput value={vals.recipient} onChange={() => {}} placeholder="Solana wallet address…" />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Tokens unlock continuously to this wallet from cliff to end date</div>
        </Target>
        <Target name="f.amount">
          <Label required>Total Amount</Label>
          <SInput value={vals.amount} onChange={() => {}} placeholder="e.g. 1000000" type="text" prefix="◎" />
          <FieldError msg={undefined} />
        </Target>
      </Section>

      <Section title="Vesting Schedule">
        <div style={{ fontSize: 12, color: C.muted }}>Tokens unlock continuously over time, from {cfg.showCliff ? 'cliff' : 'start'} date to end date.</div>
        <Target name="f.start">
          <Label required>Start Date</Label>
          <SInput value={vals.startDate} onChange={() => {}} type="text" placeholder="dd/mm/yyyy" />
        </Target>
        <Target name="f.cliff">
          <SSlider label="Cliff Period" value={vals.cliffDays} onChange={() => {}} min={0} max={730} unit=" days" color={C.ember}
            note={vals.cliffDays === 0 ? 'No cliff' : `Cliff: Day ${vals.cliffDays}`} />
        </Target>
        <Target name="f.vest">
          <SSlider label="Vesting Duration" value={vals.vestDays} onChange={() => {}} min={30} max={1460} unit=" days" color={COLOR}
            note={`Completes: Day ${vals.cliffDays + vals.vestDays}`} />
        </Target>
        {deposit > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Cliff unlock', v: `Day ${vals.cliffDays}`, c: C.ember },
              { l: 'Fully vested', v: `Day ${vals.cliffDays + vals.vestDays}`, c: COLOR },
              { l: 'Daily rate', v: `${daily} ${vals.token || 'T'}/day`, c: C.green },
              { l: 'Per second', v: `${perSec} T/s`, c: C.blue },
            ].map((r) => (
              <div key={r.l} style={{ padding: '10px 12px', borderRadius: 9, background: `color-mix(in srgb, ${r.c} 3%, transparent)`, border: `1px solid color-mix(in srgb, ${r.c} 13%, transparent)` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{r.l}</div>
                <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: r.c }}>{r.v}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Unlock Requirements">
        <Target name="f.game">
          <GameGateCard enabled={vals.gameOn} onChange={() => {}} level={vals.gameLevel} onLevelChange={() => {}} />
        </Target>
      </Section>

      <Section title="Clawback & Authority">
        <MultisigAuthorityField value={vals.multisig} onChange={() => {}} />
      </Section>
    </StreamPageShell>
  );
}

// ── My Streams scene ──────────────────────────────────────────────────────────
function StreamsScene({ claimReady }: { claimReady: boolean }) {
  const rows = [
    { name: 'Team Salary Q3 2026', type: 'Linear', color: C.accent, icon: '∿', amt: '1,000 SOL', unlocked: 38, gate: false },
    { name: 'Founder Cliff Vest', type: 'Cliff', color: C.ember, icon: '⌖', amt: '500,000 BBT', unlocked: 0, gate: false },
    { name: 'Player Reward Pool', type: 'Milestone', color: C.game, icon: '◈', amt: '250,000 BBT', unlocked: claimReady ? 100 : 0, gate: true },
  ];
  return (
    <main style={{ minHeight: 1024, background: C.bg0, color: 'var(--p-text)', fontFamily: C.serif, padding: '40px 48px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 4px' }}>My Streams</h1>
        <p style={{ fontSize: 14, color: C.muted, margin: '0 0 28px' }}>3 active vesting streams created from this wallet</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((r, i) => (
            <Target key={r.name} name={`stream.${i}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: `color-mix(in srgb, ${r.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${r.color} 30%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: r.color }}>{r.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{r.name}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: r.color, background: `color-mix(in srgb, ${r.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${r.color} 25%, transparent)`, padding: '2px 8px', borderRadius: 6 }}>{r.type}</span>
                    {r.gate && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.game, background: 'color-mix(in srgb, var(--p-game) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--p-game) 25%, transparent)', padding: '2px 8px', borderRadius: 6 }}>◈ Game-gated</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{r.amt} · to {short(RECIPIENT)}</div>
                  <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${r.unlocked}%`, background: r.color, borderRadius: 99, transition: 'width .6s ease' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: C.mono, color: r.color }}>{r.unlocked}%</div>
                  <div style={{ fontSize: 11, color: C.muted }}>unlocked</div>
                </div>
              </div>
            </Target>
          ))}
        </div>
      </div>
    </main>
  );
}

// ── Claim scene ───────────────────────────────────────────────────────────────
function ClaimScene({ phase }: { phase: 'idle' | 'signing' | 'done' }) {
  return (
    <main style={{ minHeight: 1024, background: C.bg0, color: 'var(--p-text)', fontFamily: C.serif, padding: '48px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 6px' }}>Claim Unlocked Tokens</h1>
        <p style={{ fontSize: 14, color: C.muted, margin: '0 0 28px' }}>Team Salary Q3 2026 · Linear stream</p>
        <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Available to claim now</div>
            <div style={{ fontSize: 46, fontWeight: 900, fontFamily: C.mono, color: C.green }}>380.00 <span style={{ fontSize: 22, color: C.muted }}>SOL</span></div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>38% of 1,000 SOL vested · streaming 2.74 SOL/day</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22, fontSize: 13 }}>
            {[['Recipient', short(RECIPIENT)], ['Withdrawn so far', '0 SOL'], ['Escrow PDA', '8xKv…q4Rt'], ['Network fee', '~0.000005 SOL']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: C.muted }}>{k}</span>
                <span style={{ fontFamily: C.mono, color: 'var(--p-text)' }}>{v}</span>
              </div>
            ))}
          </div>
          <Target name="claimBtn">
            <button style={{
              width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
              background: phase === 'done' ? `color-mix(in srgb, var(--p-green) 20%, transparent)` : `linear-gradient(135deg,${C.green},#0e9e6a)`,
              color: phase === 'done' ? C.green : '#06281c', fontWeight: 800, fontSize: 15, fontFamily: C.serif, cursor: 'pointer',
            }}>
              {phase === 'idle' ? 'Withdraw 380 SOL' : phase === 'signing' ? '▶ Confirming on Solana…' : '✓ Claimed 380 SOL'}
            </button>
          </Target>
          {phase === 'done' && (
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5, color: C.green, animation: 'capIn .4s ease-out' }}>
              ✓ withdraw() confirmed · tx 4kRn…9xQp ↗
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Game verification scene ───────────────────────────────────────────────────
function GameScene({ level, verifying, verified }: { level: number; verifying: boolean; verified: boolean }) {
  return (
    <main style={{ minHeight: 1024, background: 'radial-gradient(ellipse at 50% 30%, rgba(108,99,255,.12), transparent 55%), #0b0d12', color: 'var(--p-text)', fontFamily: C.serif, padding: '40px 48px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 26, color: C.game }}>◆</span>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>BlockBite Game — Unlock Gate</h1>
        </div>
        <p style={{ fontSize: 14, color: C.muted, margin: '0 0 26px' }}>Player Reward Pool · 250,000 BBT locked until Level 25 is reached</p>

        {/* fake game viewport */}
        <div style={{ position: 'relative', height: 300, borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.border}`, background: 'linear-gradient(180deg,#161226,#0d0a18)', marginBottom: 22 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 64 }}>{verified ? '🏆' : '◆'}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{verified ? 'Level 25 Cleared!' : `Playing… Level ${level}`}</div>
            <div style={{ width: 420, height: 10, borderRadius: 99, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, (level / 25) * 100)}%`, background: `linear-gradient(90deg,${C.game},${C.gameDk})`, borderRadius: 99, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>{level} / 25 levels</div>
          </div>
        </div>

        <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: verified ? C.green : 'var(--p-text)' }}>{verified ? 'Milestone Verified On-Chain' : 'On-Chain Verification'}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>game_authority signs · verify_game() flips is_verified → true</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, color: verified ? C.green : C.muted, background: verified ? 'color-mix(in srgb, var(--p-green) 10%, transparent)' : 'rgba(255,255,255,.04)', border: `1px solid ${verified ? 'color-mix(in srgb, var(--p-green) 25%, transparent)' : C.border}` }}>
              {verified ? '✓ verified' : level >= 25 ? 'ready' : 'in progress'}
            </span>
          </div>
          <Target name="verifyBtn">
            <button style={{
              width: '100%', padding: '14px 0', borderRadius: 11, border: 'none', fontFamily: C.serif, fontWeight: 800, fontSize: 14, cursor: 'pointer',
              background: verified ? 'color-mix(in srgb, var(--p-green) 18%, transparent)' : level >= 25 ? `linear-gradient(135deg,${C.game},${C.gameDk})` : 'rgba(255,255,255,.06)',
              color: verified ? C.green : level >= 25 ? '#fff' : C.muted,
            }}>
              {verified ? '✓ Stream Unlocked — claimable' : verifying ? '▶ Submitting verify_game()…' : level >= 25 ? 'Verify & Unlock Stream' : 'Reach Level 25 to unlock'}
            </button>
          </Target>
        </div>
      </div>
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function DemoRecordPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene>('intro');
  const [caption, setCaption] = useState('');

  // create-form state (shared across the 3 create flows)
  const [v, setV] = useState<CreateVals>({
    token: '', mint: '', name: '', recipient: '', amount: '',
    startDate: '', cliffDays: 30, vestDays: 365,
    gameOn: false, gameLevel: 10, multisig: '',
    txStatus: 'idle', txSig: null,
  });
  const patch = (p: Partial<CreateVals>) => setV((s) => ({ ...s, ...p }));
  const resetForm = () => setV({ token: '', mint: '', name: '', recipient: '', amount: '', startDate: '', cliffDays: 30, vestDays: 365, gameOn: false, gameLevel: 10, multisig: '', txStatus: 'idle', txSig: null });

  const [claimPhase, setClaimPhase] = useState<'idle' | 'signing' | 'done'>('idle');
  const [gameLevel, setGameLevel] = useState(1);
  const [gameVerifying, setGameVerifying] = useState(false);
  const [gameVerified, setGameVerified] = useState(false);
  const [streamsClaimReady, setStreamsClaimReady] = useState(false);

  const [cfg, setCfg] = useState<CreateCfg>({ typeLabel: 'Linear', typeIcon: '∿', typeColor: C.accent, subtitle: '', showCliff: false, tokenLogo: '◎' });

  // fake on-chain transaction sequence (wrapping → approving → confirming → done)
  const runTx = async (c: Cursor, wrap: boolean) => {
    if (wrap) { patch({ txStatus: 'wrapping' }); await wait(1500); }
    patch({ txStatus: 'approving' }); await wait(1700);
    patch({ txStatus: 'confirming' }); await wait(1800);
    const sig = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('');
    patch({ txStatus: 'done', txSig: `${sig.slice(0, 22)}…${sig.slice(-8)}` });
  };

  const fillCreate = async (c: Cursor, opts: {
    token: string; mint: string; logo: string; name: string; amount: string;
    start: string; cliff: number; vest: number; game?: number;
  }) => {
    await c.scrollTo(0, 500);
    await c.clickInside('f.token', 'div'); patch({ token: opts.token, mint: opts.mint }); setCfg((s) => ({ ...s, tokenLogo: opts.logo })); await wait(500);
    await c.clickInside('f.name', 'input'); await c.type((val) => patch({ name: val }), opts.name); await wait(300);
    await c.scrollToTarget('f.recipient');
    await c.clickInside('f.recipient', 'input'); await c.type((val) => patch({ recipient: val }), RECIPIENT, { cps: 40 }); await wait(300);
    await c.clickInside('f.amount', 'input'); await c.type((val) => patch({ amount: val }), opts.amount, { cps: 14 }); await wait(400);
    await c.scrollToTarget('f.start');
    await c.clickInside('f.start', 'input'); await c.type((val) => patch({ startDate: val }), opts.start, { cps: 18 }); await wait(300);
    await c.moveInside('f.cliff', 'input[type=range]'); await c.slide((n) => patch({ cliffDays: n }), v.cliffDays, opts.cliff, 1000); await wait(300);
    await c.scrollToTarget('f.vest');
    await c.moveInside('f.vest', 'input[type=range]'); await c.slide((n) => patch({ vestDays: n }), 365, opts.vest, 1000); await wait(400);
    if (opts.game) {
      await c.scrollToTarget('f.game');
      await c.clickInside('f.game', 'button'); patch({ gameOn: true }); await wait(700);
      await c.moveInside('f.game', 'input[type=range]'); await c.slide((n) => patch({ gameLevel: n }), 10, opts.game, 900); await wait(400);
    }
  };

  // ── the walkthrough script ──────────────────────────────────────────────────
  const script = async (c: Cursor) => {
    // INTRO
    setScene('intro');
    setCaption('BlockBite — token vesting & game-gated rewards on Solana');
    await wait(2600);
    setCaption('Full walkthrough: 3 stream types · claiming · BlockBite game unlock');
    await wait(2800);

    // ─── 1. LINEAR ───
    resetForm();
    setCfg({ typeLabel: 'Linear', typeIcon: '∿', typeColor: C.accent, subtitle: 'Tokens release gradually from start date to end date. Smooth, proportional unlock.', showCliff: false, tokenLogo: '◎' });
    setScene('linear');
    await wait(900);
    setCaption('1 / 3 — Linear stream: tokens unlock smoothly, every second');
    await c.moveToXY(960, 400, 700);
    await wait(1400);
    await fillCreate(c, { token: 'SOL', mint: 'So1111111111111111111111111111111111111111', logo: '◎', name: 'Team Salary Q3 2026', amount: '1000', start: '10/10/2026', cliff: 0, vest: 365 });
    setCaption('Review the summary, then create the stream');
    await c.scrollTo(0, 600);
    await c.moveInside('sidebar', 'button', 700);
    await wait(800);
    setCaption('Approve in your wallet — funds lock into a PDA vault');
    await c.click();
    await runTx(c, false);
    await wait(700);
    setCaption('✓ Linear stream live — 2.74 SOL unlocking per day');
    await wait(2600);

    // ─── 2. CLIFF ───
    resetForm();
    patch({ cliffDays: 30 });
    setCfg({ typeLabel: 'Cliff', typeIcon: '⌖', typeColor: C.ember, subtitle: 'Nothing unlocks until the cliff date — then vesting begins. Classic founder/team schedule.', showCliff: true, tokenLogo: 'B' });
    setScene('cliff');
    await wait(900);
    setCaption('2 / 3 — Cliff stream: a hard lock until the cliff date');
    await wait(1800);
    await fillCreate(c, { token: 'BBT', mint: 'BBTokmint11111111111111111111111111111111', logo: 'B', name: 'Founder Cliff Vest', amount: '500000', start: '01/01/2027', cliff: 180, vest: 730 });
    setCaption('180-day cliff, then 2-year linear vesting');
    await c.scrollTo(0, 600);
    await c.moveInside('sidebar', 'button', 700);
    await wait(700);
    setCaption('Create the cliff stream');
    await c.click();
    await runTx(c, false);
    await wait(700);
    setCaption('✓ Cliff stream live — 0% unlocks before Day 180');
    await wait(2600);

    // ─── 3. MILESTONE (game-gated) ───
    resetForm();
    patch({ cliffDays: 0 });
    setCfg({ typeLabel: 'Milestone', typeIcon: '◈', typeColor: C.game, subtitle: 'Unlock is gated behind a BlockBite game level — verified on-chain by the game authority.', showCliff: false, tokenLogo: 'B' });
    setScene('milestone');
    await wait(900);
    setCaption('3 / 3 — Milestone stream: unlock requires beating the game');
    await wait(1800);
    await fillCreate(c, { token: 'BBT', mint: 'BBTokmint11111111111111111111111111111111', logo: 'B', name: 'Player Reward Pool', amount: '250000', start: '10/10/2026', cliff: 0, vest: 365, game: 25 });
    setCaption('Game Gate ON — recipient must reach Level 25 to unlock');
    await c.scrollTo(0, 600);
    await c.moveInside('sidebar', 'button', 700);
    await wait(700);
    await c.click();
    await runTx(c, false);
    await wait(700);
    setCaption('✓ Milestone stream live — locked behind BlockBite Level 25');
    await wait(2600);

    // ─── MY STREAMS ───
    setStreamsClaimReady(false);
    setScene('streams');
    await wait(900);
    setCaption('My Streams — all 3 vesting streams in one place');
    await c.scrollTo(0, 500);
    await c.moveTo('stream.0', { dur: 700 }); await wait(1400);
    await c.moveTo('stream.1', { dur: 600 }); await wait(1400);
    await c.moveTo('stream.2', { dur: 600 });
    setCaption('The linear stream already has 38% unlocked — let us claim it');
    await wait(1800);

    // ─── CLAIM ───
    setClaimPhase('idle');
    setScene('claim');
    await wait(900);
    setCaption('Claim tab — the recipient connects with THEIR wallet to withdraw');
    await c.moveToXY(960, 360, 700); await wait(2000);
    await c.clickInside('claimBtn', 'button', 700);
    setClaimPhase('signing');
    setCaption('withdraw() — only the recipient wallet can sign this transfer');
    await wait(2200);
    setClaimPhase('done');
    setCaption('✓ 380 SOL claimed — straight from the on-chain vault');
    await wait(2600);

    // ─── GAME VERIFY ───
    setGameLevel(1); setGameVerifying(false); setGameVerified(false);
    setScene('game');
    await wait(900);
    setCaption('The milestone stream is game-gated — time to play BlockBite');
    await wait(1600);
    // climb levels
    for (let lvl = 1; lvl <= 25; lvl++) {
      setGameLevel(lvl);
      if (lvl === 8) setCaption('Climbing levels… the game authority tracks progress');
      if (lvl === 18) setCaption('Almost there — Level 25 unlocks the reward pool');
      await wait(150);
    }
    await wait(700);
    setCaption('Level 25 cleared — now verify it on-chain');
    await c.clickInside('verifyBtn', 'button', 700);
    setGameVerifying(true);
    await wait(2000);
    setGameVerifying(false); setGameVerified(true);
    setStreamsClaimReady(true);
    setCaption('✓ verify_game() confirmed — milestone stream is now claimable');
    await wait(2800);

    // ─── OUTRO ───
    setScene('outro');
    setCaption('');
    await c.moveToXY(960, 1300, 600); // park cursor off-screen
    await wait(3600);
    (window as unknown as { __demoDone?: boolean }).__demoDone = true;
  };

  return (
    <DemoEngine scrollRef={scrollRef} script={script}>
      <Chrome active={scene} scrollRef={scrollRef}>
        {scene === 'intro' && <TitleCard kicker="Solana Token Distribution Protocol" title="BlockBite" sub="Vesting that unlocks by time — or by skill." />}
        {(scene === 'linear' || scene === 'cliff' || scene === 'milestone') && <CreateScene vals={v} cfg={cfg} />}
        {scene === 'streams' && <StreamsScene claimReady={streamsClaimReady} />}
        {scene === 'claim' && <ClaimScene phase={claimPhase} />}
        {scene === 'game' && <GameScene level={gameLevel} verifying={gameVerifying} verified={gameVerified} />}
        {scene === 'outro' && <TitleCard kicker="That's BlockBite" title="Stream. Play. Unlock." sub="blockbite-protocol.xyz" />}
      </Chrome>
      <Caption text={caption} />
    </DemoEngine>
  );
}

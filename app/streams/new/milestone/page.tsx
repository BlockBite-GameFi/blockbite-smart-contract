'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStreamCreate } from '@/lib/hooks/useStreamCreate';
import {
  C, Label, SInput, SSelect, SSlider, SToggle, ManualCsvToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
} from '../_shared';

// ─── Milestone row ────────────────────────────────────────────────────────────
interface MS { label: string; amount: string; pct: number; }

function MilestoneRow({ m, i, onChange, color }: {
  m: MS; i: number;
  onChange: (field: keyof MS, v: string | number) => void;
  color: string;
}) {
  return (
    <div style={{ padding: '16px 16px', borderRadius: 12,
      background: C.bg2, border: `1px solid ${color}33`,
      display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%',
          background: `${color}18`, border: `1px solid ${color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 800, color, flexShrink: 0 }}>
          {i + 1}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: C.serif }}>
          Milestone {i + 1}
        </span>
      </div>
      <SInput
        value={m.label}
        onChange={v => onChange('label', v)}
        placeholder={`e.g. Token Launch, 10k Users, Product v1.0`}
        mono={false}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Amount (tokens)</Label>
          <SInput value={m.amount} onChange={v => onChange('amount', v)} placeholder="e.g. 50000" type="number" prefix="◎" />
        </div>
        <div>
          <Label>% of total</Label>
          <SSlider label="" value={m.pct} onChange={v => onChange('pct', v)} min={0} max={100} unit="%" color={color} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MilestonePage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const [done, setDone] = useState(false);

  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  // General
  const [mode,       setMode]      = useState<'manual' | 'csv'>('manual');
  const [token,      setToken]     = useState('');
  const [recipient,  setRecipient] = useState('');
  const [cancelable, setCancelable]= useState(false);

  // Milestones
  const [milestones, setMilestones] = useState<MS[]>([
    { label: '', amount: '', pct: 25 },
    { label: '', amount: '', pct: 25 },
    { label: '', amount: '', pct: 25 },
    { label: '', amount: '', pct: 25 },
  ]);
  const [msCount, setMsCount] = useState(2);

  // Game gate
  const [gameGate,  setGameGate]  = useState(false);
  const [gameLevel, setGameLevel] = useState(15);

  const COLOR    = C.blue;
  const visible  = milestones.slice(0, msCount);
  const msTotal  = visible.reduce((s, m) => s + m.pct, 0);
  const deposit  = visible.reduce((s, m) => s + (Number(m.amount) || 0), 0);

  const updateMs = (i: number, field: keyof MS, v: string | number) =>
    setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: v } : m));

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    const now     = Math.floor(Date.now() / 1000);
    // Milestone streams: no time cliff — unlocks are event-triggered on-chain
    const startTs = now;
    const cliffTs = now;
    const endTs   = now + 2 * 365 * 86400; // 2-year window for milestone resolution
    const reqTier = (gameGate ? (gameLevel <= 10 ? 1 : 2) : 0) as 0 | 1 | 2;
    const ok = await submit({
      beneficiary: recipient, token,
      amount: deposit.toString(),
      startTs, cliffTs, endTs, requiredTier: reqTier,
    });
    if (ok) setDone(true);
  };

  if (done) return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>🏁</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          {msCount} milestone gate{msCount > 1 ? 's' : ''} locked on Solana devnet.
          {gameGate && ` BlockBite Game Gate active at Level ${gameLevel}.`}
        </p>
        {txSig && (
          <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10,
            background: `${C.green}0a`, border: `1px solid ${C.green}44`, fontSize: 12, color: C.green }}>
            ✓ Tx:{' '}
            <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank" rel="noreferrer" style={{ color: C.green }}>
              {txSig.slice(0, 8)}…{txSig.slice(-6)} ↗
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/streams" style={{
            padding: '11px 24px', borderRadius: 11, textDecoration: 'none', fontWeight: 700, fontSize: 13,
            background: `linear-gradient(135deg,${COLOR},${C.accentDk})`, color: '#fff',
          }}>View Streams →</Link>
          <button onClick={() => { setDone(false); reset(); }} style={{
            padding: '11px 24px', borderRadius: 11, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.03)', color: C.muted, fontSize: 13,
            cursor: 'pointer', fontFamily: C.serif,
          }}>Create Another</button>
        </div>
      </div>
    </main>
  );

  return (
    <StreamPageShell
      typeLabel="Milestone" typeIcon="🏁" typeColor={COLOR}
      subtitle="Tokens unlock when the creator triggers each milestone. Not time-based."
      sidebar={
        <StreamSidebar
          typeLabel="Milestone" typeColor={COLOR} typeIcon="🏁"
          totalDeposit={deposit} token={token || 'TOKEN'}
          recipientCount={recipient ? 1 : 0}
          gameGate={gameGate} gameLevel={gameLevel}
          onSubmit={handleCreate}
          txStatus={txStatus} txErr={txErr} isSubmitting={isSubmitting}
        />
      }
    >
      {/* General Details */}
      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and campaign settings</div>
        <ManualCsvToggle mode={mode} onChange={setMode} />

        <div>
          <Label required>Token</Label>
          <SSelect value={token} onChange={setToken}
            placeholder="Select Token"
            options={[
              { v: 'BBT',  l: 'BBT — BlockBite Token' },
              { v: 'USDC', l: 'USDC' },
              { v: 'SOL',  l: 'SOL (wrapped)' },
            ]}
          />
        </div>

        {mode === 'manual' && (
          <div>
            <Label required>Recipient</Label>
            <SInput value={recipient} onChange={setRecipient} placeholder="Solana wallet address…" />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
              All milestones in this stream go to this recipient
            </div>
          </div>
        )}

        {mode === 'csv' && (
          <div style={{ padding: '20px', borderRadius: 11, border: `1px dashed ${C.border}`,
            textAlign: 'center', color: C.muted, fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, color: '#e8e1f8', marginBottom: 4 }}>Upload CSV</div>
            <div style={{ fontSize: 11.5 }}>wallet,amount columns · one recipient per row</div>
            <button style={{
              marginTop: 12, padding: '8px 18px', borderRadius: 9,
              border: `1px solid ${C.border}`, background: C.bg2,
              color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: C.serif,
            }}>Choose File</button>
          </div>
        )}

        <SToggle value={cancelable} onChange={setCancelable}
          label="Allow cancellation?"
          sub="Creator can cancel and reclaim unvested tokens." />
      </Section>

      {/* Milestone configuration */}
      <Section title="Milestone Configuration">
        <div style={{ fontSize: 12, color: C.muted }}>
          Define up to 4 milestones. Each unlocks a portion of tokens when verified on-chain.
        </div>

        <SSlider
          label="Number of Milestones" value={msCount} onChange={setMsCount}
          min={1} max={4} color={COLOR} note={`${msCount} milestone${msCount > 1 ? 's' : ''}`}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((m, i) => (
            <MilestoneRow key={i} m={m} i={i} color={COLOR}
              onChange={(field, v) => updateMs(i, field, v)} />
          ))}
        </div>

        {/* Pct total indicator */}
        <div style={{
          padding: '9px 13px', borderRadius: 9, fontSize: 12, fontFamily: C.mono,
          background: msTotal > 100 ? `${C.red}12` : msTotal === 100 ? `${C.green}12` : `${C.gold}12`,
          border: `1px solid ${msTotal > 100 ? C.red : msTotal === 100 ? C.green : C.gold}44`,
          color: msTotal > 100 ? C.red : msTotal === 100 ? C.green : C.gold,
        }}>
          Milestone total: {msTotal}%
          {msTotal > 100 ? ' ⚠ exceeds 100%'
           : msTotal === 100 ? ' ✓ fully allocated'
           : ` — ${100 - msTotal}% unallocated`}
        </div>
      </Section>

      {/* BlockBite Game Gate */}
      <Section title="Unlock Requirements">
        <GameGateCard
          enabled={gameGate} onChange={setGameGate}
          level={gameLevel} onLevelChange={setGameLevel}
        />
      </Section>

      {/* Warning */}
      <div style={{ padding: '11px 15px', borderRadius: 10,
        background: `${C.gold}0a`, border: `1px solid ${C.gold}33`,
        fontSize: 12, color: C.gold }}>
        ⚠ Creating a stream locks tokens into a Solana PDA vault via{' '}
        <code style={{ fontFamily: C.mono }}>create_stream()</code>.
        Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStreamCreate } from '@/lib/hooks/useStreamCreate';
import TokenSelector from '@/components/TokenSelector';
import DevnetFaucet from '@/components/DevnetFaucet';
import {
  C, Label, SInput, SSelect, SSlider, SToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
  FieldError, TxProgress, humanizeError, levelToTier,
} from '../_shared';

// ─── Milestone row ────────────────────────────────────────────────────────────
interface MS { label: string; amount: string; pct: number; }

function MilestoneRow({ m, i, onChange, color }: {
  m: MS; i: number;
  onChange: (field: keyof MS, v: string | number) => void;
  color: string;
}) {
  return (
    <div style={{ padding: '16px', borderRadius: 12, background: C.bg2, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: `color-mix(in srgb, ${color} 9%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 800, color, flexShrink: 0 }}>{i + 1}</div>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: C.serif }}>Milestone {i + 1}</span>
      </div>
      <SInput value={m.label} onChange={v => onChange('label', v)}
        placeholder="e.g. Token Launch, 10k Users, Product v1.0" mono={false} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Amount (tokens)</Label>
          <SInput value={m.amount} onChange={v => onChange('amount', v)}
            placeholder="e.g. 50000" type="number" prefix="◎" />
        </div>
        <div>
          <Label>% of total</Label>
          <SSlider label="" value={m.pct} onChange={v => onChange('pct', v)}
            min={0} max={100} unit="%" color={color} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MilestonePage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  const [token,      setToken]      = useState('');
  const [mintAddress, setMintAddress] = useState('');
  const [decimals,    setDecimals]    = useState(6);
  const [streamName, setStreamName]  = useState('');
  const [recipient,  setRecipient]  = useState('');
  const [cancelable, setCancelable] = useState(false);
  const [milestones, setMilestones] = useState<MS[]>([
    { label: '', amount: '', pct: 25 },
    { label: '', amount: '', pct: 25 },
    { label: '', amount: '', pct: 25 },
    { label: '', amount: '', pct: 25 },
  ]);
  const [msCount,    setMsCount]    = useState(2);
  const [gameGate,   setGameGate]   = useState(false);
  const [gameLevel,  setGameLevel]  = useState(15);
  const [fieldErrors,setFieldErrors]= useState<Record<string, string>>({});

  const COLOR   = C.blue;
  const visible = milestones.slice(0, msCount);
  const msTotal = visible.reduce((s, m) => s + m.pct, 0);
  const deposit = visible.reduce((s, m) => s + (Number(m.amount) || 0), 0);

  const updateMs = (i: number, field: keyof MS, v: string | number) =>
    setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: v } : m));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!token) errs.token = 'Select a token';
    if (true) {
      if (!recipient) {
        errs.recipient = 'Enter recipient wallet address';
      } else {
        try { new PublicKey(recipient); }
        catch { errs.recipient = 'Not a valid Solana address'; }
      }
    }
    if (deposit <= 0) errs.amount = 'Enter amounts for at least one milestone';
    if (msTotal > 100) errs.pct = `Milestone total is ${msTotal}% — must not exceed 100%`;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    if (!validate()) return;

    // Milestone stream: startTs = now, no cliff, end = 4 years (milestones trigger release)
    const startTs = Math.floor(Date.now() / 1000);
    const cliffTs = startTs;                       // no cliff — milestone triggers release
    const endTs   = startTs + 4 * 365 * 86400;    // 4-year horizon for on-chain PDA

    await submit({
      mintAddress,
      decimals,
      symbol: token,
      beneficiary:  recipient,
      amount:       String(deposit),
      startTs,
      cliffTs,
      endTs,
      name: streamName,
      requiredTier: gameGate ? levelToTier(gameLevel) : (msTotal > 0 ? 1 : 0),
    });
  };

  if (txStatus === 'done') return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: '0 24px' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>◎</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          {msCount} milestone gate{msCount > 1 ? 's' : ''} locked on Solana devnet.
          {gameGate && ` BlockBite Game Gate active at Level ${gameLevel}.`}
        </p>
        {txSig && (
          <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-green) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-green) 20%, transparent)', fontSize: 12 }}>
            <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank" rel="noreferrer" style={{ color: C.green, wordBreak: 'break-all' }}>
              {txSig} ↗
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/streams" style={{ padding: '11px 24px', borderRadius: 11, textDecoration: 'none',
            fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg,${COLOR},${C.accentDk})`, color: '#fff' }}>
            View Streams →</Link>
          <button onClick={reset} style={{ padding: '11px 24px', borderRadius: 11, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.03)', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: C.serif }}>
            Create Another</button>
        </div>
      </div>
    </main>
  );

  return (
    <StreamPageShell typeLabel="Milestone" typeIcon="◎" typeColor={COLOR}
      subtitle="Tokens unlock when the creator triggers each milestone. Not time-based."
      sidebar={
        <StreamSidebar typeLabel="Milestone" typeColor={COLOR} typeIcon="◎"
          totalDeposit={deposit} token={token || 'TOKEN'} recipientCount={recipient ? 1 : 0}
          gameGate={gameGate} gameLevel={gameLevel} onSubmit={handleCreate}
          isSubmitting={isSubmitting} txStatus={txStatus}
          txErr={txErr ? humanizeError(txErr) : null} />
      }
    >
      <DevnetFaucet />

      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and campaign settings</div>
        <div>
          <Label required>Token — Any SPL (devnet · mainnet · testnet · wrapped)</Label>
          <TokenSelector
            value={mintAddress}
            onChange={(mint, dec, sym) => { setMintAddress(mint); setDecimals(dec); setToken(sym); setFieldErrors(p => ({ ...p, token: '' })); }}
            isDevnet={true}
            error={fieldErrors.token}
          />
        </div>

        <div>
          <Label>Stream Name <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></Label>
          <SInput value={streamName}
            onChange={v => setStreamName(v.slice(0, 31))}
            placeholder="e.g. Milestone campaign — Phase 1"
            mono={false} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
            {streamName.length > 0
              ? `${streamName.length}/31 chars · stored on-chain as a 32-byte UTF-8 label`
              : 'Optional human-readable label stored on-chain (max 31 chars)'}
          </div>
        </div>

          <div>
            <Label required>Recipient</Label>
            <SInput value={recipient} onChange={v => { setRecipient(v); setFieldErrors(p => ({ ...p, recipient: '' })); }} placeholder="Solana wallet address…" />
            <FieldError msg={fieldErrors.recipient} />
            {!fieldErrors.recipient && <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>All milestones in this stream go to this recipient</div>}
          </div>
        <SToggle value={cancelable} onChange={setCancelable} label="Allow cancellation?" sub="Creator can cancel and reclaim unvested tokens." />
      </Section>

      <Section title="Milestone Configuration">
        <div style={{ fontSize: 12, color: C.muted }}>Define up to 4 milestones. Each unlocks a portion of tokens when verified on-chain.</div>
        <SSlider label="Number of Milestones" value={msCount} onChange={setMsCount}
          min={1} max={4} color={COLOR} note={`${msCount} milestone${msCount > 1 ? 's' : ''}`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((m, i) => (
            <MilestoneRow key={i} m={m} i={i} color={COLOR}
              onChange={(field, v) => updateMs(i, field, v)} />
          ))}
        </div>
        {fieldErrors.amount && <FieldError msg={fieldErrors.amount} />}
        {fieldErrors.pct    && <FieldError msg={fieldErrors.pct} />}
        <div style={{
          padding: '9px 13px', borderRadius: 9, fontSize: 12, fontFamily: C.mono,
          background: msTotal > 100 ? 'color-mix(in srgb, var(--p-red) 7%, transparent)' : msTotal === 100 ? 'color-mix(in srgb, var(--p-green) 7%, transparent)' : 'color-mix(in srgb, var(--p-gold) 7%, transparent)',
          border: `1px solid color-mix(in srgb, ${msTotal > 100 ? C.red : msTotal === 100 ? C.green : C.gold} 27%, transparent)`,
          color: msTotal > 100 ? C.red : msTotal === 100 ? C.green : C.gold,
        }}>
          Milestone total: {msTotal}%
          {msTotal > 100 ? ' ⚠ exceeds 100%' : msTotal === 100 ? ' ✓ fully allocated' : ` — ${100 - msTotal}% unallocated`}
        </div>
      </Section>

      <Section title="Unlock Requirements">
        <GameGateCard enabled={gameGate} onChange={setGameGate} level={gameLevel} onLevelChange={setGameLevel} />
      </Section>

      {(isSubmitting || txStatus === 'error') && (
        <TxProgress status={txStatus} sig={txSig} error={txErr ? humanizeError(txErr) : null} />
      )}

      <div style={{ padding: '11px 15px', borderRadius: 10, background: 'color-mix(in srgb, var(--p-gold) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-gold) 20%, transparent)', fontSize: 12, color: C.gold }}>
        ⚠ Creating a stream locks tokens into a Solana PDA vault via{' '}
        <code style={{ fontFamily: C.mono }}>create_stream()</code>. Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}






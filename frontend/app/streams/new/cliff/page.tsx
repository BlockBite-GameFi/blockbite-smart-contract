'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStreamCreate } from '@/lib/hooks/useStreamCreate';
import {
  C, Label, SInput, SSelect, SToggle, ManualCsvToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
  FieldError, TxProgress, humanizeError, levelToTier,
} from '../_shared';

export default function CliffPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  const [mode,       setMode]       = useState<'manual' | 'csv'>('manual');
  const [token,      setToken]      = useState('');
  const [recipient,  setRecipient]  = useState('');
  const [amount,     setAmount]     = useState('');
  const [cliffDate,  setCliffDate]  = useState('');
  const [cancelable, setCancelable] = useState(false);
  const [gameGate,   setGameGate]   = useState(false);
  const [gameLevel,  setGameLevel]  = useState(10);
  const [fieldErrors,setFieldErrors]= useState<Record<string, string>>({});

  const COLOR   = C.gold;
  const deposit = Number(amount) || 0;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!token) errs.token = 'Select a token';
    if (mode === 'manual') {
      if (!recipient) {
        errs.recipient = 'Enter recipient wallet address';
      } else {
        try { new PublicKey(recipient); }
        catch { errs.recipient = 'Not a valid Solana address'; }
      }
      if (!amount || Number(amount) <= 0) errs.amount = 'Enter an amount greater than 0';
    }
    if (!cliffDate) {
      errs.cliffDate = 'Select a cliff date';
    } else if (new Date(cliffDate).getTime() <= Date.now()) {
      errs.cliffDate = 'Cliff date must be in the future';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    if (!validate()) return;
    const startTs = Math.floor(Date.now() / 1000);
    const cliffTs = Math.floor(new Date(cliffDate).getTime() / 1000);
    const endTs   = cliffTs + 1; // instant full release at cliff
    await submit({ beneficiary: recipient, token, amount, startTs, cliffTs, endTs,
      requiredTier: gameGate ? levelToTier(gameLevel) : 0 });
  };

  if (txStatus === 'done') return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: '0 24px' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>⌐</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Cliff vesting locked until <strong style={{ color: C.gold }}>
            {cliffDate ? new Date(cliffDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          </strong>.{gameGate && ` BlockBite Game Gate active at Level ${gameLevel}.`}
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
    <StreamPageShell typeLabel="Cliff" typeIcon="⌐" typeColor={COLOR}
      subtitle="All tokens lock until cliff date. Nothing before, everything after."
      sidebar={
        <StreamSidebar typeLabel="Cliff" typeColor={COLOR} typeIcon="⌐"
          totalDeposit={deposit} token={token || 'TOKEN'} recipientCount={recipient ? 1 : 0}
          gameGate={gameGate} gameLevel={gameLevel} onSubmit={handleCreate}
          isSubmitting={isSubmitting} txStatus={txStatus}
          txErr={txErr ? humanizeError(txErr) : null} />
      }
    >
      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>
        <ManualCsvToggle mode={mode} onChange={setMode} />
        <div>
          <Label required>Token</Label>
          <SSelect value={token} onChange={v => { setToken(v); setFieldErrors(p => ({ ...p, token: '' })); }}
            placeholder="Select Token"
            options={[{ v: 'BBT', l: 'BBT — BlockBite Token' }, { v: 'USDC', l: 'USDC' }, { v: 'SOL', l: 'SOL (wrapped)' }]} />
          <FieldError msg={fieldErrors.token} />
        </div>
        {mode === 'manual' && (<>
          <div>
            <Label required>Recipient</Label>
            <SInput value={recipient} onChange={v => { setRecipient(v); setFieldErrors(p => ({ ...p, recipient: '' })); }} placeholder="Solana wallet address…" />
            <FieldError msg={fieldErrors.recipient} />
            {!fieldErrors.recipient && <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>All locked tokens will release to this wallet at cliff date</div>}
          </div>
          <div>
            <Label required>Total Amount</Label>
            <SInput value={amount} onChange={v => { setAmount(v); setFieldErrors(p => ({ ...p, amount: '' })); }} placeholder="e.g. 500000" type="number" prefix="◎" />
            <FieldError msg={fieldErrors.amount} />
          </div>
        </>)}
        {mode === 'csv' && (
          <div style={{ padding: '20px', borderRadius: 11, border: `1px dashed ${C.border}`, textAlign: 'center', color: C.muted, fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, color: '#e8e1f8', marginBottom: 4 }}>Upload CSV</div>
            <div style={{ fontSize: 11.5 }}>wallet,amount columns · one recipient per row</div>
            <button style={{ marginTop: 12, padding: '8px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg2, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: C.serif }}>Choose File</button>
          </div>
        )}
        <SToggle value={cancelable} onChange={setCancelable} label="Allow cancellation?" sub="Creator can cancel and reclaim tokens before cliff date." />
      </Section>

      <Section title="Cliff Schedule">
        <div style={{ fontSize: 12, color: C.muted }}>Tokens are locked completely until the cliff date, then released all at once.</div>
        <div>
          <Label required>Cliff Date</Label>
          <SInput value={cliffDate} onChange={v => { setCliffDate(v); setFieldErrors(p => ({ ...p, cliffDate: '' })); }} type="date" placeholder="" />
          <FieldError msg={fieldErrors.cliffDate} />
        </div>
        {cliffDate && deposit > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Locked amount', v: `${deposit.toLocaleString()} ${token || 'TOKEN'}`, c: COLOR  },
              { l: 'Unlocks on',    v: new Date(cliffDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), c: C.muted },
              { l: 'Lock type',     v: 'Full cliff — instant release', c: C.muted },
              { l: 'Stream type',   v: 'Cliff vesting',                c: COLOR   },
            ].map(r => (
              <div key={r.l} style={{ padding: '10px 12px', borderRadius: 9, background: `color-mix(in srgb, ${COLOR} 3%, transparent)`, border: `1px solid color-mix(in srgb, ${COLOR} 13%, transparent)` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{r.l}</div>
                <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: r.c }}>{r.v}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Unlock Requirements">
        <GameGateCard enabled={gameGate} onChange={setGameGate} level={gameLevel} onLevelChange={setGameLevel} />
      </Section>

      {(isSubmitting || txStatus === 'error') && (
        <TxProgress status={txStatus} sig={txSig} error={txErr ? humanizeError(txErr) : null} />
      )}

      <div style={{ padding: '11px 15px', borderRadius: 10, background: 'color-mix(in srgb, var(--p-gold) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-gold) 20%, transparent)', fontSize: 12, color: C.gold }}>
        ⚠ Cliff streams lock tokens until the specified date. Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}

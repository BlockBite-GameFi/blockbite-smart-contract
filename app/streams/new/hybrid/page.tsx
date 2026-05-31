'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStreamCreate } from '@/lib/hooks/useStreamCreate';
import {
  C, Label, SInput, SSlider, SToggle, ManualCsvToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
  FieldError, TxProgress, humanizeError, levelToTier,
} from '../_shared';
import TokenSelector from '@/components/TokenSelector';

export default function HybridPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  const [mode,       setMode]       = useState<'manual' | 'csv'>('manual');
  const [tokenMint, setTokenMint] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [recipient,  setRecipient]  = useState('');
  const [amount,     setAmount]     = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [cliffDays,  setCliffDays]  = useState(90);
  const [vestDays,   setVestDays]   = useState(365);
  const [cancelable, setCancelable] = useState(false);
  const [msCount,    setMsCount]    = useState(2);
  const [msPcts,     setMsPcts]     = useState([20, 20, 10, 10]);
  const [gameGate,   setGameGate]   = useState(false);
  const [gameLevel,  setGameLevel]  = useState(20);
  const [fieldErrors,setFieldErrors]= useState<Record<string, string>>({});

  const COLOR    = '#c084fc';
  const deposit  = Number(amount) || 0;
  const msGated  = msPcts.slice(0, msCount).reduce((s, p) => s + p, 0);
  const linRem   = Math.max(0, 100 - msGated);
  const daily    = vestDays > 0 ? ((deposit * linRem / 100) / vestDays).toFixed(2) : '0';

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!tokenMint) errs.token = 'Select a token';
    if (mode === 'manual') {
      if (!recipient) {
        errs.recipient = 'Enter recipient wallet address';
      } else {
        try { new PublicKey(recipient); }
        catch { errs.recipient = 'Not a valid Solana address'; }
      }
      if (!amount || Number(amount) <= 0) errs.amount = 'Enter an amount greater than 0';
    }
    if (!startDate) errs.startDate = 'Select a start date';
    if (msGated > 100) errs.milestones = `Milestone total is ${msGated}% — must not exceed 100%`;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    if (!validate()) return;
    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const cliffTs = startTs + cliffDays * 86400;
    const endTs   = cliffTs + vestDays * 86400;
    await submit({
      beneficiary:  recipient,
      mint:         tokenMint,
      symbol:       tokenSymbol,
      decimals:     tokenDecimals,
      amount,
      startTs,
      cliffTs,
      endTs,
      requiredTier: gameGate ? levelToTier(gameLevel) : (msGated > 0 ? 1 : 0),
    });
  };

  if (txStatus === 'done') return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: '0 24px' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>◆</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Hybrid vesting active — <strong style={{ color: COLOR }}>{msGated}% milestone-gated</strong>,{' '}
          <strong style={{ color: C.accent }}>{linRem}% linear</strong>.
          {gameGate && ` BlockBite Game Gate at Level ${gameLevel}.`}
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
    <StreamPageShell typeLabel="Hybrid" typeIcon="◆" typeColor={COLOR}
      subtitle="Cliff + milestone + linear combined. Most flexible token distribution model."
      sidebar={
        <StreamSidebar typeLabel="Hybrid" typeColor={COLOR} typeIcon="◆"
          totalDeposit={deposit} token={tokenSymbol || 'TOKEN'} recipientCount={recipient ? 1 : 0}
          gameGate={gameGate} gameLevel={gameLevel} onSubmit={handleCreate}
          isSubmitting={isSubmitting} txStatus={txStatus}
          txErr={txErr ? humanizeError(txErr) : null} />
      }
    >
      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>
        <ManualCsvToggle mode={mode} onChange={setMode} />
        <div>
          <Label required>Token — any SPL (devnet · mainnet · testnet · wrapped)</Label>
          <TokenSelector
            value={tokenMint}
            onChange={(mint, sym, dec) => {
              setTokenMint(mint); setTokenSymbol(sym); setTokenDecimals(dec);
              setFieldErrors(p => ({ ...p, token: '' }));
            }}
            disabled={isSubmitting}
          />
          {tokenMint && <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: C.mono }}>
            Mint: {tokenMint.slice(0, 20)}… · {tokenDecimals} decimals
          </div>}
          <FieldError msg={fieldErrors.token} />
        </div>
        {mode === 'manual' && (<>
          <div>
            <Label required>Recipient</Label>
            <SInput value={recipient} onChange={v => { setRecipient(v); setFieldErrors(p => ({ ...p, recipient: '' })); }} placeholder="Solana wallet address…" />
            <FieldError msg={fieldErrors.recipient} />
          </div>
          <div>
            <Label required>Total Amount</Label>
            <SInput value={amount} onChange={v => { setAmount(v); setFieldErrors(p => ({ ...p, amount: '' })); }} placeholder="e.g. 2000000" type="number" prefix="◎" />
            <FieldError msg={fieldErrors.amount} />
          </div>
        </>)}
        {mode === 'csv' && (
          <div style={{ padding: '20px', borderRadius: 11, border: `1px dashed ${C.border}`, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, color: '#e8e1f8', marginBottom: 4 }}>Upload CSV</div>
            <div style={{ fontSize: 11.5 }}>wallet,amount columns · one recipient per row</div>
            <button style={{ marginTop: 12, padding: '8px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg2, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: C.serif }}>Choose File</button>
          </div>
        )}
        <SToggle value={cancelable} onChange={setCancelable} label="Allow cancellation?" sub="Creator can cancel and reclaim unvested tokens after a 7-day grace period." />
      </Section>

      <Section title="Linear Schedule">
        <div>
          <Label required>Start Date</Label>
          <SInput value={startDate} onChange={v => { setStartDate(v); setFieldErrors(p => ({ ...p, startDate: '' })); }} type="date" placeholder="" />
          <FieldError msg={fieldErrors.startDate} />
        </div>
        <SSlider label="Cliff Period" value={cliffDays} onChange={setCliffDays}
          min={0} max={730} unit=" days" color={C.ember}
          note={cliffDays === 0 ? 'No cliff' : `Cliff: Day ${cliffDays}`} />
        <SSlider label="Vesting Duration" value={vestDays} onChange={setVestDays}
          min={30} max={1460} unit=" days" color={C.accent}
          note={`Full vest: Day ${cliffDays + vestDays}`} />
      </Section>

      <Section title="Milestone Gates">
        <div style={{ fontSize: 12, color: C.muted }}>Milestone gates release a percentage of tokens on-chain trigger. The remainder vests linearly.</div>
        <SSlider label="Milestone count" value={msCount} onChange={setMsCount} min={1} max={4} color={COLOR} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: msCount }, (_, i) => (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 11, background: C.bg2,
              border: `1px solid color-mix(in srgb, ${COLOR} 20%, transparent)`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: `color-mix(in srgb, ${COLOR} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${COLOR} 27%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: COLOR }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <SSlider label={`Milestone ${i + 1} — % release`} value={msPcts[i]} color={COLOR}
                  onChange={v => setMsPcts(p => p.map((x, idx) => idx === i ? v : x))}
                  min={0} max={50} unit="%" />
              </div>
            </div>
          ))}
        </div>
        {fieldErrors.milestones && <FieldError msg={fieldErrors.milestones} />}
        <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,.02)',
          border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: C.muted }}>Milestone-gated</span>
            <span style={{ fontFamily: C.mono, fontWeight: 700, color: COLOR }}>{msGated}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: C.muted }}>Linear remainder</span>
            <span style={{ fontFamily: C.mono, fontWeight: 700, color: C.accent }}>{linRem}%</span>
          </div>
          {deposit > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: C.muted }}>Linear daily rate</span>
              <span style={{ fontFamily: C.mono, fontWeight: 700, color: C.green }}>{daily} {tokenSymbol || 'T'}/day</span>
            </div>
          )}
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
            <div style={{ width: `${msGated}%`, height: '100%', background: COLOR, borderRadius: 99, transition: 'width .3s' }} />
          </div>
        </div>
      </Section>

      <Section title="Unlock Requirements">
        <GameGateCard enabled={gameGate} onChange={setGameGate} level={gameLevel} onLevelChange={setGameLevel} />
      </Section>

      {(isSubmitting || txStatus === 'error') && (
        <TxProgress status={txStatus} sig={txSig} error={txErr ? humanizeError(txErr) : null} />
      )}

      <div style={{ padding: '11px 15px', borderRadius: 10, background: 'color-mix(in srgb, var(--p-gold) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-gold) 20%, transparent)', fontSize: 12, color: C.gold }}>
        ⚠ Hybrid streams combine cliff, milestone, and linear mechanics in one PDA vault. Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}

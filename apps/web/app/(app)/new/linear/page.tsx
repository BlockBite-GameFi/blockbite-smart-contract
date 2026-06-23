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
  MultisigAuthorityField,
} from '../_shared';

export default function LinearPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  // Universal token — any SPL mint on any network
  const [token,      setToken]      = useState('');      // display symbol
  const [mintAddress,setMintAddress]= useState('');      // actual mint pubkey
  const [decimals,   setDecimals]   = useState(6);       // fetched from chain
  const [streamName,setStreamName] = useState('');      // optional 32-byte on-chain label
  const [recipient,  setRecipient]  = useState('');
  const [amount,     setAmount]     = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [cliffDays,  setCliffDays]  = useState(30);
  const [vestDays,   setVestDays]   = useState(365);
  const [cancelable,       setCancelable]       = useState(false);
  const [gameGate,         setGameGate]         = useState(false);
  const [gameLevel,        setGameLevel]        = useState(10);
  const [multisigAuthority,setMultisigAuthority]= useState('');
  const [fieldErrors,      setFieldErrors]      = useState<Record<string, string>>({});

  const COLOR   = C.accent;
  const deposit = Number(amount) || 0;
  const daily   = vestDays > 0 ? (deposit / vestDays).toFixed(2) : '0';
  const perSec  = vestDays > 0 ? (deposit / (vestDays * 86400)).toFixed(6) : '0';

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!token) errs.token = 'Select a token';
    if (true) {
      if (!recipient) {
        errs.recipient = 'Enter recipient wallet address';
      } else {
        try { new PublicKey(recipient); }
        catch { errs.recipient = 'Not a valid Solana address (check for typos)'; }
      }
      if (!amount || Number(amount) <= 0) errs.amount = 'Enter an amount greater than 0';
    }
    if (!startDate) errs.startDate = 'Select a start date';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    if (!validate()) return;

    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    // cliffTs = 0 means "no cliff" in the on-chain program (pure linear)
    // cliffTs = startTs + cliffDays * 86400 means cliff-gated
    const cliffTs = cliffDays === 0 ? 0 : startTs + cliffDays * 86400;
    const endTs   = cliffDays === 0
      ? startTs + vestDays * 86400
      : cliffTs + vestDays * 86400;

    await submit({
      mintAddress,
      decimals,
      symbol: token,
      beneficiary: recipient,
      amount,
      startTs,
      cliffTs,
      endTs,
      name: streamName,
      requiredTier: gameGate ? levelToTier(gameLevel) : 0,
    });
  };

  /* ─── Success screen ──────────────────────────────────────────────── */
  if (txStatus === 'done') return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: '0 24px' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>∿</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Linear vesting active — <strong style={{ color: COLOR }}>{daily} {token}/day</strong> unlock rate.
          {gameGate && ` BlockBite Game Gate active at Level ${gameLevel}.`}
        </p>
        {txSig && (
          <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--p-green) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-green) 20%, transparent)', fontSize: 12 }}>
            <span style={{ color: C.muted }}>Tx: </span>
            <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank" rel="noreferrer" style={{ color: C.green, wordBreak: 'break-all' }}>
              {txSig} ↗
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/streams" style={{
            padding: '11px 24px', borderRadius: 11, textDecoration: 'none', fontWeight: 700, fontSize: 13,
            background: `linear-gradient(135deg,${COLOR},${C.accentDk})`, color: '#fff',
          }}>View Streams →</Link>
          <button onClick={reset} style={{
            padding: '11px 24px', borderRadius: 11, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.03)', color: C.muted, fontSize: 13,
            cursor: 'pointer', fontFamily: C.serif,
          }}>Create Another</button>
        </div>
      </div>
    </main>
  );

  /* ─── Main form ───────────────────────────────────────────────────── */
  return (
    <StreamPageShell
      typeLabel="Linear" typeIcon="∿" typeColor={COLOR}
      subtitle="Tokens release gradually from cliff date to end date. Smooth, proportional unlock."
      sidebar={
        <StreamSidebar
          typeLabel="Linear" typeColor={COLOR} typeIcon="∿"
          totalDeposit={deposit} token={token || 'TOKEN'}
          recipientCount={recipient ? 1 : 0}
          gameGate={gameGate} gameLevel={gameLevel}
          multisigAuthority={multisigAuthority}
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
          txStatus={txStatus}
          txErr={txErr ? humanizeError(txErr) : null}
        />
      }
    >
      {/* Devnet faucet — shows when on devnet */}
      <DevnetFaucet />

      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>

        <div>
          <Label required>Token — Any SPL (devnet · mainnet · testnet · wrapped)</Label>
          <TokenSelector
            value={mintAddress}
            onChange={(mint, dec, sym) => {
              setMintAddress(mint);
              setDecimals(dec);
              setToken(sym);
              setFieldErrors(p => ({ ...p, token: '' }));
            }}
            isDevnet={true}
            error={fieldErrors.token}
          />
          {mintAddress && (
            <div style={{ fontSize: 10, color: '#666', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
              Mint: {mintAddress.slice(0,16)}… · {decimals} decimals
            </div>
          )}
        </div>

        <div>
          <Label>Stream Name <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></Label>
          <SInput value={streamName}
            onChange={v => setStreamName(v.slice(0, 31))}
            placeholder="e.g. Team Salary Q3 2026"
            mono={false} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
            {streamName.length > 0
              ? `${streamName.length}/31 chars · stored on-chain as a 32-byte UTF-8 label`
              : 'Optional human-readable label stored on-chain (max 31 chars)'}
          </div>
        </div>

        <div>
              <Label required>Recipient</Label>
              <SInput value={recipient}
                onChange={v => { setRecipient(v); setFieldErrors(p => ({ ...p, recipient: '' })); }}
                placeholder="Solana wallet address…" />
              <FieldError msg={fieldErrors.recipient} />
              {!fieldErrors.recipient && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
                  Tokens unlock continuously to this wallet from cliff to end date
                </div>
              )}
            </div>
            <div>
              <Label required>Total Amount</Label>
              <SInput value={amount}
                onChange={v => { setAmount(v); setFieldErrors(p => ({ ...p, amount: '' })); }}
                placeholder="e.g. 1000000" type="number" prefix="◎" />
              <FieldError msg={fieldErrors.amount} />
            </div>


        <SToggle value={cancelable} onChange={setCancelable}
          label="Allow cancellation?"
          sub="Creator can cancel and reclaim unvested tokens after a 7-day grace period." />
      </Section>

      <Section title="Vesting Schedule">
        <div style={{ fontSize: 12, color: C.muted }}>
          Tokens unlock continuously over time, from cliff date to end date.
        </div>
        <div>
          <Label required>Start Date</Label>
          <SInput value={startDate}
            onChange={v => { setStartDate(v); setFieldErrors(p => ({ ...p, startDate: '' })); }}
            type="date" placeholder="" />
          <FieldError msg={fieldErrors.startDate} />
        </div>
        <SSlider label="Cliff Period" value={cliffDays} onChange={setCliffDays}
          min={0} max={730} unit=" days" color={C.ember}
          note={cliffDays === 0 ? 'No cliff' : `Cliff: Day ${cliffDays}`} />
        <SSlider label="Vesting Duration" value={vestDays} onChange={setVestDays}
          min={30} max={1460} unit=" days" color={COLOR}
          note={`Completes: Day ${cliffDays + vestDays}`} />
        {deposit > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Cliff unlock',  v: `Day ${cliffDays}`,            c: C.ember  },
              { l: 'Fully vested',  v: `Day ${cliffDays + vestDays}`, c: COLOR    },
              { l: 'Daily rate',    v: `${daily} ${token || 'T'}/day`,c: C.green  },
              { l: 'Per second',    v: `${perSec} T/s`,               c: C.blue   },
            ].map(r => (
              <div key={r.l} style={{ padding: '10px 12px', borderRadius: 9,
                background: `color-mix(in srgb, ${r.c} 3%, transparent)`, border: `1px solid color-mix(in srgb, ${r.c} 13%, transparent)` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{r.l}</div>
                <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: r.c }}>{r.v}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Unlock Requirements">
        <GameGateCard enabled={gameGate} onChange={setGameGate}
          level={gameLevel} onLevelChange={setGameLevel} />
      </Section>

      <Section title="Clawback &amp; Authority">
        <MultisigAuthorityField
          value={multisigAuthority}
          onChange={setMultisigAuthority}
        />
      </Section>

      {/* 3-stage TX progress */}
      {(isSubmitting || txStatus === 'error') && (
        <TxProgress status={txStatus} sig={txSig} error={txErr ? humanizeError(txErr) : null} />
      )}

      <div style={{ padding: '11px 15px', borderRadius: 10,
        background: 'color-mix(in srgb, var(--p-gold) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-gold) 20%, transparent)', fontSize: 12, color: C.gold }}>
        ⚠ Linear streams lock tokens into a PDA vault. Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}



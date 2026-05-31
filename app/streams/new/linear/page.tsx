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
  MultisigAuthorityField,
  CsvUploader, CsvRow, parseCsv,
} from '../_shared';
import TokenSelector from '@/components/TokenSelector';

/** Devnet helper — shows faucet links and "Get Test Tokens" button */
function DevnetFaucet({ token, mint }: { walletAddress?: string; token: string; mint?: string }) {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isSol = token.toUpperCase() === 'SOL' || mint === 'SOL';
  const needsSolFaucet = !token || isSol;

  async function getTestTokens() {
    if (!publicKey) { setMsg('Connect your wallet first'); return; }
    setLoading(true); setMsg(null);
    try {
      const body: Record<string, string> = { wallet: publicKey.toBase58() };
      if (mint && mint !== 'SOL') body.mint = mint;
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(`✗ ${data.error}`); return; }
      setMsg(`✓ Sent 10,000 ${token || 'BBT'} to your wallet! TX: ${data.signature?.slice(0, 8)}...`);
    } catch { setMsg('✗ Faucet request failed'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: '12px 15px', borderRadius: 10, marginBottom: 8,
      background: 'color-mix(in srgb, var(--p-accent) 5%, transparent)',
      border: '1px solid color-mix(in srgb, var(--p-accent) 20%, transparent)',
      fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: 'var(--p-accent)', marginBottom: 6 }}>
        🧪 Devnet Test Tokens
      </div>
      <div style={{ color: 'var(--p-muted)', marginBottom: 8, lineHeight: 1.6 }}>
        {needsSolFaucet
          ? 'Need devnet SOL for gas fees: '
          : `Need devnet ${token || 'BBT/USDC'} tokens: `}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer"
          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--p-accent) 35%, transparent)',
            color: 'var(--p-accent)', textDecoration: 'none', fontSize: 11, fontWeight: 600 }}>
          Get devnet SOL ↗
        </a>
        {!isSol && (
          <button type="button" onClick={getTestTokens} disabled={loading}
            style={{ padding: '5px 12px', borderRadius: 6, cursor: loading ? 'default' : 'pointer',
              background: loading ? 'transparent' : 'color-mix(in srgb, var(--p-accent) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--p-accent) 40%, transparent)',
              color: 'var(--p-accent)', fontSize: 11, fontWeight: 600 }}>
            {loading ? 'Sending...' : `Get 10,000 devnet ${token || 'BBT'}`}
          </button>
        )}
      </div>
      {msg && (
        <div style={{ marginTop: 6, fontSize: 11,
          color: msg.startsWith('✓') ? 'var(--p-green)' : 'var(--p-red)' }}>
          {msg}
        </div>
      )}
    </div>
  );
}

export default function LinearPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  const [mode,          setMode]         = useState<'manual' | 'csv'>('manual');
  const [tokenMint,     setTokenMint]    = useState('');
  const [tokenSymbol,   setTokenSymbol]  = useState('');
  const [tokenDecimals, setTokenDecimals]= useState(6);
  const [recipient,     setRecipient]    = useState('');
  const [amount,     setAmount]     = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [cliffDays,  setCliffDays]  = useState(30);
  const [vestDays,   setVestDays]   = useState(365);
  const [cancelable,       setCancelable]       = useState(false);
  const [gameGate,         setGameGate]         = useState(false);
  const [gameLevel,        setGameLevel]        = useState(10);
  const [multisigAuthority,setMultisigAuthority]= useState('');
  const [fieldErrors,      setFieldErrors]      = useState<Record<string, string>>({});
  // CSV state
  const [csvRows,  setCsvRows]  = useState<CsvRow[]>([]);
  const [csvErrs,  setCsvErrs]  = useState<string[]>([]);
  const [csvFile,  setCsvFile]  = useState<string | null>(null);
  const [batchIdx, setBatchIdx] = useState(0);
  const [batchDone,setBatchDone]= useState<string[]>([]);
  const [batchFail,setBatchFail]= useState<string[]>([]);

  const COLOR   = C.accent;
  const deposit = Number(amount) || 0;
  const daily   = vestDays > 0 ? (deposit / vestDays).toFixed(2) : '0';
  const perSec  = vestDays > 0 ? (deposit / (vestDays * 86400)).toFixed(6) : '0';

  const totalDeposit = mode === 'manual' ? (Number(amount) || 0)
    : csvRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const recipientCount = mode === 'manual' ? (recipient ? 1 : 0) : csvRows.length;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!tokenMint) errs.token = 'Select a token';
    if (mode === 'manual') {
      if (!recipient) {
        errs.recipient = 'Enter recipient wallet address';
      } else {
        try { new PublicKey(recipient); }
        catch { errs.recipient = 'Not a valid Solana address (check for typos)'; }
      }
      if (!amount || Number(amount) <= 0) errs.amount = 'Enter an amount greater than 0';
    } else {
      if (csvRows.length === 0) errs.csv = 'Upload a CSV file with wallet and amount columns';
    }
    if (!startDate) errs.startDate = 'Select a start date';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    if (!validate()) return;

    const startTs = Math.floor(new Date(startDate).getTime() / 1000);
    const cliffTs = startTs + cliffDays * 86400;
    const endTs   = cliffTs + vestDays * 86400;

    if (mode === 'manual') {
      await submit({ beneficiary: recipient, mint: tokenMint, symbol: tokenSymbol,
        decimals: tokenDecimals, amount, startTs, cliffTs, endTs,
        requiredTier: gameGate ? levelToTier(gameLevel) : 0 });
      return;
    }
    // CSV batch
    const done: string[] = [...batchDone];
    const fail: string[] = [...batchFail];
    for (let i = batchIdx; i < csvRows.length; i++) {
      setBatchIdx(i);
      const row = csvRows[i];
      const ok  = await submit({ beneficiary: row.wallet, mint: tokenMint, symbol: tokenSymbol,
        decimals: tokenDecimals, amount: row.amount, startTs, cliffTs, endTs,
        requiredTier: gameGate ? levelToTier(gameLevel) : 0 });
      if (ok) { done.push(row.wallet); setBatchDone([...done]); }
      else     { fail.push(row.wallet); setBatchFail([...fail]); }
      reset();
    }
    setBatchIdx(csvRows.length);
    // keep unused variable warning away
    void parseCsv;
  };

  /* ─── Success screen ──────────────────────────────────────────────── */
  if (txStatus === 'done') return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: '0 24px' }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>∿</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Linear vesting active — <strong style={{ color: COLOR }}>{daily} {tokenSymbol}/day</strong> unlock rate.
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
          totalDeposit={totalDeposit} token={tokenSymbol || 'TOKEN'}
          recipientCount={recipientCount}
          gameGate={gameGate} gameLevel={gameLevel}
          multisigAuthority={multisigAuthority}
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
          txStatus={txStatus}
          txErr={txErr ? humanizeError(txErr) : null}
        />
      }
    >
      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>
        <ManualCsvToggle mode={mode} onChange={setMode} />

        <div>
          <Label required>Token — select from wallet or paste any SPL mint</Label>
          <TokenSelector
            value={tokenMint}
            onChange={(mint, sym, dec) => {
              setTokenMint(mint);
              setTokenSymbol(sym);
              setTokenDecimals(dec);
              setFieldErrors(p => ({ ...p, token: '' }));
            }}
            disabled={isSubmitting}
          />
          <FieldError msg={fieldErrors.token} />
        </div>

        {mode === 'manual' && (
          <>
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
          </>
        )}

        {mode === 'csv' && (
          <div>
            <CsvUploader
              rows={csvRows} errors={csvErrs} fileName={csvFile}
              onParsed={(r, e, n) => { setCsvRows(r); setCsvErrs(e); setCsvFile(n); setBatchDone([]); setBatchFail([]); setBatchIdx(0); }}
              tokenSymbol={tokenSymbol}
              batchIdx={batchIdx} batchDone={batchDone} batchFail={batchFail}
              isSubmitting={isSubmitting}
            />
            <FieldError msg={fieldErrors.csv} />
          </div>
        )}

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
              { l: 'Daily rate',    v: `${daily} ${tokenSymbol || 'T'}/day`, c: C.green },
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

      {/* Devnet faucet helper */}
      <DevnetFaucet walletAddress={undefined} token={tokenSymbol} mint={tokenMint} />

      <div style={{ padding: '11px 15px', borderRadius: 10,
        background: 'color-mix(in srgb, var(--p-gold) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--p-gold) 20%, transparent)', fontSize: 12, color: C.gold }}>
        ⚠ Linear streams lock tokens into a PDA vault. Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}

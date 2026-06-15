'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStreamCreate } from '@/lib/hooks/useStreamCreate';
import TokenSelector from '@/components/TokenSelector';
import DevnetFaucet from '@/components/DevnetFaucet';
import {
  C, Label, SInput, SSelect, SToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
  FieldError, TxProgress, humanizeError, levelToTier,
} from '../_shared';

// ─── CSV parsing ─────────────────────────────────────────────────────────────
// Expected CSV format:
//   wallet,amount
//   7xKXt...,500
//   9mPLY...,1000
// OR with header row:
//   recipient,amount
//   7xKXt...,500
function parseCsv(text: string): { wallet: string; amount: string }[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  const results: { wallet: string; amount: string }[] = [];
  for (const line of lines) {
    const [col0, col1] = line.split(',').map(s => s.trim());
    if (!col0 || !col1) continue;
    // Skip header row
    if (['wallet','recipient','address','to'].includes(col0.toLowerCase())) continue;
    if (isNaN(Number(col1)) || Number(col1) <= 0) continue;
    results.push({ wallet: col0, amount: col1 });
  }
  return results;
}

const SAMPLE_CSV = `wallet,amount
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU,500
9mPLYVgXuKQdDjadZuNhTBdKqMTZ2knY7tUGGmBhYB3b,1000
Hk9Jj3DuRBFxSWZUkMTH4ufHJqVHvH4YVXY1FeaGHpL,250`;

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'blockbite-cliff-stream-sample.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function CliffPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  const [token,      setToken]      = useState('');
  const [mintAddress, setMintAddress] = useState('');
  const [decimals,    setDecimals]    = useState(6);
  const [streamName,  setStreamName]  = useState('');
  const [recipient,  setRecipient]  = useState('');
  const [amount,     setAmount]     = useState('');
  const [cliffDate,  setCliffDate]  = useState('');
  const [cancelable, setCancelable] = useState(false);
  const [gameGate,   setGameGate]   = useState(false);
  const [gameLevel,  setGameLevel]  = useState(10);
  const [fieldErrors,setFieldErrors]= useState<Record<string, string>>({});
  const [csvMode,    setCsvMode]    = useState(false);
  const [csvRows,    setCsvRows]    = useState<{ wallet: string; amount: string }[]>([]);
  const [csvError,   setCsvError]   = useState('');
  const [csvDone,    setCsvDone]    = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const COLOR   = C.gold;
  const deposit = Number(amount) || 0;

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

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setCsvError('No valid rows found. Expected format: wallet,amount (one per line)');
        setCsvRows([]);
      } else {
        setCsvError('');
        setCsvRows(rows);
      }
    };
    reader.readAsText(file);
  }

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    if (!validate()) return;
    const startTs = Math.floor(Date.now() / 1000);
    const cliffTs = Math.floor(new Date(cliffDate).getTime() / 1000);
    const endTs   = cliffTs + 1; // instant full release at cliff

    if (csvMode && csvRows.length > 0) {
      // Batch mode — submit one stream per CSV row
      setCsvDone(0);
      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        const ok = await submit({
          mintAddress, decimals, symbol: token,
          beneficiary: row.wallet,
          amount: row.amount,
          startTs, cliffTs, endTs,
          name: streamName ? `${streamName} #${i + 1}` : '',
          requiredTier: gameGate ? levelToTier(gameLevel) : 0,
        });
        if (ok) setCsvDone(d => d + 1);
        else break; // stop on first error
      }
    } else {
      await submit({ mintAddress, decimals, symbol: token, beneficiary: recipient, amount, startTs, cliffTs, endTs,
        name: streamName,
        requiredTier: gameGate ? levelToTier(gameLevel) : 0 });
    }
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
          totalDeposit={csvMode && csvRows.length > 0
            ? csvRows.reduce((s, r) => s + Number(r.amount), 0)
            : deposit}
          token={token || 'TOKEN'}
          recipientCount={csvMode && csvRows.length > 0 ? csvRows.length : (recipient ? 1 : 0)}
          gameGate={gameGate} gameLevel={gameLevel} onSubmit={handleCreate}
          isSubmitting={isSubmitting} txStatus={txStatus}
          txErr={txErr ? humanizeError(txErr) : null} />
      }
    >
      <DevnetFaucet />

      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>
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
          <Label>Stream Name</Label>
          <SInput value={streamName} onChange={v => setStreamName(v.slice(0, 31))}
            placeholder="e.g. Cliff vesting Q2 2026" />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
            Optional label ({streamName.length}/31)
          </div>
        </div>
        {/* ── Mode toggle: Manual vs CSV batch ── */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => setCsvMode(false)}
            style={{
              padding: '5px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: !csvMode ? `color-mix(in srgb, ${COLOR} 18%, transparent)` : 'transparent',
              border: `1px solid ${!csvMode ? COLOR : C.border}`,
              color: !csvMode ? COLOR : C.muted,
            }}>
            Single recipient
          </button>
          <button type="button" onClick={() => setCsvMode(true)}
            style={{
              padding: '5px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: csvMode ? `color-mix(in srgb, ${COLOR} 18%, transparent)` : 'transparent',
              border: `1px solid ${csvMode ? COLOR : C.border}`,
              color: csvMode ? COLOR : C.muted,
            }}>
            Batch CSV (multi-recipient)
          </button>
        </div>

        {!csvMode ? (<>
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
        </>) : (<>
          {/* ── CSV upload section ── */}
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: `color-mix(in srgb, ${COLOR} 4%, transparent)`,
            border: `1px solid color-mix(in srgb, ${COLOR} 22%, transparent)`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Label required>Upload Recipients CSV</Label>
              <button type="button" onClick={downloadSampleCsv}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  background: `color-mix(in srgb, ${COLOR} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${COLOR} 30%, transparent)`,
                  color: COLOR,
                }}>
                ↓ Download sample CSV
              </button>
            </div>

            {/* Format reference */}
            <div style={{
              marginBottom: 10, padding: '10px 12px', borderRadius: 8, fontFamily: C.mono, fontSize: 11,
              background: 'rgba(0,0,0,.25)', border: `1px solid ${C.border}`, color: C.muted, lineHeight: 1.8,
            }}>
              <div style={{ color: C.gold, marginBottom: 2 }}>Expected CSV format:</div>
              <div>wallet,amount</div>
              <div>7xKXt...XXXXX,500</div>
              <div>9mPLY...YYYYY,1000</div>
              <div style={{ marginTop: 6, color: C.muted, fontSize: 10 }}>
                • Header row optional (wallet / recipient / address / to)<br/>
                • One recipient per row<br/>
                • Amount = token units (same decimals as selected token)<br/>
                • UTF-8 or ANSI encoding, comma-delimited
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleCsvFile}
              style={{ display: 'none' }}
            />
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 9, cursor: 'pointer', fontSize: 12,
                background: 'rgba(255,255,255,.04)', border: `1px dashed ${C.border}`, color: C.muted,
                fontFamily: C.serif,
              }}>
              {csvRows.length > 0
                ? `✓ ${csvRows.length} recipients loaded — click to replace`
                : '📂 Click to choose CSV file'}
            </button>
            {csvError && <div style={{ marginTop: 6, fontSize: 11, color: C.red }}>⚠ {csvError}</div>}

            {/* Preview table */}
            {csvRows.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 160, overflowY: 'auto' }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Preview ({csvRows.length} rows):</div>
                {csvRows.slice(0, 5).map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 5,
                    background: i % 2 === 0 ? 'rgba(255,255,255,.03)' : 'transparent',
                    fontSize: 10, fontFamily: C.mono,
                  }}>
                    <span style={{ color: C.muted }}>
                      {r.wallet.slice(0, 8)}…{r.wallet.slice(-4)}
                    </span>
                    <span style={{ color: COLOR, fontWeight: 700 }}>{Number(r.amount).toLocaleString()}</span>
                  </div>
                ))}
                {csvRows.length > 5 && (
                  <div style={{ fontSize: 10, color: C.muted, padding: '4px 8px' }}>
                    …and {csvRows.length - 5} more rows
                  </div>
                )}
              </div>
            )}
            {csvDone > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.green }}>
                ✓ {csvDone}/{csvRows.length} streams created
              </div>
            )}
          </div>
        </>)}
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






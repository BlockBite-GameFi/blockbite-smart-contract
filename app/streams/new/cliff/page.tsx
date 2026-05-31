'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useStreamCreate } from '@/lib/hooks/useStreamCreate';
import {
  C, Label, SInput, SToggle, ManualCsvToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
  FieldError, TxProgress, humanizeError, levelToTier,
} from '../_shared';
import TokenSelector from '@/components/TokenSelector';

interface CsvRow { wallet: string; amount: string; }

// Sample CSV content for download
const SAMPLE_CSV = `wallet,amount
3LYTyVJ9pYjj9J3ZvMYkeX9V4rjsXt6s3EFaFjW9HujM,100
9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM,250
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,500`;

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'blockbite-cliff-recipients.csv'; a.click();
  URL.revokeObjectURL(url);
}

/** Parse CSV → [{wallet, amount}]. Accepts comma or tab separated.
 *  Header row (wallet,amount) is auto-detected and skipped. */
function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines  = text.trim().split(/\r?\n/).filter(l => l.trim());
  const errors: string[] = [];
  const rows:   CsvRow[] = [];
  let startIdx = 0;

  // Skip header row if present
  const first = lines[0]?.toLowerCase().replace(/\s/g, '');
  if (first?.includes('wallet') || first?.includes('address')) startIdx = 1;

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(/[,\t]/).map(s => s.trim().replace(/^"|"$/g, ''));
    const wallet = parts[0] ?? '';
    const amount = parts[1] ?? '';
    if (!wallet) { errors.push(`Row ${i + 1}: missing wallet address`); continue; }
    try { new PublicKey(wallet); }
    catch { errors.push(`Row ${i + 1}: invalid Solana address — ${wallet.slice(0, 12)}…`); continue; }
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) { errors.push(`Row ${i + 1}: invalid amount "${amount}"`); continue; }
    rows.push({ wallet, amount });
  }
  return { rows, errors };
}

export default function CliffPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode,         setMode]         = useState<'manual' | 'csv'>('manual');
  const [tokenMint,    setTokenMint]    = useState('');
  const [tokenSymbol,  setTokenSymbol]  = useState('');
  const [tokenDecimals,setTokenDecimals]= useState(6);
  const [recipient,    setRecipient]    = useState('');
  const [amount,       setAmount]       = useState('');
  const [cliffDate,    setCliffDate]    = useState('');
  const [cancelable,   setCancelable]   = useState(false);
  const [gameGate,     setGameGate]     = useState(false);
  const [gameLevel,    setGameLevel]    = useState(10);
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({});

  // CSV state
  const [csvRows,   setCsvRows]   = useState<CsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvFile,   setCsvFile]   = useState<string | null>(null);
  const [batchIdx,  setBatchIdx]  = useState(0);
  const [batchDone, setBatchDone] = useState<string[]>([]);
  const [batchFail, setBatchFail] = useState<string[]>([]);
  const [debugMsg,  setDebugMsg]  = useState<string | null>(null);

  const COLOR   = C.gold;

  // Compute totals for sidebar
  const totalDeposit = mode === 'manual'
    ? (Number(amount) || 0)
    : csvRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const recipientCount = mode === 'manual'
    ? (recipient ? 1 : 0)
    : csvRows.length;

  // ── CSV file handler ────────────────────────────────────────────────────────
  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, errors } = parseCsv(text);
      setCsvRows(rows);
      setCsvErrors(errors);
      setCsvFile(file.name);
      setBatchDone([]);
      setBatchFail([]);
      setBatchIdx(0);
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-uploaded
  }, []);

  // ── Validation ──────────────────────────────────────────────────────────────
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
    } else {
      if (csvRows.length === 0) errs.csv = 'Upload a CSV file with wallet and amount columns';
    }
    if (!cliffDate) {
      errs.cliffDate = 'Select a cliff date';
    } else if (new Date(cliffDate).getTime() <= Date.now()) {
      errs.cliffDate = 'Cliff date must be in the future';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Create handler — supports single (manual) + batch (csv) ─────────────────
  const handleCreate = async () => {
    setDebugMsg(null);
    try {
      if (!connected) { setVisible(true); return; }
      if (!validate()) {
        setDebugMsg('❌ Validation failed — check the form fields above');
        return;
      }

      const startTs = Math.floor(Date.now() / 1000);
      const cliffTs = Math.floor(new Date(cliffDate).getTime() / 1000);
      const endTs   = cliffTs + 1; // instant full release at cliff

      if (mode === 'manual') {
        setDebugMsg('⏳ Approve in Solflare wallet…');
        const ok = await submit({
          beneficiary: recipient, mint: tokenMint, symbol: tokenSymbol,
          decimals: tokenDecimals, amount, startTs, cliffTs, endTs,
          requiredTier: gameGate ? levelToTier(gameLevel) : 0,
        });
        if (ok) setDebugMsg('✅ Stream created!');
        return;
      }

      // ── CSV batch mode — retry ALL rows on each click (fresh attempt)
      // Skip only successfully created streams (batchDone). Always retry failed ones.
      const alreadyDone = new Set(batchDone);
      const toCreate    = csvRows.filter(r => !alreadyDone.has(r.wallet));

      if (toCreate.length === 0) {
        setDebugMsg(`✅ All ${csvRows.length} streams already created! View at /streams`);
        return;
      }

      // Reset fail state so rows don't show ✗ before new attempt
      setBatchFail([]);
      const done: string[] = [...batchDone];
      const fail: string[] = [];

      for (let i = 0; i < toCreate.length; i++) {
        const row       = toCreate[i];
        const globalIdx = csvRows.indexOf(row);
        setBatchIdx(globalIdx);
        setDebugMsg(`⏳ Stream ${i + 1}/${toCreate.length} — approve in Solflare wallet…`);

        const ok = await submit({
          beneficiary: row.wallet, mint: tokenMint, symbol: tokenSymbol,
          decimals: tokenDecimals, amount: row.amount, startTs, cliffTs, endTs,
          requiredTier: gameGate ? levelToTier(gameLevel) : 0,
        });

        if (ok) {
          done.push(row.wallet);
          setBatchDone([...done]);
          setDebugMsg(`✅ Stream ${i + 1}/${toCreate.length} created! (${done.length} total)`);
        } else {
          fail.push(row.wallet);
          setBatchFail([...fail]);
          setDebugMsg(`⚠ Stream ${i + 1}/${toCreate.length} failed — will retry on next click…`);
        }
        reset();
        // Brief pause so React can re-render between streams
        await new Promise(r => setTimeout(r, 400));
      }

      setBatchIdx(csvRows.length);
      const msg = fail.length === 0
        ? `✅ All ${done.length} cliff streams created! View at /streams`
        : `⚠ ${done.length}/${toCreate.length} created. ${fail.length} failed — click Create again to retry.`;
      setDebugMsg(msg);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? String(err);
      setDebugMsg(`❌ Error: ${msg}`);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (txStatus === 'done' && mode === 'manual') return (
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
            background: 'color-mix(in srgb, var(--p-green) 4%, transparent)',
            border: '1px solid color-mix(in srgb, var(--p-green) 20%, transparent)', fontSize: 12 }}>
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
          totalDeposit={totalDeposit} token={tokenSymbol || 'TOKEN'}
          recipientCount={recipientCount}
          gameGate={gameGate} gameLevel={gameLevel} onSubmit={handleCreate}
          isSubmitting={isSubmitting} txStatus={txStatus}
          txErr={txErr ? humanizeError(txErr) : null} />
      }
    >
      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>
        <ManualCsvToggle mode={mode} onChange={m => { setMode(m); setFieldErrors({}); }} />

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
            <SInput value={recipient} onChange={v => { setRecipient(v); setFieldErrors(p => ({ ...p, recipient: '' })); }}
              placeholder="Solana wallet address…" />
            <FieldError msg={fieldErrors.recipient} />
            {!fieldErrors.recipient && <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
              All locked tokens will release to this wallet at cliff date
            </div>}
          </div>
          <div>
            <Label required>Total Amount</Label>
            <SInput value={amount} onChange={v => { setAmount(v); setFieldErrors(p => ({ ...p, amount: '' })); }}
              placeholder="e.g. 500" type="number" prefix="◎" />
            <FieldError msg={fieldErrors.amount} />
          </div>
        </>)}

        {mode === 'csv' && (
          <div>
            {/* Hidden file input */}
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt"
              style={{ display: 'none' }} onChange={handleFile} />

            {/* Format guide */}
            <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 9,
              background: 'color-mix(in srgb, var(--p-accent) 5%, transparent)',
              border: '1px solid color-mix(in srgb, var(--p-accent) 18%, transparent)',
              fontSize: 11.5 }}>
              <div style={{ fontWeight: 700, color: 'var(--p-accent)', marginBottom: 6 }}>
                📋 CSV Format — 2 columns, no header required (but accepted)
              </div>
              <pre style={{ margin: 0, fontFamily: C.mono, fontSize: 11, color: C.muted, lineHeight: 1.8 }}>{
`wallet,amount
3LYTyVJ9...HujM,100
9WzDXwBb...AWWm,250
EPjFWdd5...t1v,500`}
              </pre>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="button" onClick={downloadSampleCsv}
                  style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--p-accent) 35%, transparent)',
                    background: 'transparent', color: 'var(--p-accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  ⬇ Download sample.csv
                </button>
              </div>
            </div>

            {/* Upload area */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{ padding: '20px', borderRadius: 11, border: `2px dashed ${csvFile ? C.gold : C.border}`,
                textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s',
                background: csvFile ? 'color-mix(in srgb, var(--p-gold) 4%, transparent)' : 'transparent' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{csvFile ? '✅' : '📂'}</div>
              {csvFile ? (
                <div style={{ fontWeight: 700, color: C.gold, fontSize: 13 }}>{csvFile}</div>
              ) : (
                <div style={{ fontWeight: 600, color: '#e8e1f8', fontSize: 13 }}>Click to upload CSV</div>
              )}
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                {csvFile
                  ? `${csvRows.length} valid recipient${csvRows.length !== 1 ? 's' : ''} loaded`
                  : 'CSV / TSV / TXT — wallet,amount columns'}
              </div>
              {!csvFile && (
                <button type="button" style={{ marginTop: 10, padding: '7px 18px', borderRadius: 9,
                  border: `1px solid ${C.border}`, background: C.bg2, color: C.muted,
                  fontSize: 12, cursor: 'pointer', fontFamily: C.serif }}>
                  Choose File
                </button>
              )}
            </div>
            <FieldError msg={fieldErrors.csv} />

            {/* Parsed rows preview */}
            {csvRows.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto',
                borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 11 }}>
                <div style={{ padding: '6px 12px', background: 'rgba(255,255,255,.03)',
                  fontWeight: 700, color: C.muted, borderBottom: `1px solid ${C.border}`,
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <span>WALLET</span><span>AMOUNT</span>
                </div>
                {csvRows.map((row, i) => (
                  <div key={i} style={{ padding: '5px 12px', borderBottom: `1px solid color-mix(in srgb, ${C.border} 40%, transparent)`,
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 8,
                    background: batchDone.includes(row.wallet) ? 'color-mix(in srgb, var(--p-green) 6%, transparent)'
                              : batchFail.includes(row.wallet) ? 'color-mix(in srgb, var(--p-red) 6%, transparent)'
                              : batchIdx === i && isSubmitting ? 'color-mix(in srgb, var(--p-gold) 6%, transparent)'
                              : 'transparent' }}>
                    <span style={{ fontFamily: C.mono, color: C.muted }}>
                      {batchDone.includes(row.wallet) ? '✓ ' : batchFail.includes(row.wallet) ? '✗ ' : ''}
                      {row.wallet.slice(0, 8)}…{row.wallet.slice(-6)}
                    </span>
                    <span style={{ fontFamily: C.mono, color: 'var(--p-text)', fontWeight: 700 }}>
                      {Number(row.amount).toLocaleString()} {tokenSymbol || 'TOKEN'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* CSV parse errors */}
            {csvErrors.length > 0 && (
              <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, fontSize: 11,
                background: 'color-mix(in srgb, var(--p-red) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--p-red) 25%, transparent)' }}>
                <div style={{ fontWeight: 700, color: 'var(--p-red)', marginBottom: 4 }}>
                  ⚠ {csvErrors.length} row{csvErrors.length !== 1 ? 's' : ''} skipped:
                </div>
                {csvErrors.map((e, i) => <div key={i} style={{ color: 'var(--p-muted)' }}>{e}</div>)}
              </div>
            )}

            {/* Batch progress */}
            {batchDone.length > 0 && (
              <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, fontSize: 11,
                color: 'var(--p-green)',
                background: 'color-mix(in srgb, var(--p-green) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--p-green) 25%, transparent)' }}>
                ✓ {batchDone.length}/{csvRows.length} streams created
                {batchFail.length > 0 && ` · ${batchFail.length} failed`}
                {batchDone.length === csvRows.length && (
                  <Link href="/streams" style={{ marginLeft: 8, color: 'var(--p-green)', fontWeight: 700 }}>
                    View all →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        <SToggle value={cancelable} onChange={setCancelable}
          label="Allow cancellation?" sub="Creator can cancel and reclaim tokens before cliff date." />
      </Section>

      <Section title="Cliff Schedule">
        <div style={{ fontSize: 12, color: C.muted }}>
          Tokens are locked completely until the cliff date, then released all at once.
        </div>
        <div>
          <Label required>Cliff Date</Label>
          <SInput value={cliffDate} onChange={v => { setCliffDate(v); setFieldErrors(p => ({ ...p, cliffDate: '' })); }}
            type="date" placeholder="" />
          <FieldError msg={fieldErrors.cliffDate} />
        </div>
        {cliffDate && totalDeposit > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Total locked',  v: `${totalDeposit.toLocaleString()} ${tokenSymbol || 'TOKEN'}`, c: COLOR },
              { l: 'Recipients',   v: String(recipientCount || '—'),       c: C.blue   },
              { l: 'Unlocks on',   v: new Date(cliffDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), c: C.muted },
              { l: 'Release type', v: 'Cliff — instant full release',      c: C.muted  },
            ].map(r => (
              <div key={r.l} style={{ padding: '10px 12px', borderRadius: 9,
                background: `color-mix(in srgb, ${COLOR} 3%, transparent)`,
                border: `1px solid color-mix(in srgb, ${COLOR} 13%, transparent)` }}>
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

      <div style={{ padding: '11px 15px', borderRadius: 10,
        background: 'color-mix(in srgb, var(--p-gold) 4%, transparent)',
        border: '1px solid color-mix(in srgb, var(--p-gold) 20%, transparent)',
        fontSize: 12, color: C.gold }}>
        {mode === 'csv' && csvRows.length > 1
          ? `⚠ CSV batch: ${csvRows.length} streams — each needs wallet approval in Solflare`
          : '⚠ Cliff streams lock tokens until cliff date. Connect wallet to proceed.'}
      </div>

      {/* Debug / progress message — shows what's happening after button clicked */}
      {debugMsg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600,
          background: debugMsg.startsWith('✅') ? 'color-mix(in srgb, var(--p-green) 8%, transparent)'
                    : debugMsg.startsWith('❌') ? 'color-mix(in srgb, var(--p-red) 8%, transparent)'
                    : 'color-mix(in srgb, var(--p-accent) 8%, transparent)',
          border: debugMsg.startsWith('✅') ? '1px solid color-mix(in srgb, var(--p-green) 30%, transparent)'
                : debugMsg.startsWith('❌') ? '1px solid color-mix(in srgb, var(--p-red) 30%, transparent)'
                : '1px solid color-mix(in srgb, var(--p-accent) 30%, transparent)',
          color: debugMsg.startsWith('✅') ? 'var(--p-green)'
               : debugMsg.startsWith('❌') ? 'var(--p-red)'
               : 'var(--p-accent)',
        }}>
          {debugMsg}
        </div>
      )}
    </StreamPageShell>
  );
}

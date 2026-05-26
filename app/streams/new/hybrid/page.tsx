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

export default function HybridPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const [done, setDone] = useState(false);

  const { submit, txStatus, txSig, txErr, isSubmitting, reset } = useStreamCreate();

  const [mode,       setMode]       = useState<'manual' | 'csv'>('manual');
  const [token,      setToken]      = useState('');
  const [recipient,  setRecipient]  = useState('');
  const [amount,     setAmount]     = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [cliffDays,  setCliffDays]  = useState(90);
  const [vestDays,   setVestDays]   = useState(365);
  const [cancelable, setCancelable] = useState(false);

  // Milestones (partial, rest linear)
  const [msCount, setMsCount] = useState(2);
  const [msPcts,  setMsPcts]  = useState([20, 20, 10, 10]);

  const [gameGate,  setGameGate]  = useState(false);
  const [gameLevel, setGameLevel] = useState(20);

  const COLOR    = '#c084fc';
  const deposit  = Number(amount) || 0;
  const msGated  = msPcts.slice(0, msCount).reduce((s, p) => s + p, 0);
  const linRem   = Math.max(0, 100 - msGated);
  const daily    = vestDays > 0 ? ((deposit * linRem / 100) / vestDays).toFixed(2) : '0';

  const handleCreate = async () => {
    if (!connected) { setVisible(true); return; }
    const now     = Math.floor(Date.now() / 1000);
    const startTs = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : now;
    const cliffTs = startTs + cliffDays * 86400;
    const endTs   = cliffTs + vestDays * 86400;
    const reqTier = (gameGate ? (gameLevel <= 10 ? 1 : 2) : 0) as 0 | 1 | 2;
    const ok = await submit({ beneficiary: recipient, token, amount, startTs, cliffTs, endTs, requiredTier: reqTier });
    if (ok) setDone(true);
  };

  if (done) return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>⚡</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Hybrid vesting active — <strong style={{ color: COLOR }}>{msGated}% milestone-gated</strong>,{' '}
          <strong style={{ color: C.accent }}>{linRem}% linear</strong>.
          {gameGate && ` BlockBite Game Gate at Level ${gameLevel}.`}
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
      typeLabel="Hybrid" typeIcon="⚡" typeColor={COLOR}
      subtitle="Cliff + milestone + linear combined. Most flexible token distribution model."
      sidebar={
        <StreamSidebar
          typeLabel="Hybrid" typeColor={COLOR} typeIcon="⚡"
          totalDeposit={deposit} token={token || 'TOKEN'}
          recipientCount={recipient ? 1 : 0}
          gameGate={gameGate} gameLevel={gameLevel}
          onSubmit={handleCreate}
          txStatus={txStatus} txErr={txErr} isSubmitting={isSubmitting}
        />
      }
    >
      <Section title="General Details">
        <div style={{ fontSize: 12, color: C.muted }}>Token and stream settings</div>
        <ManualCsvToggle mode={mode} onChange={setMode} />

        <div>
          <Label required>Token</Label>
          <SSelect value={token} onChange={setToken} placeholder="Select Token"
            options={[
              { v: 'BBT',  l: 'BBT — BlockBite Token' },
              { v: 'USDC', l: 'USDC' },
              { v: 'SOL',  l: 'SOL (wrapped)' },
            ]}
          />
        </div>

        {mode === 'manual' && (
          <>
            <div>
              <Label required>Recipient</Label>
              <SInput value={recipient} onChange={setRecipient} placeholder="Solana wallet address…" />
            </div>
            <div>
              <Label required>Total Amount</Label>
              <SInput value={amount} onChange={setAmount} placeholder="e.g. 2000000" type="number" prefix="◎" />
            </div>
          </>
        )}

        {mode === 'csv' && (
          <div style={{ padding: '20px', borderRadius: 11, border: `1px dashed ${C.border}`,
            textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, color: '#e8e1f8', marginBottom: 4 }}>Upload CSV</div>
            <div style={{ fontSize: 11.5 }}>wallet,amount columns · one recipient per row</div>
            <button style={{ marginTop: 12, padding: '8px 18px', borderRadius: 9,
              border: `1px solid ${C.border}`, background: C.bg2,
              color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: C.serif }}>Choose File</button>
          </div>
        )}

        <SToggle value={cancelable} onChange={setCancelable}
          label="Allow cancellation?"
          sub="Creator can cancel and reclaim unvested tokens after a 7-day grace period." />
      </Section>

      <Section title="Linear Schedule">
        <div>
          <Label>Start Date</Label>
          <SInput value={startDate} onChange={setStartDate} type="date" placeholder="" />
        </div>
        <SSlider label="Cliff Period" value={cliffDays} onChange={setCliffDays}
          min={0} max={730} unit=" days" color={C.ember}
          note={cliffDays === 0 ? 'No cliff' : `Cliff: Day ${cliffDays}`} />
        <SSlider label="Vesting Duration" value={vestDays} onChange={setVestDays}
          min={30} max={1460} unit=" days" color={C.accent}
          note={`Full vest: Day ${cliffDays + vestDays}`} />
      </Section>

      <Section title="Milestone Gates">
        <div style={{ fontSize: 12, color: C.muted }}>
          Milestone gates release a percentage of tokens on-chain trigger. The remainder vests linearly.
        </div>
        <SSlider label="Milestone count" value={msCount} onChange={setMsCount}
          min={1} max={4} color={COLOR} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: msCount }, (_, i) => (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 11,
              background: C.bg2, border: `1px solid ${COLOR}33`,
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: `${COLOR}18`, border: `1px solid ${COLOR}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: COLOR }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <SSlider label={`Milestone ${i + 1} — % release`}
                  value={msPcts[i]} color={COLOR}
                  onChange={v => setMsPcts(p => p.map((x, idx) => idx === i ? v : x))}
                  min={0} max={50} unit="%" />
              </div>
            </div>
          ))}
        </div>

        {/* Allocation split */}
        <div style={{ padding: '12px 14px', borderRadius: 11,
          background: 'rgba(255,255,255,.02)', border: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <span style={{ fontFamily: C.mono, fontWeight: 700, color: C.green }}>{daily} {token || 'T'}/day</span>
            </div>
          )}
          {/* Visual split bar */}
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
            <div style={{ width: `${msGated}%`, height: '100%', background: COLOR,
              borderRadius: 99, transition: 'width .3s' }} />
          </div>
        </div>
      </Section>

      <Section title="Unlock Requirements">
        <GameGateCard
          enabled={gameGate} onChange={setGameGate}
          level={gameLevel} onLevelChange={setGameLevel}
        />
      </Section>

      <div style={{ padding: '11px 15px', borderRadius: 10,
        background: `${C.gold}0a`, border: `1px solid ${C.gold}33`, fontSize: 12, color: C.gold }}>
        ⚠ Hybrid streams combine cliff, milestone, and linear mechanics in one PDA vault.
        Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  C, Label, SInput, SSelect, SSlider, SToggle, ManualCsvToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
} from '../_shared';

export default function LinearPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const [done, setDone] = useState(false);

  const [mode,       setMode]       = useState<'manual' | 'csv'>('manual');
  const [token,      setToken]      = useState('');
  const [recipient,  setRecipient]  = useState('');
  const [amount,     setAmount]     = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [cliffDays,  setCliffDays]  = useState(30);
  const [vestDays,   setVestDays]   = useState(365);
  const [cancelable, setCancelable] = useState(false);

  const [gameGate,  setGameGate]  = useState(false);
  const [gameLevel, setGameLevel] = useState(10);

  const COLOR   = C.accent;
  const deposit = Number(amount) || 0;
  const daily   = vestDays > 0 ? (deposit / vestDays).toFixed(2) : '0';
  const perSec  = vestDays > 0 ? (deposit / (vestDays * 86400)).toFixed(6) : '0';

  const handleCreate = () => {
    if (!connected) { setVisible(true); return; }
    setDone(true);
  };

  if (done) return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>📈</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          Linear vesting active — <strong style={{ color: COLOR }}>{daily} {token}/day</strong> unlock rate.
          {gameGate && ` BlockBite Game Gate active at Level ${gameLevel}.`}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/streams" style={{
            padding: '11px 24px', borderRadius: 11, textDecoration: 'none', fontWeight: 700, fontSize: 13,
            background: `linear-gradient(135deg,${COLOR},${C.accentDk})`, color: '#fff',
          }}>View Streams →</Link>
          <button onClick={() => setDone(false)} style={{
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
      typeLabel="Linear" typeIcon="📈" typeColor={COLOR}
      subtitle="Tokens release gradually from cliff date to end date. Smooth, proportional unlock."
      sidebar={
        <StreamSidebar
          typeLabel="Linear" typeColor={COLOR} typeIcon="📈"
          totalDeposit={deposit} token={token || 'TOKEN'}
          recipientCount={recipient ? 1 : 0}
          gameGate={gameGate} gameLevel={gameLevel}
          onSubmit={handleCreate}
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
              <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
                Tokens unlock continuously to this wallet from cliff to end date
              </div>
            </div>
            <div>
              <Label required>Total Amount</Label>
              <SInput value={amount} onChange={setAmount} placeholder="e.g. 1000000" type="number" prefix="◎" />
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

      <Section title="Vesting Schedule">
        <div style={{ fontSize: 12, color: C.muted }}>
          Tokens unlock continuously over time, from cliff date to end date.
        </div>

        <div>
          <Label>Start Date</Label>
          <SInput value={startDate} onChange={setStartDate} type="date" placeholder="" />
        </div>

        <SSlider
          label="Cliff Period" value={cliffDays} onChange={setCliffDays}
          min={0} max={730} unit=" days" color={C.ember}
          note={cliffDays === 0 ? 'No cliff' : `Cliff: Day ${cliffDays}`}
        />
        <SSlider
          label="Vesting Duration" value={vestDays} onChange={setVestDays}
          min={30} max={1460} unit=" days" color={COLOR}
          note={`Completes: Day ${cliffDays + vestDays}`}
        />

        {deposit > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Cliff unlock',  v: `Day ${cliffDays}`,          c: C.ember  },
              { l: 'Fully vested',  v: `Day ${cliffDays + vestDays}`,c: COLOR    },
              { l: 'Daily rate',    v: `${daily} ${token || 'T'}/day`,c: C.green  },
              { l: 'Per second',    v: `${perSec} T/s`,              c: C.blue   },
            ].map(r => (
              <div key={r.l} style={{ padding: '10px 12px', borderRadius: 9,
                background: `${r.c}07`, border: `1px solid ${r.c}22` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{r.l}</div>
                <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: r.c }}>{r.v}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Unlock Requirements">
        <GameGateCard
          enabled={gameGate} onChange={setGameGate}
          level={gameLevel} onLevelChange={setGameLevel}
        />
      </Section>

      <div style={{ padding: '11px 15px', borderRadius: 10,
        background: `${C.gold}0a`, border: `1px solid ${C.gold}33`, fontSize: 12, color: C.gold }}>
        ⚠ Linear streams lock tokens into a PDA vault. Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  C, Label, SInput, SSelect, SToggle, ManualCsvToggle,
  GameGateCard, StreamSidebar, StreamPageShell, Section,
} from '../_shared';

export default function CliffPage() {
  const { connected }  = useWallet();
  const { setVisible } = useWalletModal();
  const [done, setDone] = useState(false);

  const [mode,       setMode]      = useState<'manual' | 'csv'>('manual');
  const [token,      setToken]     = useState('');
  const [recipient,  setRecipient] = useState('');
  const [amount,     setAmount]    = useState('');
  const [cliffDate,  setCliffDate] = useState('');
  const [cancelable, setCancelable]= useState(false);

  const [gameGate,  setGameGate]  = useState(false);
  const [gameLevel, setGameLevel] = useState(10);

  const COLOR   = C.gold;
  const deposit = Number(amount) || 0;

  const handleCreate = () => {
    if (!connected) { setVisible(true); return; }
    setDone(true);
  };

  if (done) return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>🪨</div>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: C.gold, marginBottom: 8 }}>Stream Created!</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          Cliff vesting locked until <strong style={{ color: C.gold }}>{cliffDate || 'cliff date'}</strong>.
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
      typeLabel="Cliff" typeIcon="🪨" typeColor={COLOR}
      subtitle="All tokens lock until cliff date. Nothing before, everything after."
      sidebar={
        <StreamSidebar
          typeLabel="Cliff" typeColor={COLOR} typeIcon="🪨"
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
                All locked tokens will release to this wallet at cliff date
              </div>
            </div>
            <div>
              <Label required>Total Amount</Label>
              <SInput value={amount} onChange={setAmount} placeholder="e.g. 500000" type="number" prefix="◎" />
            </div>
          </>
        )}

        {mode === 'csv' && (
          <div style={{ padding: '20px', borderRadius: 11, border: `1px dashed ${C.border}`,
            textAlign: 'center', color: C.muted, fontSize: 13 }}>
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
          sub="Creator can cancel and reclaim tokens before cliff date." />
      </Section>

      <Section title="Cliff Schedule">
        <div style={{ fontSize: 12, color: C.muted }}>
          Tokens are locked completely until the cliff date, then released all at once.
        </div>
        <div>
          <Label required>Cliff Date</Label>
          <SInput value={cliffDate} onChange={setCliffDate} type="date" placeholder="" />
        </div>

        {cliffDate && deposit > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Locked amount',   v: `${deposit.toLocaleString()} ${token || 'TOKEN'}`, c: COLOR    },
              { l: 'Unlocks on',      v: new Date(cliffDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), c: C.muted },
              { l: 'Lock type',       v: 'Full cliff — instant release',                    c: C.muted  },
              { l: 'Stream type',     v: 'Cliff vesting',                                   c: COLOR    },
            ].map(r => (
              <div key={r.l} style={{ padding: '10px 12px', borderRadius: 9,
                background: `${COLOR}07`, border: `1px solid ${COLOR}22` }}>
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
        ⚠ Cliff streams lock tokens until the specified date. This action is permanent.
        Connect your wallet to proceed.
      </div>
    </StreamPageShell>
  );
}

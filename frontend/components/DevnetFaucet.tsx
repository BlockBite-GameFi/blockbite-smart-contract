'use client';
/**
 * DevnetFaucet — Get test tokens from the emergency faucet.
 * Shows when wallet has insufficient balance.
 * Calls /api/faucet to send tokens from deployer wallet.
 */

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { T } from '@/lib/theme';

const ASSETS = [
  { id: 'SOL',  label: '0.5 SOL (devnet)',  color: '#9945FF', icon: '◎' },
  { id: 'wSOL', label: '1 wSOL (wrapped)',   color: '#14F195', icon: '◎' },
  { id: 'BBT',  label: '10K BBT (BlockBite)', color: '#f5c66a', icon: '◈' },
  { id: 'USDC', label: '100 USDC (devnet)',   color: '#2775CA', icon: '$' },
];

export default function DevnetFaucet({ onReceived }: { onReceived?: () => void }) {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  async function request(asset: string) {
    if (!publicKey) return;
    setLoading(asset);
    try {
      const res = await fetch('/api/faucet/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), asset }),
      });
      const data = await res.json();
      if (data.sig) {
        setResults(r => ({ ...r, [asset]: { ok: true, msg: `Sent! Tx: ${data.sig.slice(0,12)}…` } }));
        onReceived?.();
      } else {
        setResults(r => ({ ...r, [asset]: { ok: false, msg: data.error ?? 'Failed' } }));
      }
    } catch {
      setResults(r => ({ ...r, [asset]: { ok: false, msg: 'Network error' } }));
    } finally {
      setLoading(null);
    }
  }

  if (!publicKey) return null;

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12, marginBottom: 16,
      background: 'rgba(20,241,149,.05)',
      border: '1px solid rgba(20,241,149,.2)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#14F195', letterSpacing: '.06em',
        textTransform: 'uppercase', marginBottom: 10 }}>
        🚰 Devnet Faucet — Get Test Tokens
      </div>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.6 }}>
        Emergency faucet — pakai ini jika public faucet diblokir atau wallet kosong.
        Tokens dikirim dari deployer wallet ke wallet kamu.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {ASSETS.map(a => {
          const res = results[a.id];
          const busy = loading === a.id;
          return (
            <button
              key={a.id}
              onClick={() => request(a.id)}
              disabled={busy || !!loading}
              style={{
                padding: '8px 12px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer',
                background: res?.ok ? 'rgba(20,241,149,.08)' : `${a.color}10`,
                border: `1px solid ${res?.ok ? '#14F195' : a.color}44`,
                color: res?.ok ? '#14F195' : a.color,
                fontSize: 11, fontWeight: 600, textAlign: 'left',
                opacity: loading && !busy ? 0.5 : 1,
                transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{a.icon}</span>
                <span>{busy ? 'Sending…' : a.label}</span>
              </div>
              {res && (
                <div style={{ fontSize: 9, marginTop: 3, color: res.ok ? '#14F195' : T.red,
                  fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
                  {res.msg}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 9, color: T.textDim, marginTop: 8 }}>
        Devnet only · After receiving, open token dropdown to see new balance
      </div>
    </div>
  );
}

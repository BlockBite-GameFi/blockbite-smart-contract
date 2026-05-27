'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

const C = {
  bg0:    '#05040d',
  bg1:    '#09071a',
  accent: '#a78bfa',
  green:  '#5fd07a',
  gold:   '#f5c66a',
  red:    '#ff3b6b',
  muted:  'rgba(148,163,184,.7)',
  border: 'rgba(167,139,250,.15)',
  serif:  "'Space Grotesk', system-ui, sans-serif",
  mono:   "'JetBrains Mono', monospace",
};

type Metrics = {
  vaultUSDC: number;
  activePlayers: number;
  txLastHour: number;
  errors24h: number;
  feeWallet: number;
  devWallet: number;
  refPool: number;
};

const METRIC_META: Record<keyof Metrics, { label: string; color: string; unit?: string }> = {
  vaultUSDC:      { label: 'Vault USDC',        color: C.green,  unit: 'USDC' },
  activePlayers:  { label: 'Active Players',     color: C.accent             },
  txLastHour:     { label: 'Tx / Last Hour',     color: C.gold               },
  errors24h:      { label: 'Errors (24h)',        color: C.red                },
  feeWallet:      { label: 'Fee Wallet',          color: C.muted,  unit: 'USDC' },
  devWallet:      { label: 'Dev Wallet',          color: C.muted,  unit: 'USDC' },
  refPool:        { label: 'Referral Pool',       color: C.muted,  unit: 'USDC' },
};

export default function AdminPage() {
  const [m, setM] = useState<Metrics>({
    vaultUSDC: 0, activePlayers: 0, txLastHour: 0,
    errors24h: 0, feeWallet: 0, devWallet: 0, refPool: 0,
  });

  useEffect(() => {
    const tick = () => fetch('/api/admin').then(r => r.json()).then(setM).catch(() => {});
    tick();
    const i = setInterval(tick, 5000);
    return () => clearInterval(i);
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: '#e8e1f8', fontFamily: C.serif }}>
      <Navbar />

      {/* Header */}
      <div style={{
        padding: '80px 32px 36px',
        background: 'linear-gradient(180deg,#0a0820 0%,#05040d 100%)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: C.muted, textDecoration: 'none', marginBottom: 16,
            padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: 'rgba(255,255,255,.02)',
          }}>← Back to Home</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#fff' }}>
              Admin Dashboard
            </h1>
            <div style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
              letterSpacing: '.08em', color: C.green,
              background: `${C.green}18`, border: `1px solid ${C.green}33`,
            }}>
              LIVE · 5s refresh
            </div>
          </div>
          <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 0' }}>
            Real-time protocol metrics from /api/admin.
          </p>
        </div>
      </div>

      {/* Metric grid */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '32px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14,
      }}>
        {(Object.keys(m) as (keyof Metrics)[]).map(k => {
          const meta = METRIC_META[k];
          return (
            <div key={k} style={{
              padding: '20px 22px', borderRadius: 16,
              background: C.bg1, border: `1px solid ${C.border}`,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '.07em',
                textTransform: 'uppercase', color: C.muted, marginBottom: 8,
              }}>
                {meta.label}
              </div>
              <div style={{
                fontFamily: C.mono, fontSize: 26, fontWeight: 700, color: meta.color,
              }}>
                {typeof m[k] === 'number' ? m[k].toLocaleString() : m[k]}
                {meta.unit && (
                  <span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>{meta.unit}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { T } from '@/lib/theme';
import { initProtocolConfig, deriveProtocolConfigPDA, CAMPAIGN_PROGRAM_ID } from '@/lib/anchor/campaign-client';
import { TEAM_WALLET } from '@/lib/solana/config';
import { getHealthyConnection } from '@/lib/solana/rpc-manager';

const C = {
  bg0:    'var(--p-bg0)',
  bg1:    'var(--p-bg1)',
  accent: '#a78bfa',
  green:  '#5fd07a',
  gold:   '#f5c66a',
  red:    '#ff3b6b',
  muted:  'var(--p-muted)',
  border: 'var(--p-border)',
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

type ConfigState = 'loading' | 'uninitialized' | 'initialized' | 'error';

export default function AdminPage() {
  const { publicKey, sendTransaction, connected } = useWallet();

  const [m, setM] = useState<Metrics>({
    vaultUSDC: 0, activePlayers: 0, txLastHour: 0,
    errors24h: 0, feeWallet: 0, devWallet: 0, refPool: 0,
  });

  const [configState, setConfigState] = useState<ConfigState>('loading');
  const [configAdmin,    setConfigAdmin]    = useState<string | null>(null);
  const [configTreasury, setConfigTreasury] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [initErr,    setInitErr]    = useState<string | null>(null);
  const [initSig,    setInitSig]    = useState<string | null>(null);

  useEffect(() => {
    const tick = () => fetch('/api/admin').then(r => r.json()).then(setM).catch(() => {});
    tick();
    const i = setInterval(tick, 5000);
    return () => clearInterval(i);
  }, []);

  // Check if ProtocolConfig exists on-chain
  useEffect(() => {
    const check = async () => {
      try {
        const conn = getHealthyConnection('confirmed');
        const [pda] = deriveProtocolConfigPDA();
        const info = await conn.getAccountInfo(pda);
        if (!info || info.data.length < 73) {
          setConfigState('uninitialized');
          return;
        }
        // Layout: 8 disc + 32 admin + 32 treasury + 1 bump = 73
        const admin    = new PublicKey(info.data.slice(8,  40)).toBase58();
        const treasury = new PublicKey(info.data.slice(40, 72)).toBase58();
        setConfigAdmin(admin);
        setConfigTreasury(treasury);
        setConfigState('initialized');
      } catch {
        setConfigState('error');
      }
    };
    check();
  }, [initStatus]);

  const handleInitConfig = async () => {
    if (!publicKey || !connected) return;
    setInitStatus('pending');
    setInitErr(null);
    setInitSig(null);
    try {
      const conn = getHealthyConnection('confirmed');
      const sig = await initProtocolConfig({
        connection: conn,
        admin: publicKey,
        treasury: TEAM_WALLET,
        sendTransaction: async (tx, c) => sendTransaction(tx, c),
      });
      setInitSig(sig);
      setInitStatus('done');
    } catch (e: unknown) {
      setInitErr(e instanceof Error ? e.message : String(e));
      setInitStatus('error');
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: C.bg0, color: T.text, fontFamily: C.serif }}>

      {/* Header */}
      <div style={{
        padding: '80px 32px 36px',
        background: T.header,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: T.text }}>
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

      {/* Protocol Config Init Panel */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px 12px' }}>
        <div style={{
          padding: '24px 28px', borderRadius: 16, border: `1px solid ${C.border}`,
          background: C.bg1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Protocol Config</span>
            {configState === 'loading' && (
              <span style={{ fontSize: 11, color: C.muted }}>checking…</span>
            )}
            {configState === 'initialized' && (
              <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                color: C.green, background: `${C.green}18`, border: `1px solid ${C.green}33` }}>
                ✓ INITIALIZED
              </span>
            )}
            {configState === 'uninitialized' && (
              <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                color: C.red, background: `${C.red}18`, border: `1px solid ${C.red}33` }}>
                ✗ NOT INITIALIZED
              </span>
            )}
          </div>

          {configState === 'initialized' ? (
            <div style={{ display: 'grid', gap: 6, fontFamily: C.mono, fontSize: 12 }}>
              <div><span style={{ color: C.muted }}>Admin:    </span><span style={{ color: T.text }}>{configAdmin}</span></div>
              <div><span style={{ color: C.muted }}>Treasury: </span><span style={{ color: T.text }}>{configTreasury}</span></div>
            </div>
          ) : configState === 'uninitialized' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                ProtocolConfig PDA not found on devnet. Create streams will fail until this is initialized.
                Treasury will be set to TEAM_WALLET ({TEAM_WALLET.toBase58().slice(0, 8)}…).
              </p>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>
                Program: {CAMPAIGN_PROGRAM_ID.toBase58()}
              </div>
              <button
                onClick={handleInitConfig}
                disabled={!connected || initStatus === 'pending'}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none', cursor: connected ? 'pointer' : 'not-allowed',
                  background: connected ? C.accent : '#444', color: '#fff', fontWeight: 700, fontSize: 13,
                  width: 'fit-content', opacity: initStatus === 'pending' ? 0.6 : 1,
                }}
              >
                {initStatus === 'pending' ? 'Initializing…' : !connected ? 'Connect Wallet First' : 'Initialize Protocol Config'}
              </button>
              {initErr && <div style={{ color: C.red, fontSize: 12 }}>{initErr}</div>}
              {initSig && (
                <a href={`https://explorer.solana.com/tx/${initSig}?cluster=devnet`} target="_blank" rel="noreferrer"
                  style={{ color: C.green, fontSize: 12 }}>
                  ✓ Done — tx: {initSig.slice(0, 20)}… ↗
                </a>
              )}
            </div>
          ) : null}
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

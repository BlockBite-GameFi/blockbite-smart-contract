'use client';

import { useState, useRef, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { useWalletTokens, WalletToken } from '@/lib/hooks/useWalletTokens';

interface Props {
  value:    string;         // current mint address OR 'SOL'
  onChange: (mint: string, symbol: string, decimals: number) => void;
  disabled?: boolean;
}

export default function TokenSelector({ value, onChange, disabled }: Props) {
  const { connection }            = useConnection();
  const { tokens, loading, refresh } = useWalletTokens();
  const [open,     setOpen]    = useState(false);
  const [custom,   setCustom]  = useState('');
  const [cusErr,   setCusErr]  = useState('');
  const [cusLoad,  setCusLoad] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const current = tokens.find(t => t.mint === value || (value === 'SOL' && t.isNative));
  const displayLabel = current ? `${current.symbol} — ${current.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : value || 'Select token…';

  async function addCustom() {
    const addr = custom.trim();
    if (!addr) return;
    setCusErr(''); setCusLoad(true);
    try {
      // Validate it's a real mint
      const pk = new PublicKey(addr);
      const info = await getMint(connection, pk);
      const sym = addr.slice(0, 4) + '..' + addr.slice(-4);
      onChange(addr, sym, info.decimals);
      setCustom('');
      setOpen(false);
    } catch (e: unknown) {
      setCusErr((e as Error)?.message?.includes('not found') ? 'Mint not found on this network' : 'Invalid mint address');
    } finally { setCusLoad(false); }
  }

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(o => !o); if (!open) refresh(); }}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
          background: 'var(--p-bg2)', border: '1px solid var(--p-border)',
          color: 'var(--p-text)', fontSize: 13, fontWeight: 600, textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>{displayLabel}</span>
        <span style={{ color: 'var(--p-muted)', fontSize: 10 }}>▼</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 999,
          background: 'var(--p-bg1)', border: '1px solid var(--p-border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,.5)', maxHeight: 340, overflowY: 'auto',
        }}>
          {/* Wallet tokens */}
          {loading ? (
            <div style={{ padding: '14px 16px', color: 'var(--p-muted)', fontSize: 12 }}>Scanning wallet tokens…</div>
          ) : tokens.length === 0 ? (
            <div style={{ padding: '14px 16px', color: 'var(--p-muted)', fontSize: 12 }}>No tokens found. Connect wallet first.</div>
          ) : (
            tokens.map(tok => (
              <button
                key={tok.mint}
                type="button"
                onClick={() => { onChange(tok.mint, tok.symbol, tok.decimals); setOpen(false); }}
                style={{
                  width: '100%', padding: '10px 16px', border: 'none', cursor: 'pointer',
                  background: tok.mint === value ? 'color-mix(in srgb, var(--p-accent) 12%, transparent)' : 'transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid color-mix(in srgb, var(--p-border) 50%, transparent)',
                }}
              >
                <span style={{ color: 'var(--p-text)', fontSize: 13, fontWeight: 600 }}>
                  {tok.symbol}
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--p-muted)', fontWeight: 400 }}>
                    {tok.isNative ? 'native' : tok.mint.slice(0, 6) + '..'}
                  </span>
                </span>
                <span style={{ color: tok.balance > 0 ? 'var(--p-green)' : 'var(--p-muted)', fontSize: 12 }}>
                  {tok.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </span>
              </button>
            ))
          )}

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--p-border)', margin: '4px 0' }} />

          {/* Custom token input */}
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--p-muted)', letterSpacing: '1.5px', marginBottom: 6, textTransform: 'uppercase' }}>
              Paste any SPL mint address
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={custom}
                onChange={e => { setCustom(e.target.value); setCusErr(''); }}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="e.g. EPjFWdd5Auf…"
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 11,
                  background: 'var(--p-bg2)', border: '1px solid var(--p-border)',
                  color: 'var(--p-text)', outline: 'none',
                }}
              />
              <button
                type="button" onClick={addCustom} disabled={cusLoad || !custom.trim()}
                style={{
                  padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: 'color-mix(in srgb, var(--p-accent) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--p-accent) 40%, transparent)',
                  color: 'var(--p-accent)',
                }}
              >
                {cusLoad ? '…' : 'Add'}
              </button>
            </div>
            {cusErr && <div style={{ color: 'var(--p-red)', fontSize: 11, marginTop: 4 }}>{cusErr}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

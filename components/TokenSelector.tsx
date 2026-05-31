'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { useWalletTokens, WalletToken, KNOWN } from '@/lib/hooks/useWalletTokens';
import { USDC_MINT } from '@/lib/solana/config';

interface Props {
  value:    string;   // current mint address OR 'SOL'
  onChange: (mint: string, symbol: string, decimals: number) => void;
  disabled?: boolean;
}

// ── Jupiter devnet swap URL ────────────────────────────────────────────────
const JUPITER_URL = 'https://jup.ag/swap/SOL-USDC';
const FAUCET_SOL  = 'https://faucet.solana.com';

// Logo helper
function TokenLogo({ logoURI, symbol, size = 22 }: { logoURI?: string; symbol: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (logoURI && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoURI} alt={symbol} width={size} height={size}
        style={{ borderRadius: '50%', flexShrink: 0 }}
        onError={() => setErr(true)} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'color-mix(in srgb, var(--p-accent) 25%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 800, color: 'var(--p-accent)',
    }}>
      {symbol.slice(0, 2)}
    </div>
  );
}

// Faucet button for devnet tokens (SOL + any SPL)
function FaucetButton({ mint, symbol }: { mint: string; symbol: string }) {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const isSOL = mint === 'SOL' || mint === 'So11111111111111111111111111111111111111112';

  const get = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!publicKey) { setMsg('Connect wallet first'); return; }
    setLoading(true); setMsg('');
    try {
      const body: Record<string,string> = { wallet: publicKey.toBase58() };
      // For SOL: use 'SOL' as special mint key to trigger devnet airdrop
      body.mint = isSOL ? 'SOL' : mint;
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fallback && data.fallback.length > 0) {
          // Open first fallback in new tab and show message
          window.open(data.fallback[0], '_blank');
          setMsg(`↗ Opened: ${data.fallback[0].replace('https://', '')}`);
        } else {
          setMsg(`✗ ${data.error ?? 'Faucet failed'}`);
        }
      } else {
        setMsg(isSOL ? `✓ 2 SOL airdropped!` : `✓ 10,000 ${symbol} sent!`);
      }
    } catch { setMsg('✗ Request failed'); }
    finally { setLoading(false); }
  }, [publicKey, mint, symbol, isSOL]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
      <button type="button" onClick={get} disabled={loading} style={{
        padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer',
        background: 'color-mix(in srgb, var(--p-green) 15%, transparent)',
        border: '1px solid color-mix(in srgb, var(--p-green) 35%, transparent)',
        color: 'var(--p-green)', whiteSpace: 'nowrap',
      }}>
        {loading ? '…' : isSOL ? 'Airdrop 2 SOL' : `Get ${symbol}`}
      </button>
      {msg && <span style={{ fontSize: 9, color: msg.startsWith('✓') ? 'var(--p-green)' : 'var(--p-red)' }}>{msg}</span>}
    </div>
  );
}

// Single token row
function TokenRow({ tok, selected, onClick }: {
  tok: WalletToken; selected: boolean; onClick: () => void;
}) {
  const hasBalance = tok.balance > 0;
  return (
    <button type="button" onClick={onClick} style={{
      width: '100%', padding: '9px 14px', border: 'none', cursor: 'pointer',
      background: selected ? 'color-mix(in srgb, var(--p-accent) 12%, transparent)' : 'transparent',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
      borderBottom: '1px solid color-mix(in srgb, var(--p-border) 40%, transparent)',
      textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
        <TokenLogo logoURI={tok.logoURI} symbol={tok.symbol} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--p-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {tok.symbol}
            {tok.isNative && <span style={{ fontSize: 9, background: 'color-mix(in srgb, var(--p-blue) 15%, transparent)', color: 'var(--p-blue)', padding: '1px 5px', borderRadius: 4 }}>native</span>}
            {tok.network === 'devnet' && <span style={{ fontSize: 9, background: 'color-mix(in srgb, var(--p-gold) 15%, transparent)', color: 'var(--p-gold)', padding: '1px 5px', borderRadius: 4 }}>devnet</span>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--p-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {tok.name}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        {hasBalance && !tok.isNative ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--p-green)' }}>
            {tok.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </span>
        ) : tok.isNative ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: tok.balance > 0 ? 'var(--p-green)' : 'var(--p-muted)' }}>
              {tok.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL
            </span>
            <FaucetButton mint={tok.mint} symbol={tok.symbol} />
          </div>
        ) : (
          <FaucetButton mint={tok.mint} symbol={tok.symbol} />
        )}
        <span style={{ fontSize: 9, color: 'var(--p-muted)', fontFamily: 'monospace' }}>
          {tok.mint === 'SOL' ? 'native' : tok.mint.slice(0, 6) + '…' + tok.mint.slice(-4)}
        </span>
      </div>
    </button>
  );
}

export default function TokenSelector({ value, onChange, disabled }: Props) {
  const { connection }              = useConnection();
  const { tokens, loading, refresh } = useWalletTokens();
  const [open,    setOpen]   = useState(false);
  const [search,  setSearch] = useState('');
  const [custom,  setCustom] = useState('');
  const [cusErr,  setCusErr] = useState('');
  const [cusLoad, setCusLoad]= useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const current = tokens.find(t => t.mint === value || (value === 'SOL' && t.isNative));

  // Display label for the button
  const displayLabel = current
    ? `${current.symbol} — ${current.balance > 0
        ? current.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })
        : '0 (get via faucet)'}`
    : value
      ? value.slice(0, 8) + '…'
      : 'Select token…';

  // Filter tokens by search
  const filtered = search.trim()
    ? tokens.filter(t =>
        t.symbol.toLowerCase().includes(search.toLowerCase()) ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.mint.toLowerCase().includes(search.toLowerCase()))
    : tokens;

  // Separate into groups
  const withBalance = filtered.filter(t => t.balance > 0);
  const noBalance   = filtered.filter(t => t.balance <= 0);

  async function addCustom() {
    const addr = custom.trim();
    if (!addr) return;
    setCusErr(''); setCusLoad(true);
    try {
      const pk   = new PublicKey(addr);
      const info = await getMint(connection, pk);
      const known = KNOWN[addr];
      const sym   = known?.symbol ?? (addr.slice(0, 4) + '..' + addr.slice(-4));
      onChange(addr, sym, info.decimals);
      setCustom(''); setOpen(false);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      setCusErr(msg.includes('not found') || msg.includes('Invalid') ? 'Mint not found on this network' : 'Invalid mint address');
    } finally { setCusLoad(false); }
  }

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Trigger button */}
      <button type="button" disabled={disabled}
        onClick={() => { setOpen(o => !o); if (!open) { refresh(); setSearch(''); } }}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          cursor: disabled ? 'default' : 'pointer',
          background: 'var(--p-bg2)', border: `1px solid ${value ? 'var(--p-accent)' : 'var(--p-border)'}`,
          color: value ? 'var(--p-text)' : 'var(--p-muted)',
          fontSize: 13, fontWeight: 600, textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {current && <TokenLogo logoURI={current.logoURI} symbol={current.symbol} size={18} />}
          {displayLabel}
        </span>
        <span style={{ color: 'var(--p-muted)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Balance chip */}
      {current && current.balance === 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--p-gold)' }}>
          ⚠ No {current.symbol} balance —{' '}
          <button type="button" onClick={async (e) => {
            e.preventDefault();
            // trigger faucet inline
            const { publicKey } = { publicKey: null } as any; // just link
            window.open(FAUCET_SOL, '_blank');
          }}
            style={{ background: 'none', border: 'none', color: 'var(--p-accent)', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline' }}>
            get devnet SOL
          </button>
          {' '}or use the faucet button below
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999,
          background: 'var(--p-bg1)', border: '1px solid var(--p-border)', borderRadius: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,.6)',
          maxHeight: 420, display: 'flex', flexDirection: 'column',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--p-border)', flexShrink: 0 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, symbol, or paste mint address…"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: 'var(--p-bg2)', border: '1px solid var(--p-border)',
                color: 'var(--p-text)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Get SOL banner */}
          <div style={{
            padding: '8px 12px', flexShrink: 0,
            background: 'color-mix(in srgb, var(--p-gold) 6%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--p-gold) 20%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{ fontSize: 11, color: 'var(--p-gold)' }}>
              🧪 Need devnet tokens?
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={FAUCET_SOL} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                style={{
                  padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                  background: 'color-mix(in srgb, var(--p-gold) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--p-gold) 35%, transparent)',
                  color: 'var(--p-gold)', textDecoration: 'none',
                }}>
                Get SOL ↗
              </a>
              <a href={JUPITER_URL} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                style={{
                  padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                  background: 'color-mix(in srgb, var(--p-accent) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--p-accent) 35%, transparent)',
                  color: 'var(--p-accent)', textDecoration: 'none',
                }}>
                Swap via Jupiter ↗
              </a>
            </div>
          </div>

          {/* Token list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: '16px', color: 'var(--p-muted)', fontSize: 12, textAlign: 'center' }}>
                Scanning wallet tokens…
              </div>
            ) : (
              <>
                {/* Tokens with balance */}
                {withBalance.length > 0 && (
                  <>
                    <div style={{ padding: '6px 14px 2px', fontSize: 9.5, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--p-muted)' }}>
                      Your tokens
                    </div>
                    {withBalance.map(tok => (
                      <TokenRow key={tok.mint}
                        tok={tok}
                        selected={tok.mint === value || (value === 'SOL' && !!tok.isNative)}
                        onClick={() => { onChange(tok.mint, tok.symbol, tok.decimals); setOpen(false); }}
                      />
                    ))}
                  </>
                )}

                {/* Tokens without balance (zero) */}
                {noBalance.length > 0 && (
                  <>
                    <div style={{ padding: '6px 14px 2px', fontSize: 9.5, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--p-muted)' }}>
                      {withBalance.length > 0 ? 'Available on devnet (use faucet)' : 'Devnet tokens'}
                    </div>
                    {noBalance.map(tok => (
                      <TokenRow key={tok.mint}
                        tok={tok}
                        selected={tok.mint === value}
                        onClick={() => { onChange(tok.mint, tok.symbol, tok.decimals); setOpen(false); }}
                      />
                    ))}
                  </>
                )}

                {filtered.length === 0 && (
                  <div style={{ padding: '16px', color: 'var(--p-muted)', fontSize: 12, textAlign: 'center' }}>
                    No tokens found. Try pasting a mint address below.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Custom mint input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--p-border)', flexShrink: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--p-muted)', letterSpacing: '1.5px', marginBottom: 6, textTransform: 'uppercase' }}>
              Any SPL token — paste mint address (mainnet / devnet / testnet)
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={custom}
                onChange={e => { setCustom(e.target.value); setCusErr(''); }}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="e.g. EPjFWdd5Auf… or any mint"
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 11,
                  background: 'var(--p-bg2)', border: '1px solid var(--p-border)',
                  color: 'var(--p-text)', outline: 'none',
                }}
              />
              <button type="button" onClick={addCustom} disabled={cusLoad || !custom.trim()}
                style={{
                  padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: 'color-mix(in srgb, var(--p-accent) 20%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--p-accent) 40%, transparent)',
                  color: 'var(--p-accent)', opacity: custom.trim() ? 1 : 0.5,
                }}>
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

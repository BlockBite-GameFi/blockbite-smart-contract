'use client';
/**
 * Devnet Faucet — get test tokens to demo all TX flows.
 * 1 click: receive 10,000 BBT + 0.1 SOL from the emergency wallet.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { T } from '@/lib/theme';

const BBT_MINT  = '9d4hVSzi4W6VoAp5dNgxsHNiFmZpq9RiK5vHtmip8asU';
const USDC_MINT = 'ZLkYWYvM4ZEDcPcvmcxmcgTgvsWRCXqg9ZYyQuf7njU';

interface ClaimResult { sig?: string; explorer?: string; amount?: number; token?: string; error?: string; }

export default function FaucetPage() {
  const { publicKey }  = useWallet();
  const { setVisible } = useWalletModal();

  const [loading,  setLoading]  = useState<string | null>(null); // which token is loading
  const [results,  setResults]  = useState<Record<string, ClaimResult>>({});

  async function claim(token: 'BBT' | 'SOL') {
    if (!publicKey) { setVisible(true); return; }
    setLoading(token);
    try {
      const res = await fetch('/api/faucet', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wallet: publicKey.toBase58(), token }),
      });
      const data = await res.json();
      setResults(prev => ({ ...prev, [token]: data }));
    } catch (e: unknown) {
      setResults(prev => ({ ...prev, [token]: { error: (e as Error).message } }));
    } finally {
      setLoading(null);
    }
  }

  const row = (label: string, value: string, mono = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0',
      borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.textDim }}>{label}</span>
      <span style={{ fontSize: 12, color: '#fff', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined }}>
        {value}
      </span>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text }}>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(88px,12vw,108px) 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800,
            marginBottom: 8, textTransform: 'uppercase' }}>
            Devnet Faucet · BlockBite TDP
          </div>
          <h1 style={{ fontFamily: T.serif, fontSize: 32, fontWeight: 900, marginBottom: 10 }}>
            Get Devnet Tokens
          </h1>
          <p style={{ fontSize: 13, color: T.textDim, lineHeight: 1.7 }}>
            Get test tokens to try all vesting flows — create stream, withdraw, cancel.
            Free on devnet. Up to once every 30 minutes per wallet.
          </p>
        </div>

        {/* Wallet status */}
        {!publicKey ? (
          <div style={{ padding: '28px 24px', background: T.bg1, border: `1px solid ${T.border}`,
            borderRadius: 16, textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Connect Wallet</div>
            <p style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
              Connect your Phantom/Solflare wallet to receive devnet tokens.
            </p>
            <button onClick={() => setVisible(true)} style={{
              padding: '12px 28px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: T.grad, color: '#fff', fontWeight: 700, fontSize: 14,
              fontFamily: T.serif,
            }}>Connect Wallet</button>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', background: `${T.green}10`, border: `1px solid ${T.green}44`,
            borderRadius: 12, marginBottom: 24, fontSize: 12, color: T.green }}>
            ✓ Connected: {publicKey.toBase58().slice(0, 8)}…{publicKey.toBase58().slice(-8)}
          </div>
        )}

        {/* Token cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>

          {/* BBT */}
          <div style={{ background: T.bg1, border: `1.5px solid ${T.accent}44`, borderRadius: 16, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 800, color: T.accent }}>
                  10,000 BBT
                </div>
                <div style={{ fontSize: 12, color: T.textDim }}>BlockBite Token · devnet</div>
                <div style={{ fontSize: 10, color: T.textDim, fontFamily: 'JetBrains Mono,monospace', marginTop: 4 }}>
                  {BBT_MINT.slice(0, 16)}…
                </div>
              </div>
              <button
                onClick={() => claim('BBT')}
                disabled={!publicKey || loading === 'BBT'}
                style={{
                  padding: '10px 22px', borderRadius: 10, border: 'none', cursor: publicKey ? 'pointer' : 'not-allowed',
                  background: publicKey ? T.grad : T.bg2, color: publicKey ? '#fff' : T.textDim,
                  fontWeight: 700, fontSize: 14, fontFamily: T.serif,
                  opacity: loading === 'BBT' ? 0.6 : 1,
                }}
              >
                {loading === 'BBT' ? 'Sending…' : 'Claim BBT'}
              </button>
            </div>
            {results.BBT && (
              <div style={{ padding: '10px 12px', borderRadius: 10, fontSize: 11,
                background: results.BBT.error ? `${T.red}10` : `${T.green}10`,
                border: `1px solid ${results.BBT.error ? T.red : T.green}44`,
                color: results.BBT.error ? T.red : T.green }}>
                {results.BBT.error ? `⚠ ${results.BBT.error}` : (
                  <>
                    ✓ {results.BBT.amount?.toLocaleString()} BBT sent!{' '}
                    <a href={results.BBT.explorer} target="_blank" rel="noreferrer"
                      style={{ color: T.accent }}>View tx ↗</a>
                  </>
                )}
              </div>
            )}
          </div>

          {/* SOL */}
          <div style={{ background: T.bg1, border: `1.5px solid ${T.gold}44`, borderRadius: 16, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 800, color: T.gold }}>
                  0.1 SOL
                </div>
                <div style={{ fontSize: 12, color: T.textDim }}>Devnet SOL · for gas fees</div>
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
                  So11111111111111111111111111111111111111112
                </div>
              </div>
              <button
                onClick={() => claim('SOL')}
                disabled={!publicKey || loading === 'SOL'}
                style={{
                  padding: '10px 22px', borderRadius: 10, border: 'none', cursor: publicKey ? 'pointer' : 'not-allowed',
                  background: publicKey ? `linear-gradient(135deg,${T.gold},#c48a00)` : T.bg2,
                  color: publicKey ? '#000' : T.textDim,
                  fontWeight: 700, fontSize: 14, fontFamily: T.serif,
                  opacity: loading === 'SOL' ? 0.6 : 1,
                }}
              >
                {loading === 'SOL' ? 'Sending…' : 'Claim SOL'}
              </button>
            </div>
            {results.SOL && (
              <div style={{ padding: '10px 12px', borderRadius: 10, fontSize: 11,
                background: results.SOL.error ? `${T.red}10` : `${T.green}10`,
                border: `1px solid ${results.SOL.error ? T.red : T.green}44`,
                color: results.SOL.error ? T.red : T.green }}>
                {results.SOL.error ? `⚠ ${results.SOL.error}` : (
                  <>
                    ✓ {results.SOL.amount} SOL sent!{' '}
                    <a href={results.SOL.explorer} target="_blank" rel="noreferrer"
                      style={{ color: T.accent }}>View tx ↗</a>
                  </>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Info */}
        <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontFamily: T.serif, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Devnet Token Registry
          </div>
          {row('BBT Mint', BBT_MINT.slice(0, 20) + '…', true)}
          {row('USDC Devnet Mint', USDC_MINT.slice(0, 20) + '…', true)}
          {row('wSOL Mint', 'So11111111111111111111111111111111111111112', true)}
          {row('Network', 'Solana Devnet')}
          {row('Rate limit', '1 claim per wallet per 30 minutes')}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/new/linear" style={{
            flex: 1, padding: '13px 0', borderRadius: 11, textAlign: 'center',
            background: T.grad, color: '#fff', fontWeight: 700, fontSize: 14,
            textDecoration: 'none', fontFamily: T.serif,
          }}>
            Create Stream (Linear) →
          </Link>
          <Link href="/new/cliff" style={{
            flex: 1, padding: '13px 0', borderRadius: 11, textAlign: 'center',
            border: `1px solid ${T.gold}`, color: T.gold, fontWeight: 700, fontSize: 14,
            textDecoration: 'none', fontFamily: T.serif,
          }}>
            Create Stream (Cliff) →
          </Link>
          <Link href="/claim" style={{
            flex: 1, padding: '13px 0', borderRadius: 11, textAlign: 'center',
            border: `1px solid ${T.border}`, color: T.textDim, fontWeight: 700, fontSize: 14,
            textDecoration: 'none', fontFamily: T.serif,
          }}>
            Claim / Withdraw
          </Link>
        </div>
      </div>
    </main>
  );
}

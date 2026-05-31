'use client';

/**
 * useWalletTokens — fetches SOL + SPL token balances via server-side proxy API.
 *
 * WHY server-side proxy instead of direct browser RPC:
 *   Browser → RPC endpoint fails with "TypeError: Failed to fetch" due to CORS.
 *   Most Solana devnet RPC nodes don't include CORS headers, so browsers block them.
 *   Solution: browser calls /api/solana/balance and /api/solana/tokens which run
 *   server-side (no CORS restriction) and try 20+ endpoints until one works.
 */

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { USDC_MINT } from '@/lib/solana/config';

export interface WalletToken {
  mint:      string;
  symbol:    string;
  name:      string;
  decimals:  number;
  balance:   number;
  logoURI?:  string;
  isNative?: boolean;
  isKnown?:  boolean;
  network?:  'devnet' | 'mainnet' | 'any';
}

// ─── Well-known mints ─────────────────────────────────────────────────────────
export const KNOWN: Record<string, {
  symbol: string; name: string; decimals: number;
  logoURI?: string; network?: 'devnet' | 'mainnet' | 'any';
}> = {
  'So11111111111111111111111111111111111111112': {
    symbol: 'wSOL', name: 'Wrapped SOL', decimals: 9, network: 'any',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  'ZLkYWYvM4ZEDcPcvmcxmcgTgvsWRCXqg9ZYyQuf7njU': {
    symbol: 'USDC', name: 'BlockBite Test USDC (devnet)', decimals: 6, network: 'devnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': {
    symbol: 'USDC', name: 'USD Coin (Circle devnet)', decimals: 6, network: 'devnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    symbol: 'USDC', name: 'USD Coin', decimals: 6, network: 'mainnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6, network: 'mainnet' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk', decimals: 5, network: 'mainnet' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':  { symbol: 'JUP',  name: 'Jupiter', decimals: 6, network: 'mainnet' },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY',  name: 'Raydium', decimals: 6, network: 'mainnet' },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', name: 'Marinade staked SOL', decimals: 9, network: 'mainnet' },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { symbol: 'bSOL', name: 'BlazeStake SOL', decimals: 9, network: 'mainnet' },
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': { symbol: 'ORCA', name: 'Orca', decimals: 6, network: 'mainnet' },
};

const LAMPORTS_PER_SOL = 1_000_000_000;

export const DEVNET_DEFAULT_TOKENS: WalletToken[] = [
  {
    mint: USDC_MINT.toBase58(), symbol: 'USDC',
    name: 'BlockBite Test USDC (devnet)', decimals: 6, balance: 0,
    isKnown: true, network: 'devnet',
    logoURI: KNOWN['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']?.logoURI,
  },
  {
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', symbol: 'USDC',
    name: 'USD Coin (Circle devnet)', decimals: 6, balance: 0,
    isKnown: true, network: 'devnet',
    logoURI: KNOWN['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']?.logoURI,
  },
];

export function useWalletTokens() {
  const { publicKey } = useWallet();
  const [tokens,  setTokens]  = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) { setTokens(DEVNET_DEFAULT_TOKENS); return; }
    setLoading(true);

    const walletAddr = publicKey.toBase58();
    const results: WalletToken[] = [];
    const seenMints = new Set<string>();

    // ── 1. Native SOL via server-side proxy (bypasses browser CORS) ───────────
    let solBalance = 0;
    try {
      const res  = await fetch(`/api/solana/balance?wallet=${walletAddr}`, { cache: 'no-store' });
      const data = await res.json() as { sol?: number; lamports?: number };
      solBalance = data.sol ?? (data.lamports ?? 0) / LAMPORTS_PER_SOL;
    } catch {
      // Proxy also failed — show 0 balance (don't crash)
      solBalance = 0;
    }
    results.push({
      mint: 'SOL', symbol: 'SOL', name: 'Solana (devnet)', decimals: 9,
      balance: solBalance, isNative: true, isKnown: true,
      logoURI: KNOWN['So11111111111111111111111111111111111111112']?.logoURI,
    });
    seenMints.add('SOL');

    // ── 2. SPL tokens via server-side proxy ───────────────────────────────────
    try {
      const res  = await fetch(`/api/solana/tokens?wallet=${walletAddr}`, { cache: 'no-store' });
      const data = await res.json() as { accounts?: { mint: string; amount: string }[] };
      for (const acct of (data.accounts ?? [])) {
        try {
          new PublicKey(acct.mint); // validate
          const known   = KNOWN[acct.mint];
          const decimals = known?.decimals ?? 6;
          const balance  = Number(BigInt(acct.amount)) / 10 ** decimals;
          results.push({
            mint:     acct.mint,
            symbol:   known?.symbol  ?? (acct.mint.slice(0, 4) + '..' + acct.mint.slice(-4)),
            name:     known?.name    ?? `Token ${acct.mint.slice(0, 8)}..`,
            decimals,
            balance,
            logoURI:  known?.logoURI,
            isKnown:  !!known,
            network:  known?.network,
          });
          seenMints.add(acct.mint);
        } catch { /* skip malformed */ }
      }
    } catch { /* SPL scan failed — show SOL + defaults */ }

    // ── 3. Always inject default devnet tokens (USDC) even at 0 balance ──────
    for (const dt of DEVNET_DEFAULT_TOKENS) {
      if (!seenMints.has(dt.mint)) {
        results.push({ ...dt });
        seenMints.add(dt.mint);
      }
    }

    // ── 4. Sort: native first → balance desc → known → unknown ───────────────
    results.sort((a, b) => {
      if (a.isNative) return -1;
      if (b.isNative) return 1;
      if (b.balance !== a.balance) return b.balance - a.balance;
      if (a.isKnown && !b.isKnown) return -1;
      if (!a.isKnown && b.isKnown) return 1;
      return 0;
    });

    setTokens(results);
    setLoading(false);
  }, [publicKey]);

  useEffect(() => { refresh(); }, [refresh]);
  return { tokens, loading, refresh };
}

/** Resolve decimals for any SPL mint via server proxy */
export async function resolveMintDecimals(mintAddr: string): Promise<number> {
  if (mintAddr === 'SOL') return 9;
  const known = KNOWN[mintAddr];
  if (known) return known.decimals;
  // Fallback: ask server
  try {
    const res  = await fetch(`/api/solana/mint-info?mint=${mintAddr}`);
    const data = await res.json() as { decimals?: number };
    return data.decimals ?? 6;
  } catch { return 6; }
}

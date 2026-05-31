'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { USDC_MINT } from '@/lib/solana/config';
import { withRpcFallback } from '@/lib/solana/rpc-manager';

export interface WalletToken {
  mint:      string;
  symbol:    string;
  name:      string;
  decimals:  number;
  balance:   number;     // human-readable
  logoURI?:  string;
  isNative?: boolean;    // true = native SOL
  isKnown?:  boolean;    // true = appears in KNOWN list
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
  // BlockBite devnet test USDC (faucet-mintable)
  'ZLkYWYvM4ZEDcPcvmcxmcgTgvsWRCXqg9ZYyQuf7njU': {
    symbol: 'USDC', name: 'BlockBite Test USDC (devnet)', decimals: 6, network: 'devnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  // Circle devnet USDC
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': {
    symbol: 'USDC', name: 'USD Coin (Circle devnet)', decimals: 6, network: 'devnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  // Circle mainnet USDC
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

async function fetchMintMeta(mintAddr: string): Promise<{ symbol: string; name: string; decimals: number }> {
  try {
    const info = await withRpcFallback(conn => getMint(conn, new PublicKey(mintAddr)));
    const short = mintAddr.slice(0, 4) + '..' + mintAddr.slice(-4);
    return { symbol: short, name: `Token ${mintAddr.slice(0, 8)}..`, decimals: info.decimals };
  } catch {
    return { symbol: mintAddr.slice(0, 4) + '..', name: mintAddr.slice(0, 12) + '..', decimals: 6 };
  }
}

export function useWalletTokens() {
  const { publicKey } = useWallet();
  const [tokens,  setTokens]  = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setTokens(DEVNET_DEFAULT_TOKENS);
      return;
    }
    setLoading(true);
    try {
      const results: WalletToken[] = [];
      const seenMints = new Set<string>();

      // 1. Native SOL — uses withRpcFallback → tries up to 10 endpoints
      let lamports = 0;
      try {
        lamports = await withRpcFallback(conn => conn.getBalance(publicKey));
      } catch {
        // If ALL endpoints fail, still show SOL with 0 balance
        lamports = 0;
      }
      results.push({
        mint: 'SOL', symbol: 'SOL', name: 'Solana (devnet)', decimals: 9,
        balance: lamports / LAMPORTS_PER_SOL, isNative: true, isKnown: true,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      });
      seenMints.add('SOL');

      // 2. SPL token accounts — uses withRpcFallback → tries all endpoints
      try {
        const resp = await withRpcFallback(conn =>
          conn.getTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID })
        );
        await Promise.all(resp.value.map(async ({ account }) => {
          try {
            const data      = account.data;
            const mint      = new PublicKey(data.slice(0, 32)).toBase58();
            const amountRaw = data.readBigUInt64LE(64);
            const known     = KNOWN[mint];
            const meta      = known ?? await fetchMintMeta(mint);
            const balance   = Number(amountRaw) / 10 ** meta.decimals;
            results.push({
              mint, ...meta, balance,
              logoURI: known?.logoURI, isKnown: !!known, network: known?.network,
            });
            seenMints.add(mint);
          } catch { /* skip malformed account */ }
        }));
      } catch {
        // getTokenAccountsByOwner failed on all endpoints — that's ok, show SOL + defaults
      }

      // 3. Inject default devnet tokens (USDC) even at zero balance
      for (const dt of DEVNET_DEFAULT_TOKENS) {
        if (!seenMints.has(dt.mint)) {
          results.push({ ...dt });
          seenMints.add(dt.mint);
        }
      }

      // 4. Sort: native first, then by balance desc, then known, then unknown
      results.sort((a, b) => {
        if (a.isNative) return -1;
        if (b.isNative) return 1;
        if (b.balance !== a.balance) return b.balance - a.balance;
        if (a.isKnown && !b.isKnown) return -1;
        if (!a.isKnown && b.isKnown) return 1;
        return 0;
      });

      setTokens(results);
    } catch {
      // Catastrophic failure — still show SOL + defaults
      try {
        const lamports = await withRpcFallback(conn => conn.getBalance(publicKey)).catch(() => 0);
        setTokens([
          {
            mint: 'SOL', symbol: 'SOL', name: 'Solana (devnet)', decimals: 9,
            balance: lamports / LAMPORTS_PER_SOL, isNative: true, isKnown: true,
          },
          ...DEVNET_DEFAULT_TOKENS,
        ]);
      } catch {
        setTokens(DEVNET_DEFAULT_TOKENS);
      }
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { refresh(); }, [refresh]);
  return { tokens, loading, refresh };
}

export async function resolveMintDecimals(mintAddr: string): Promise<number> {
  if (mintAddr === 'SOL') return 9;
  const known = KNOWN[mintAddr];
  if (known) return known.decimals;
  try {
    const info = await withRpcFallback(conn => getMint(conn, new PublicKey(mintAddr)));
    return info.decimals;
  } catch { return 6; }
}

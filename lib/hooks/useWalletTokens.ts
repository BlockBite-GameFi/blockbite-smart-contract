'use client';

import { useEffect, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';

export interface WalletToken {
  mint:     string;
  symbol:   string;
  name:     string;
  decimals: number;
  balance:  number;     // human-readable
  logoURI?: string;
  isNative?: boolean;   // true = native SOL
}

// Well-known mints across networks — fallback metadata when on-chain lookup fails
const KNOWN: Record<string, { symbol: string; name: string; decimals: number; logoURI?: string }> = {
  // wSOL
  'So11111111111111111111111111111111111111112':  { symbol: 'wSOL', name: 'Wrapped SOL',        decimals: 9 },
  // USDC mainnet (Circle)
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin',           decimals: 6 },
  // USDC devnet (Circle official)
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': { symbol: 'USDC', name: 'USD Coin (devnet)',  decimals: 6 },
  // USDT mainnet
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD',         decimals: 6 },
  // BONK
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk',              decimals: 5 },
  // JUP
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':  { symbol: 'JUP',  name: 'Jupiter',           decimals: 6 },
  // RAY
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY',  name: 'Raydium',           decimals: 6 },
};

/** Fetch decimals + basic symbol for an unknown mint from on-chain */
async function fetchMintMeta(
  connection: Parameters<typeof getMint>[0],
  mintAddr: string,
): Promise<{ symbol: string; name: string; decimals: number }> {
  try {
    const info = await getMint(connection, new PublicKey(mintAddr));
    return { symbol: mintAddr.slice(0, 4) + '..', name: `Token ${mintAddr.slice(0, 8)}..`, decimals: info.decimals };
  } catch {
    return { symbol: '???', name: mintAddr.slice(0, 12) + '..', decimals: 6 };
  }
}

export function useWalletTokens() {
  const { connection }  = useConnection();
  const { publicKey }   = useWallet();
  const [tokens,  setTokens]  = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) { setTokens([]); return; }
    setLoading(true);
    try {
      const results: WalletToken[] = [];

      // 1. Native SOL
      const lamports = await connection.getBalance(publicKey);
      results.push({
        mint: 'SOL', symbol: 'SOL', name: 'Solana', decimals: 9,
        balance: lamports / LAMPORTS_PER_SOL, isNative: true,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      });

      // 2. All SPL token accounts owned by wallet
      const resp = await connection.getTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      await Promise.all(resp.value.map(async ({ account }) => {
        try {
          // Parse account data: mint = bytes 0-32, amount = bytes 64-72
          const data   = account.data;
          const mint   = new PublicKey(data.slice(0, 32)).toBase58();
          const amountRaw = data.readBigUInt64LE(64);

          const known = KNOWN[mint];
          const meta  = known ?? await fetchMintMeta(connection, mint);
          const balance = Number(amountRaw) / 10 ** meta.decimals;
          if (balance <= 0) return; // skip zero-balance accounts

          results.push({ mint, ...meta, balance, logoURI: known?.logoURI });
        } catch { /* skip malformed accounts */ }
      }));

      setTokens(results);
    } catch { setTokens([]); }
    finally { setLoading(false); }
  }, [connection, publicKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { tokens, loading, refresh };
}

/** Resolve decimals for any arbitrary mint address */
export async function resolveMintDecimals(
  connection: Parameters<typeof getMint>[0],
  mintAddr: string,
): Promise<number> {
  if (mintAddr === 'SOL') return 9;
  const known = KNOWN[mintAddr];
  if (known) return known.decimals;
  try {
    const info = await getMint(connection, new PublicKey(mintAddr));
    return info.decimals;
  } catch { return 6; }
}

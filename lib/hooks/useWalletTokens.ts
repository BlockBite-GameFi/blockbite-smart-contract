'use client';

import { useEffect, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { USDC_MINT } from '@/lib/solana/config';

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

// ─── Well-known mints across networks ────────────────────────────────────────
// These appear in the TokenSelector even when balance = 0 so users can always
// select them and use the faucet to fund their account before creating streams.
export const KNOWN: Record<string, {
  symbol: string; name: string; decimals: number;
  logoURI?: string; network?: 'devnet' | 'mainnet' | 'any';
}> = {
  // ── Native wSOL ──────────────────────────────────────────────────────────
  'So11111111111111111111111111111111111111112': {
    symbol: 'wSOL', name: 'Wrapped SOL', decimals: 9, network: 'any',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  },
  // ── USDC ─────────────────────────────────────────────────────────────────
  // BlockBite devnet test USDC (controlled mint — works with our faucet API)
  'ZLkYWYvM4ZEDcPcvmcxmcgTgvsWRCXqg9ZYyQuf7njU': {
    symbol: 'USDC', name: 'BlockBite Test USDC (devnet)', decimals: 6, network: 'devnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  // Circle official devnet USDC
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': {
    symbol: 'USDC', name: 'USD Coin (Circle devnet)', decimals: 6, network: 'devnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  // Circle mainnet USDC
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    symbol: 'USDC', name: 'USD Coin', decimals: 6, network: 'mainnet',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  },
  // ── USDT ─────────────────────────────────────────────────────────────────
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    symbol: 'USDT', name: 'Tether USD', decimals: 6, network: 'mainnet',
  },
  // ── Popular Solana tokens ─────────────────────────────────────────────────
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': {
    symbol: 'BONK', name: 'Bonk', decimals: 5, network: 'mainnet',
  },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': {
    symbol: 'JUP',  name: 'Jupiter', decimals: 6, network: 'mainnet',
  },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': {
    symbol: 'RAY',  name: 'Raydium', decimals: 6, network: 'mainnet',
  },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': {
    symbol: 'mSOL', name: 'Marinade staked SOL', decimals: 9, network: 'mainnet',
  },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': {
    symbol: 'bSOL', name: 'BlazeStake Staked SOL', decimals: 9, network: 'mainnet',
  },
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': {
    symbol: 'ORCA', name: 'Orca', decimals: 6, network: 'mainnet',
  },
  'SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y': {
    symbol: 'SHDW', name: 'Shadow Token', decimals: 9, network: 'mainnet',
  },
};

// Default devnet tokens to always display in selector even at zero balance
export const DEVNET_DEFAULT_TOKENS: WalletToken[] = [
  {
    mint:     USDC_MINT.toBase58(),
    symbol:   'USDC',
    name:     'BlockBite Test USDC (devnet)',
    decimals: 6,
    balance:  0,
    isKnown:  true,
    network:  'devnet',
    logoURI:  KNOWN['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']?.logoURI,
  },
  {
    mint:     '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    symbol:   'USDC',
    name:     'USD Coin (Circle devnet)',
    decimals: 6,
    balance:  0,
    isKnown:  true,
    network:  'devnet',
    logoURI:  KNOWN['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']?.logoURI,
  },
];

/** Fetch decimals + basic symbol for an unknown mint from on-chain */
async function fetchMintMeta(
  connection: Parameters<typeof getMint>[0],
  mintAddr: string,
): Promise<{ symbol: string; name: string; decimals: number }> {
  try {
    const info = await getMint(connection, new PublicKey(mintAddr));
    const short = mintAddr.slice(0, 4) + '..' + mintAddr.slice(-4);
    return { symbol: short, name: `Token ${mintAddr.slice(0, 8)}..`, decimals: info.decimals };
  } catch {
    return { symbol: '???', name: mintAddr.slice(0, 12) + '..', decimals: 6 };
  }
}

// Reliable devnet endpoint for basic reads (getBalance, getTokenAccountsByOwner).
// drpc.org free-tier blocks these methods (error code 35), so we use the
// official devnet node which supports all basic read methods.
import { Connection as SolanaConnection } from '@solana/web3.js';
const BALANCE_RPC = new SolanaConnection('https://api.devnet.solana.com', 'confirmed');

export function useWalletTokens() {
  const { connection }  = useConnection();
  const { publicKey }   = useWallet();
  const [tokens,  setTokens]  = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      // Show default devnet tokens even without wallet so UI is not empty
      setTokens(DEVNET_DEFAULT_TOKENS);
      return;
    }
    setLoading(true);
    try {
      const results: WalletToken[] = [];
      const seenMints = new Set<string>();

      // 1. Native SOL — use BALANCE_RPC (api.devnet.solana.com) which reliably
      //    supports getBalance; drpc.org free-tier blocks this method.
      const lamports = await BALANCE_RPC.getBalance(publicKey);
      results.push({
        mint: 'SOL', symbol: 'SOL', name: 'Solana (devnet)', decimals: 9,
        balance: lamports / LAMPORTS_PER_SOL, isNative: true, isKnown: true,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      });
      seenMints.add('SOL');

      // 2. All SPL token accounts owned by wallet (includes zero-balance if ATA exists)
      const resp = await connection.getTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      await Promise.all(resp.value.map(async ({ account }) => {
        try {
          const data     = account.data;
          const mint     = new PublicKey(data.slice(0, 32)).toBase58();
          const amountRaw = data.readBigUInt64LE(64);

          const known = KNOWN[mint];
          const meta  = known ?? await fetchMintMeta(connection, mint);
          const balance = Number(amountRaw) / 10 ** meta.decimals;

          results.push({
            mint, ...meta, balance,
            logoURI: known?.logoURI,
            isKnown: !!known,
            network: known?.network,
          });
          seenMints.add(mint);
        } catch { /* skip malformed */ }
      }));

      // 3. Inject well-known devnet tokens that user doesn't have yet
      // so they can see them and use the faucet to get some
      for (const dt of DEVNET_DEFAULT_TOKENS) {
        if (!seenMints.has(dt.mint)) {
          results.push({ ...dt }); // balance = 0
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
      // RPC error — still show native SOL balance if possible, plus devnet defaults
      try {
        const lamports = await BALANCE_RPC.getBalance(publicKey).catch(() => 0);
        setTokens([
          {
            mint: 'SOL', symbol: 'SOL', name: 'Solana (devnet)', decimals: 9,
            balance: lamports / LAMPORTS_PER_SOL, isNative: true, isKnown: true,
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          },
          ...DEVNET_DEFAULT_TOKENS,
        ]);
      } catch {
        setTokens(DEVNET_DEFAULT_TOKENS);
      }
    }
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

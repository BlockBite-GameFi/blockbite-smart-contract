/**
 * Universal Token Registry — supports mainnet, devnet, testnet, custom mints.
 * Reads all tokens from the connected wallet on-chain.
 */

import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';

// Well-known devnet mints
export const KNOWN_DEVNET_TOKENS: Record<string, { symbol: string; name: string; decimals: number; logoURI?: string }> = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL',  name: 'Wrapped SOL',     decimals: 9  },
  'ZLkYWYvM4ZEDcPcvmcxmcgTgvsWRCXqg9ZYyQuf7njU': { symbol: 'USDC', name: 'USD Coin (devnet)', decimals: 6 },
  'EkbMd5F17QVqmFJs48cBJ3hSnSiPD1BMSX4MNmtVMkV': { symbol: 'USDT', name: 'Tether (devnet)',   decimals: 6 },
  '9d4hVSzi4W6VoAp5dNgxsHNiFmZpq9RiK5vHtmip8asU': { symbol: 'BBT',  name: 'BlockBite Token',  decimals: 6 },
};

// Well-known mainnet mints
export const KNOWN_MAINNET_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  'So11111111111111111111111111111111111111112':    { symbol: 'SOL',   name: 'Wrapped SOL',  decimals: 9 },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC',  name: 'USD Coin',     decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT',  name: 'Tether USD',   decimals: 6 },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL',  name: 'Marinade SOL', decimals: 9 },
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': { symbol: 'jitoSOL', name: 'JitoSOL',  decimals: 9 },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK',  name: 'Bonk',         decimals: 5 },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY',   name: 'Raydium',      decimals: 6 },
};

export interface WalletToken {
  mint:     string;
  symbol:   string;
  name:     string;
  decimals: number;
  balance:  bigint;      // raw balance in base units
  balanceUI: number;     // human-readable
  ata:      string;      // token account address
  logoURI?: string;
  isKnown:  boolean;
}

/** Fetch ALL SPL token accounts owned by wallet from chain */
export async function fetchWalletTokens(
  connection: Connection,
  wallet: PublicKey,
  isDevnet = true,
): Promise<WalletToken[]> {
  const knownTokens = isDevnet ? KNOWN_DEVNET_TOKENS : KNOWN_MAINNET_TOKENS;

  const parsed = await connection.getParsedTokenAccountsByOwner(wallet, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });

  const tokens: WalletToken[] = [];

  for (const { pubkey, account } of parsed.value) {
    const data = account.data as ParsedAccountData;
    const info = data.parsed?.info;
    if (!info) continue;

    const mint     = info.mint as string;
    const decimals = info.tokenAmount?.decimals ?? 0;
    const rawAmt   = BigInt(info.tokenAmount?.amount ?? '0');
    const uiAmt    = info.tokenAmount?.uiAmount ?? 0;

    const known = knownTokens[mint];
    tokens.push({
      mint,
      symbol:    known?.symbol ?? mint.slice(0, 6) + '…',
      name:      known?.name   ?? 'Unknown Token',
      decimals,
      balance:   rawAmt,
      balanceUI: uiAmt,
      ata:       pubkey.toBase58(),
      isKnown:   !!known,
    });
  }

  // Sort: known tokens first, then by balance desc
  return tokens.sort((a, b) => {
    if (a.isKnown !== b.isKnown) return a.isKnown ? -1 : 1;
    return Number(b.balance - a.balance);
  });
}

/** Fetch mint info from on-chain for any unknown mint address */
export async function fetchMintInfo(
  connection: Connection,
  mintAddress: string,
  isDevnet = true,
): Promise<{ decimals: number; symbol: string; name: string } | null> {
  try {
    const mintPk = new PublicKey(mintAddress);
    const knownTokens = isDevnet ? KNOWN_DEVNET_TOKENS : KNOWN_MAINNET_TOKENS;

    // Check known registry first
    if (knownTokens[mintAddress]) {
      return knownTokens[mintAddress];
    }

    // Fetch from chain
    const info = await connection.getParsedAccountInfo(mintPk);
    if (!info.value) return null;

    const data = info.value.data as ParsedAccountData;
    if (data.program !== 'spl-token') return null;

    const decimals = data.parsed?.info?.decimals ?? 6;
    return {
      decimals,
      symbol: mintAddress.slice(0, 6) + '…',
      name:   'Custom Token',
    };
  } catch {
    return null;
  }
}

/** Emergency devnet wallet for demo (devnet only, not production) */
export const EMERGENCY_WALLET = {
  publicKey: '3bVYKE4JDMTacAwXMJ7GiZdE7FBzXokC5WPq4nX4ydE8',
  // Secret key stored for devnet demo purposes only
  secretKey: [183,23,140,145,86,200,229,32,97,110,26,112,15,232,18,238,131,209,126,187,11,185,174,215,173,229,201,59,175,124,193,133,38,141,100,59,72,65,121,237,122,254,224,249,226,147,235,104,200,168,30,168,179,56,102,117,187,182,63,44,28,127,141,121],
  solBalance: 2,
  tokens: {
    BBT:  { mint: '9d4hVSzi4W6VoAp5dNgxsHNiFmZpq9RiK5vHtmip8asU', ata: 'Epe7AZmKYtyS6VdES7BppsJkTtfnWChZzexGan9CeFqC', balance: 1_000_000 },
  },
};

/**
 * POST /api/faucet
 * Drips devnet tokens to any wallet.
 *
 * Body: { wallet: string, mint?: string }
 *   - mint = 'SOL'  → devnet SOL airdrop via RPC (no FAUCET_KEYPAIR needed)
 *   - mint = address → SPL token mint (requires FAUCET_KEYPAIR = mint authority)
 *   - mint omitted   → defaults to USDC_MINT
 *
 * Rate-limited: 1 drop per wallet+mint per hour (in-memory).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';
import { USDC_MINT, RPC_URL } from '@/lib/solana/config';

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const lastDrop    = new Map<string, number>();

// ── SOL airdrop alternatives (tried in order) ─────────────────────────────
const SOL_FAUCET_RPCS = [
  RPC_URL,                               // primary (drpc.org)
  'https://api.devnet.solana.com',       // official devnet
];

export async function POST(req: NextRequest) {
  let body: { wallet?: string; mint?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { wallet, mint: mintOverride } = body;
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  let walletPk: PublicKey;
  try { walletPk = new PublicKey(wallet); }
  catch { return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 }); }

  // ── SOL airdrop path — works WITHOUT FAUCET_KEYPAIR ──────────────────────
  // Triggered by mint === 'SOL' or mint === wSOL mint address
  const isSOLRequest =
    mintOverride === 'SOL' ||
    mintOverride === 'So11111111111111111111111111111111111111112';

  if (isSOLRequest) {
    const key  = `${wallet}:SOL`;
    const last = lastDrop.get(key) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60_000);
      return NextResponse.json({ error: `Rate limited — try again in ${wait} min` }, { status: 429 });
    }

    // Try each RPC endpoint for airdrop
    for (const rpc of SOL_FAUCET_RPCS) {
      try {
        const conn = new Connection(rpc, 'confirmed');
        const sig  = await conn.requestAirdrop(walletPk, 2 * LAMPORTS_PER_SOL); // 2 SOL
        await conn.confirmTransaction(sig, 'confirmed');
        lastDrop.set(key, Date.now());
        return NextResponse.json({
          success:   true,
          amount:    2,
          decimals:  9,
          mint:      'SOL',
          signature: sig,
          explorer:  `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
          message:   '2 devnet SOL sent to your wallet!',
        });
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? '';
        // Airdrop RPC limit → try next endpoint
        if (msg.includes('airdrop limit') || msg.includes('rate limit') || msg.includes('429')) continue;
        // For other errors also try next
        continue;
      }
    }

    // All RPC endpoints failed
    return NextResponse.json({
      error:     'Devnet SOL airdrop rate-limited on all endpoints. Try the external faucets below.',
      fallback:  [
        'https://faucet.solana.com',
        'https://faucet.quicknode.com/solana/devnet',
        'https://solfaucet.com',
      ],
    }, { status: 503 });
  }

  // ── SPL token mint path — requires FAUCET_KEYPAIR ─────────────────────────
  const keypairEnv = process.env.FAUCET_KEYPAIR;
  if (!keypairEnv) {
    // Return fallback[] so FaucetButton shows clickable links instead of a raw error
    return NextResponse.json(
      {
        error: 'In-app USDC faucet not configured. Get devnet USDC from the links below:',
        fallback: [
          'https://faucet.circle.com',
          'https://jup.ag/swap/SOL-USDC',
        ],
      },
      { status: 503 },
    );
  }

  const mintAddr = mintOverride ?? USDC_MINT.toBase58();
  let mintPk: PublicKey;
  try { mintPk = new PublicKey(mintAddr); }
  catch { return NextResponse.json({ error: 'Invalid mint address' }, { status: 400 }); }

  // Rate limit per wallet+mint
  const key  = `${wallet}:${mintAddr}`;
  const last = lastDrop.get(key) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60_000);
    return NextResponse.json({ error: `Rate limited — try again in ${wait} min` }, { status: 429 });
  }

  let faucetKp: Keypair;
  try { faucetKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairEnv) as number[])); }
  catch { return NextResponse.json({ error: 'Invalid FAUCET_KEYPAIR format' }, { status: 500 }); }

  const conn = new Connection(RPC_URL, 'confirmed');

  try {
    const mintInfo = await getMint(conn, mintPk);
    if (!mintInfo.mintAuthority?.equals(faucetKp.publicKey)) {
      return NextResponse.json({ error: 'FAUCET_KEYPAIR is not mint authority for this token' }, { status: 403 });
    }

    const decimals = mintInfo.decimals;
    const amount   = BigInt(10_000 * 10 ** decimals);

    const ata = await getOrCreateAssociatedTokenAccount(conn, faucetKp, mintPk, walletPk);
    const sig = await mintTo(conn, faucetKp, mintPk, ata.address, faucetKp, amount);
    lastDrop.set(key, Date.now());

    return NextResponse.json({
      success:   true,
      amount:    10_000,
      decimals,
      mint:      mintAddr,
      ata:       ata.address.toBase58(),
      signature: sig,
      explorer:  `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
      message:   `10,000 tokens sent to your wallet!`,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: `Mint failed: ${(e as Error)?.message}` }, { status: 500 });
  }
}

/** GET /api/faucet — check availability + return links */
export async function GET() {
  return NextResponse.json({
    sol_airdrop:    true,  // always available (no keypair needed)
    token_faucet:   !!process.env.FAUCET_KEYPAIR,
    defaultMint:    USDC_MINT.toBase58(),
    rpc:            RPC_URL,
    externalFaucets: {
      sol:          'https://faucet.solana.com',
      usdc:         'https://faucet.circle.com',
      quicknode:    'https://faucet.quicknode.com/solana/devnet',
      jupiter_swap: 'https://jup.ag/swap/SOL-USDC',
    },
  });
}

/**
 * POST /api/faucet
 * Mints devnet tokens to any wallet.
 *
 * Body: { wallet: string, mint?: string }
 *   - mint defaults to USDC_MINT (BlockBite devnet mock)
 *
 * Requires env: FAUCET_KEYPAIR = JSON array of mint-authority secret key bytes
 * Rate-limited: 1 drop per wallet per hour (in-memory, resets on cold start)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';
import { USDC_MINT, RPC_URL } from '@/lib/solana/config';

const FAUCET_AMOUNT_DEFAULT = 10_000 * 1_000_000; // 10,000 tokens
const COOLDOWN_MS           = 60 * 60 * 1000;      // 1 hour

const lastDrop = new Map<string, number>(); // wallet → timestamp

export async function POST(req: NextRequest) {
  const keypairEnv = process.env.FAUCET_KEYPAIR;
  if (!keypairEnv) {
    return NextResponse.json(
      {
        error: 'Faucet not configured.',
        setup: 'Add FAUCET_KEYPAIR (JSON secret-key array) to Vercel env vars. The keypair must be the mint authority of the token.',
        faucet_sol: 'https://faucet.solana.com',
        faucet_usdc_devnet: 'https://faucet.circle.com',
      },
      { status: 503 },
    );
  }

  let body: { wallet?: string; mint?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { wallet, mint: mintOverride } = body;
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  let walletPk: PublicKey;
  try { walletPk = new PublicKey(wallet); }
  catch { return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 }); }

  const mintAddr = mintOverride ?? USDC_MINT.toBase58();
  let mintPk: PublicKey;
  try { mintPk = new PublicKey(mintAddr); }
  catch { return NextResponse.json({ error: 'Invalid mint address' }, { status: 400 }); }

  // Rate limit per wallet+mint combo
  const key  = `${wallet}:${mintAddr}`;
  const last = lastDrop.get(key) ?? 0;
  const now  = Date.now();
  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 60_000);
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

    lastDrop.set(key, now);

    return NextResponse.json({
      success:   true,
      amount:    10_000,
      decimals,
      mint:      mintAddr,
      ata:       ata.address.toBase58(),
      signature: sig,
      explorer:  `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: `Mint failed: ${(e as Error)?.message}` }, { status: 500 });
  }
}

/** GET /api/faucet — check if faucet is available + return external faucet links */
export async function GET() {
  return NextResponse.json({
    available:         !!process.env.FAUCET_KEYPAIR,
    defaultMint:       USDC_MINT.toBase58(),
    rpc:               RPC_URL,
    externalFaucets: {
      sol:   'https://faucet.solana.com',
      usdc:  'https://faucet.circle.com',
      quicknode: 'https://faucet.quicknode.com/solana/devnet',
    },
  });
}

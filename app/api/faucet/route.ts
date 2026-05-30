/**
 * POST /api/faucet
 * Mints devnet BBT/USDC test tokens to the requesting wallet.
 * Requires FAUCET_KEYPAIR env var (base58 JSON array of the mint authority keypair).
 * Rate-limited to 1 request per wallet per hour via in-memory map.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection, Keypair, PublicKey,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
} from '@solana/spl-token';
import { USDC_MINT, RPC_URL } from '@/lib/solana/config';

const FAUCET_AMOUNT = 10_000 * 1_000_000; // 10,000 tokens (6 decimals)
const COOLDOWN_MS   = 60 * 60 * 1000;     // 1 hour

// In-memory rate limit — resets on cold start (acceptable for devnet faucet)
const lastDrop = new Map<string, number>();

export async function POST(req: NextRequest) {
  const keypairEnv = process.env.FAUCET_KEYPAIR;
  if (!keypairEnv) {
    return NextResponse.json(
      { error: 'Faucet not configured. Add FAUCET_KEYPAIR to Vercel env vars.' },
      { status: 503 },
    );
  }

  let body: { wallet?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { wallet } = body;
  if (!wallet) return NextResponse.json({ error: 'wallet address required' }, { status: 400 });

  let walletPk: PublicKey;
  try { walletPk = new PublicKey(wallet); }
  catch { return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 }); }

  // Rate limit
  const last = lastDrop.get(wallet) ?? 0;
  const now  = Date.now();
  if (now - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 60_000);
    return NextResponse.json(
      { error: `Rate limited — try again in ${wait} minute(s)` },
      { status: 429 },
    );
  }

  // Load faucet keypair
  let faucetKeypair: Keypair;
  try {
    faucetKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(keypairEnv) as number[]),
    );
  } catch {
    return NextResponse.json({ error: 'Invalid FAUCET_KEYPAIR format' }, { status: 500 });
  }

  const connection = new Connection(RPC_URL, 'confirmed');

  try {
    // Verify faucet keypair is the mint authority
    const mintInfo = await getMint(connection, USDC_MINT);
    if (!mintInfo.mintAuthority?.equals(faucetKeypair.publicKey)) {
      return NextResponse.json(
        { error: 'FAUCET_KEYPAIR is not the mint authority for this token' },
        { status: 500 },
      );
    }

    // Get or create recipient ATA
    const ata = await getOrCreateAssociatedTokenAccount(
      connection, faucetKeypair, USDC_MINT, walletPk,
    );

    // Mint tokens
    const sig = await mintTo(
      connection, faucetKeypair, USDC_MINT, ata.address,
      faucetKeypair, FAUCET_AMOUNT,
    );

    lastDrop.set(wallet, now);

    return NextResponse.json({
      success: true,
      amount: FAUCET_AMOUNT / 1_000_000,
      token: 'BBT/USDC (devnet)',
      mint: USDC_MINT.toBase58(),
      ata: ata.address.toBase58(),
      signature: sig,
      explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Mint failed: ${msg}` }, { status: 500 });
  }
}

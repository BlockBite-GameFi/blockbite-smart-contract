/**
 * POST /api/faucet
 * Sends devnet tokens to any wallet from the deployer wallet.
 * Emergency use when public faucet is blocked.
 *
 * Body: { wallet: string, asset: "SOL" | "BBT" | "USDC" | "wSOL" }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection, Keypair, PublicKey, Transaction, SystemProgram,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from '@solana/spl-token';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

const RPC       = 'https://api.devnet.solana.com';
const BBT_MINT  = new PublicKey('9d4hVSzi4W6VoAp5dNgxsHNiFmZpq9RiK5vHtmip8asU');
const USDC_MINT = new PublicKey('ZLkYWYvM4ZEDcPcvmcxmcgTgvsWRCXqg9ZYyQuf7njU');
const DRIP      = { SOL: 0.5, WSOL: 1, BBT: 10_000, USDC: 100 };

function loadFaucet(): Keypair | null {
  try {
    const raw = process.env.DEVNET_FAUCET_KEYPAIR;
    if (!raw) return null;
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { wallet?: string; asset?: string };
  const { wallet, asset = 'BBT' } = body;

  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });

  let targetPk: PublicKey;
  try { targetPk = new PublicKey(wallet); }
  catch { return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 }); }

  const faucet = loadFaucet();
  if (!faucet) return NextResponse.json({ error: 'Faucet not configured (DEVNET_FAUCET_KEYPAIR missing)' }, { status: 503 });

  const conn = new Connection(RPC, 'confirmed');

  try {
    const tx = new Transaction();
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = faucet.publicKey;

    const assetUpper = asset.toUpperCase();

    if (assetUpper === 'SOL') {
      tx.add(SystemProgram.transfer({
        fromPubkey: faucet.publicKey,
        toPubkey:   targetPk,
        lamports:   DRIP.SOL * LAMPORTS_PER_SOL,
      }));
      const sig = await sendAndConfirmTransaction(conn, tx, [faucet]);
      return NextResponse.json({ sig, asset: 'SOL', amount: DRIP.SOL,
        explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` });
    }

    if (assetUpper === 'WSOL' || assetUpper === 'SOL_WRAPPED') {
      const targetWSOL = await getOrCreateAssociatedTokenAccount(conn, faucet, NATIVE_MINT, targetPk);
      tx.add(SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: targetWSOL.address, lamports: DRIP.WSOL * LAMPORTS_PER_SOL }));
      tx.add(createSyncNativeInstruction(targetWSOL.address));
      const sig = await sendAndConfirmTransaction(conn, tx, [faucet]);
      return NextResponse.json({ sig, asset: 'wSOL', amount: DRIP.WSOL,
        explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` });
    }

    if (assetUpper === 'BBT') {
      const fromATA = await getOrCreateAssociatedTokenAccount(conn, faucet, BBT_MINT, faucet.publicKey);
      const toATA   = await getOrCreateAssociatedTokenAccount(conn, faucet, BBT_MINT, targetPk);
      tx.add(createTransferInstruction(fromATA.address, toATA.address, faucet.publicKey, BigInt(DRIP.BBT) * 1_000_000n));
      const sig = await sendAndConfirmTransaction(conn, tx, [faucet]);
      return NextResponse.json({ sig, asset: 'BBT', amount: DRIP.BBT,
        explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` });
    }

    if (assetUpper === 'USDC') {
      const fromATA = await getOrCreateAssociatedTokenAccount(conn, faucet, USDC_MINT, faucet.publicKey);
      const toATA   = await getOrCreateAssociatedTokenAccount(conn, faucet, USDC_MINT, targetPk);
      tx.add(createTransferInstruction(fromATA.address, toATA.address, faucet.publicKey, BigInt(DRIP.USDC) * 1_000_000n));
      const sig = await sendAndConfirmTransaction(conn, tx, [faucet]);
      return NextResponse.json({ sig, asset: 'USDC', amount: DRIP.USDC,
        explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` });
    }

    return NextResponse.json({ error: `Unknown asset: ${asset}. Use SOL, wSOL, BBT, or USDC` }, { status: 400 });

  } catch (e: unknown) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 });
  }
}

export async function GET() {
  const faucet = loadFaucet();
  if (!faucet) return NextResponse.json({ status: 'not_configured' });
  const conn = new Connection(RPC, 'confirmed');
  const sol = await conn.getBalance(faucet.publicKey).catch(() => 0);
  return NextResponse.json({
    status: 'ok',
    address: faucet.publicKey.toBase58(),
    sol: (sol / LAMPORTS_PER_SOL).toFixed(3),
    drip: DRIP,
    tokens: { BBT: BBT_MINT.toBase58(), USDC: USDC_MINT.toBase58() },
  });
}

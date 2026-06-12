import { NextRequest, NextResponse } from 'next/server';
import {
  Connection, PublicKey, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import { gameAuthorityKeypair, validateSession } from '@/lib/server/game-authority';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_CAMPAIGN_PROGRAM_ID || 'Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq',
);
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';

const DISCRIMINATOR_VERIFY_GAME = [81, 26, 37, 190, 207, 209, 205, 211];

function buildVerifyIx(
  campaignPda:   PublicKey,
  milestonePda:  PublicKey,
  milestoneSeed: bigint,
  achievedLevel: number,
): TransactionInstruction {
  const data = Buffer.alloc(17);
  Buffer.from(DISCRIMINATOR_VERIFY_GAME).copy(data, 0);
  data.writeBigUInt64LE(milestoneSeed, 8);
  data[16] = achievedLevel;
  return new TransactionInstruction({
    keys: [
      { pubkey: campaignPda,                        isSigner: false, isWritable: false },
      { pubkey: milestonePda,                       isSigner: false, isWritable: true  },
      { pubkey: gameAuthorityKeypair.publicKey,     isSigner: true,  isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      userId?:        string;
      campaignPda?:   string;
      milestoneSeed?: string;
      achievedLevel?: number;
      gameSessionId?: string;
    };

    const { userId, campaignPda: campaignStr, milestoneSeed, achievedLevel, gameSessionId } = body;

    // Validate required fields
    if (!userId || !campaignStr || !milestoneSeed || typeof achievedLevel !== 'number' || !gameSessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (achievedLevel < 1 || achievedLevel > 30) {
      return NextResponse.json({ error: 'achievedLevel must be 1–30' }, { status: 400 });
    }

    // Validate game session
    if (!validateSession(userId, gameSessionId, achievedLevel)) {
      return NextResponse.json({ error: 'Game verification failed — level not achieved' }, { status: 403 });
    }

    // Derive milestone PDA
    const campaignPda  = new PublicKey(campaignStr);
    const seedBig      = BigInt(milestoneSeed);
    const [milestonePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('milestone'),
        campaignPda.toBuffer(),
        Buffer.from(new BigUint64Array([seedBig]).buffer),
      ],
      PROGRAM_ID,
    );

    // Build + sign + send tx
    const connection = new Connection(RPC_URL, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = gameAuthorityKeypair.publicKey;
    tx.add(buildVerifyIx(campaignPda, milestonePda, seedBig, achievedLevel));
    tx.sign(gameAuthorityKeypair);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    return NextResponse.json({ ok: true, signature, achievedLevel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[game/verify]', msg);

    // Translate common on-chain failures into actionable messages
    const lower = msg.toLowerCase();
    if (lower.includes('no record of a prior credit') || lower.includes('insufficient')) {
      return NextResponse.json({
        error:   'Game authority not funded',
        message: `The game authority wallet (${gameAuthorityKeypair.publicKey.toBase58()}) has no devnet SOL to pay the verification fee. Fund it with ~0.1 SOL or set GAME_AUTHORITY_SECRET_KEY to a funded keypair.`,
      }, { status: 503 });
    }
    if (lower.includes('could not find account') || lower.includes('account does not exist')) {
      return NextResponse.json({
        error:   'Milestone not found',
        message: 'No milestone account exists on-chain for this campaign + seed. Create the campaign milestone first.',
      }, { status: 404 });
    }
    return NextResponse.json({ error: 'Verification failed', message: msg }, { status: 500 });
  }
}

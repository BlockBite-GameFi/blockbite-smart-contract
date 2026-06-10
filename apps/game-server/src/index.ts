import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

dotenv.config();

// ── Configuration ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey(
  process.env.BLOCKBITE_PROGRAM_ID || "9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX"
);

// Game authority keypair — loaded from base58 secret key in env
const GAME_AUTHORITY_SECRET = process.env.GAME_AUTHORITY_SECRET_KEY;
if (!GAME_AUTHORITY_SECRET) {
  throw new Error("GAME_AUTHORITY_SECRET_KEY environment variable is required");
}
const secretKey = bs58.decode(GAME_AUTHORITY_SECRET);
const gameAuthorityKeypair = Keypair.fromSecretKey(
  nacl.sign.keyPair.fromSeed(secretKey.slice(0, 32)).secretKey
);

const connection = new Connection(RPC_URL, "confirmed");

// ── Validation Schemas ───────────────────────────────────────────────────────

const VerifyRequestSchema = z.object({
  userId: z.string().min(1),
  campaignPda: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  milestoneSeed: z.string().regex(/^\d+$/),
  achievedLevel: z.number().int().min(1).max(30),
  gameSessionId: z.string().min(1),
});

// ── Game Logic (replace with real game backend integration) ──────────────────

interface GameSession {
  userId: string;
  sessionId: string;
  achievedLevel: number;
  completedAt: Date;
}

// In-memory session store — replace with Redis/database in production
const gameSessions = new Map<string, GameSession>();

/**
 * Validates that the user actually achieved the claimed level.
 * In production, this queries your game database/backend.
 */
async function validateGameCompletion(
  userId: string,
  sessionId: string,
  claimedLevel: number
): Promise<boolean> {
  const session = gameSessions.get(sessionId);
  if (!session) return false;
  if (session.userId !== userId) return false;
  // Game server is the source of truth — only sign if level matches
  return session.achievedLevel >= claimedLevel;
}

/**
 * Simulates a game session for testing.
 * Remove in production — use real game backend.
 */
function simulateGameCompletion(
  userId: string,
  sessionId: string,
  level: number
): void {
  gameSessions.set(sessionId, {
    userId,
    sessionId,
    achievedLevel: level,
    completedAt: new Date(),
  });
}

// ── Solana Transaction Builder ───────────────────────────────────────────────

const DISCRIMINATOR_VERIFY_GAME = [81, 26, 37, 190, 207, 209, 205, 211];

function buildVerifyGameInstruction(
  campaignPda: PublicKey,
  milestonePda: PublicKey,
  milestoneSeed: bigint,
  achievedLevel: number
): TransactionInstruction {
  const data = Buffer.alloc(17);
  Buffer.from(DISCRIMINATOR_VERIFY_GAME).copy(data, 0);
  data.writeBigUInt64LE(milestoneSeed, 8);
  data[16] = achievedLevel;

  return new TransactionInstruction({
    keys: [
      { pubkey: campaignPda, isSigner: false, isWritable: false },
      { pubkey: milestonePda, isSigner: false, isWritable: true },
      { pubkey: gameAuthorityKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

async function submitVerifyGame(
  campaignPda: PublicKey,
  milestonePda: PublicKey,
  milestoneSeed: bigint,
  achievedLevel: number
): Promise<string> {
  const ix = buildVerifyGameInstruction(
    campaignPda,
    milestonePda,
    milestoneSeed,
    achievedLevel
  );

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = gameAuthorityKeypair.publicKey;

  tx.sign(gameAuthorityKeypair);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });

  return signature;
}

// ── Express Server ───────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    gameAuthority: gameAuthorityKeypair.publicKey.toBase58(),
    programId: PROGRAM_ID.toBase58(),
    rpcUrl: RPC_URL,
  });
});

// Test endpoint: simulate game completion (remove in production)
app.post("/api/test/simulate-game", (req, res) => {
  const { userId, sessionId, level } = req.body;
  if (!userId || !sessionId || !level) {
    return res.status(400).json({ error: "Missing userId, sessionId, or level" });
  }
  simulateGameCompletion(userId, sessionId, level);
  res.json({ ok: true, message: `Simulated level ${level} for user ${userId}` });
});

// Main verification endpoint
app.post("/api/verify", async (req, res) => {
  try {
    const parsed = VerifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
    }

    const { userId, campaignPda: campaignPdaStr, milestoneSeed, achievedLevel, gameSessionId } =
      parsed.data;

    // 1. Validate game completion (source of truth is game server)
    const isValid = await validateGameCompletion(
      userId,
      gameSessionId,
      achievedLevel
    );
    if (!isValid) {
      return res.status(403).json({
        error: "Game verification failed",
        message: "User has not completed the required level",
      });
    }

    // 2. Parse PDAs
    const campaignPda = new PublicKey(campaignPdaStr);
    const milestoneSeedBig = BigInt(milestoneSeed);

    const [milestonePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("milestone"),
        campaignPda.toBuffer(),
        Buffer.from(new BigUint64Array([milestoneSeedBig]).buffer),
      ],
      PROGRAM_ID
    );

    // 3. Sign and submit verify_game transaction
    const signature = await submitVerifyGame(
      campaignPda,
      milestonePda,
      milestoneSeedBig,
      achievedLevel
    );

    res.json({
      ok: true,
      signature,
      message: "Game verification successful",
      achievedLevel,
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🎮 Game Server running on http://localhost:${PORT}`);
  console.log(`🔑 Game Authority: ${gameAuthorityKeypair.publicKey.toBase58()}`);
  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`📦 Program: ${PROGRAM_ID.toBase58()}`);
});

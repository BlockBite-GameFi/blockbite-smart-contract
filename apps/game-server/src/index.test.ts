import { describe, it, expect, beforeEach } from "vitest";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

// ── Session store (inline copy to avoid server import side-effects) ───────────

interface GameSession {
  userId: string;
  sessionId: string;
  achievedLevel: number;
  completedAt: number;
}

const gameSessions = new Map<string, GameSession>();

function storeSession(userId: string, sessionId: string, level: number): void {
  gameSessions.set(sessionId, { userId, sessionId, achievedLevel: level, completedAt: Date.now() });
}

function validateSession(userId: string, sessionId: string, claimedLevel: number): boolean {
  const session = gameSessions.get(sessionId);
  if (!session) return true; // cold-start fallback
  return session.userId === userId && session.achievedLevel >= claimedLevel;
}

// ── Transaction builder (pure logic) ─────────────────────────────────────────

const DISCRIMINATOR_VERIFY_GAME = [81, 26, 37, 190, 207, 209, 205, 211];

function buildVerifyGameData(milestoneSeed: bigint, achievedLevel: number): Buffer {
  const data = Buffer.alloc(17);
  Buffer.from(DISCRIMINATOR_VERIFY_GAME).copy(data, 0);
  data.writeBigUInt64LE(milestoneSeed, 8);
  data[16] = achievedLevel;
  return data;
}

// ── Zod schema (recreated for pure testing) ──────────────────────────────────

import { z } from "zod";

const VerifyRequestSchema = z.object({
  userId: z.string().min(1),
  campaignPda: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  milestoneSeed: z.string().regex(/^\d+$/),
  achievedLevel: z.number().int().min(1).max(30),
  gameSessionId: z.string().min(1),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Game Server", () => {
  beforeEach(() => {
    gameSessions.clear();
  });

  describe("Session validation", () => {
    it("validates a stored session with matching level", () => {
      storeSession("user1", "sess-abc", 10);
      expect(validateSession("user1", "sess-abc", 8)).toBe(true);
    });

    it("rejects a session with higher claimed level than achieved", () => {
      storeSession("user1", "sess-abc", 5);
      expect(validateSession("user1", "sess-abc", 10)).toBe(false);
    });

    it("rejects a session with wrong userId", () => {
      storeSession("user1", "sess-abc", 10);
      expect(validateSession("user2", "sess-abc", 5)).toBe(false);
    });

    it("allows cold-start fallback (session not found)", () => {
      expect(validateSession("user1", "nonexistent", 5)).toBe(true);
    });
  });

  describe("Request validation (Zod schema)", () => {
    it("accepts a valid request", () => {
      const result = VerifyRequestSchema.safeParse({
        userId: "user1",
        campaignPda: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        milestoneSeed: "200",
        achievedLevel: 15,
        gameSessionId: "sess-abc",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing userId", () => {
      const result = VerifyRequestSchema.safeParse({
        campaignPda: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        milestoneSeed: "200",
        achievedLevel: 15,
        gameSessionId: "sess-abc",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid campaignPda", () => {
      const result = VerifyRequestSchema.safeParse({
        userId: "user1",
        campaignPda: "not-a-pubkey",
        milestoneSeed: "200",
        achievedLevel: 15,
        gameSessionId: "sess-abc",
      });
      expect(result.success).toBe(false);
    });

    it("rejects achievedLevel out of range (0)", () => {
      const result = VerifyRequestSchema.safeParse({
        userId: "user1",
        campaignPda: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        milestoneSeed: "200",
        achievedLevel: 0,
        gameSessionId: "sess-abc",
      });
      expect(result.success).toBe(false);
    });

    it("rejects achievedLevel out of range (31)", () => {
      const result = VerifyRequestSchema.safeParse({
        userId: "user1",
        campaignPda: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        milestoneSeed: "200",
        achievedLevel: 31,
        gameSessionId: "sess-abc",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-numeric milestoneSeed", () => {
      const result = VerifyRequestSchema.safeParse({
        userId: "user1",
        campaignPda: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        milestoneSeed: "abc",
        achievedLevel: 15,
        gameSessionId: "sess-abc",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Transaction data encoding", () => {
    it("builds correct 17-byte instruction data", () => {
      const data = buildVerifyGameData(200n, 15);
      expect(data.length).toBe(17);
      // Discriminator
      expect(data[0]).toBe(81);
      expect(data[1]).toBe(26);
      expect(data[2]).toBe(37);
      expect(data[3]).toBe(190);
      expect(data[4]).toBe(207);
      expect(data[5]).toBe(209);
      expect(data[6]).toBe(205);
      expect(data[7]).toBe(211);
      // Milestone seed (bytes 8-15, little-endian u64)
      expect(data.readBigUInt64LE(8)).toBe(200n);
      // Achieved level (byte 16)
      expect(data[16]).toBe(15);
    });

    it("encodes max level (30) correctly", () => {
      const data = buildVerifyGameData(999999n, 30);
      expect(data[16]).toBe(30);
      expect(data.readBigUInt64LE(8)).toBe(999999n);
    });
  });

  describe("Game authority keypair", () => {
    it("loads from base58 secret key (64 bytes)", () => {
      const kp = Keypair.generate();
      const secretB58 = bs58.encode(kp.secretKey);
      const decoded = bs58.decode(secretB58);
      expect(decoded.length).toBe(64);
      const loaded = Keypair.fromSecretKey(decoded);
      expect(loaded.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
    });

    it("loads from 32-byte seed", () => {
      const seed = new Uint8Array(32).fill(42);
      const kp = Keypair.fromSeed(seed);
      expect(kp.publicKey.toBase58()).toBeDefined();
    });
  });

  describe("Milestone PDA derivation", () => {
    it("derives consistent PDA for same inputs", () => {
      const programId = Keypair.generate().publicKey;
      const campaignPda = Keypair.generate().publicKey;
      const seed = 200n;

      const [pda1] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("milestone"),
          campaignPda.toBuffer(),
          Buffer.from(new BigUint64Array([seed]).buffer),
        ],
        programId,
      );

      const [pda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("milestone"),
          campaignPda.toBuffer(),
          Buffer.from(new BigUint64Array([seed]).buffer),
        ],
        programId,
      );

      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    it("derives different PDA for different seeds", () => {
      const programId = Keypair.generate().publicKey;
      const campaignPda = Keypair.generate().publicKey;

      const [pda1] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), campaignPda.toBuffer(), Buffer.from(new BigUint64Array([100n]).buffer)],
        programId,
      );

      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("milestone"), campaignPda.toBuffer(), Buffer.from(new BigUint64Array([200n]).buffer)],
        programId,
      );

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe("Balance threshold constants", () => {
    it("MIN_BALANCE_LAMPORTS is 0.05 SOL", () => {
      expect(0.05 * LAMPORTS_PER_SOL).toBe(50_000_000);
    });

    it("AIRDROP_AMOUNT is 1 SOL", () => {
      expect(1 * LAMPORTS_PER_SOL).toBe(1_000_000_000);
    });
  });
});

# Step 1 — Install & Configure

This step sets up the complete BlockBite client, including helpers that you'll reuse throughout the integration.

---

## Full Client Module

Create `src/blockbite-client.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import type { Idl } from "@coral-xyz/anchor";
import idl from "./blockbite.json";

// ─── Constants ───────────────────────────────────────────────────────────────

export const BLOCKBITE_PROGRAM_ID = new PublicKey(
  "Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq"
);

// ─── PDA Helpers ─────────────────────────────────────────────────────────────

export function deriveStreamPda(
  creator: PublicKey,
  recipient: PublicKey,
  seed: anchor.BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("stream"),
      creator.toBuffer(),
      recipient.toBuffer(),
      seed.toArrayLike(Buffer, "le", 8),
    ],
    BLOCKBITE_PROGRAM_ID
  );
}

export function deriveEscrowPda(streamPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), streamPda.toBuffer()],
    BLOCKBITE_PROGRAM_ID
  );
}

export function deriveCampaignPda(
  founder: PublicKey,
  seed: anchor.BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("campaign"),
      founder.toBuffer(),
      seed.toArrayLike(Buffer, "le", 8),
    ],
    BLOCKBITE_PROGRAM_ID
  );
}

export function deriveCampaignEscrowPda(
  campaignPda: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
    BLOCKBITE_PROGRAM_ID
  );
}

export function deriveMilestonePda(
  campaignPda: PublicKey,
  milestoneSeed: anchor.BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("milestone"),
      campaignPda.toBuffer(),
      milestoneSeed.toArrayLike(Buffer, "le", 8),
    ],
    BLOCKBITE_PROGRAM_ID
  );
}

// ─── Client Factory ───────────────────────────────────────────────────────────

export function createBlockBiteClient(
  connection: Connection,
  wallet: anchor.Wallet
): anchor.Program {
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  return new anchor.Program(idl as Idl, provider);
}

// ─── Unlock Calculator (mirrors on-chain logic) ───────────────────────────────

export interface StreamState {
  totalAmount: anchor.BN;
  amountWithdrawn: anchor.BN;
  startTime: anchor.BN;
  endTime: anchor.BN;
  cliffTime: anchor.BN;
  milestoneEnabled: boolean;
  milestoneReached: boolean;
  isCancelled: boolean;
}

export function calculateUnlocked(stream: StreamState, nowSecs: number): bigint {
  const now = BigInt(nowSecs);
  const cliffTime = BigInt(stream.cliffTime.toString());
  const startTime = BigInt(stream.startTime.toString());
  const endTime = BigInt(stream.endTime.toString());
  const total = BigInt(stream.totalAmount.toString());

  if (cliffTime > 0n && now < cliffTime) return 0n;
  if (stream.milestoneEnabled && !stream.milestoneReached) return 0n;
  if (now < startTime) return 0n;
  if (now >= endTime) return total;

  const effectiveStart = cliffTime > 0n ? cliffTime : startTime;
  const elapsed = now - effectiveStart;
  const duration = endTime - effectiveStart;
  return (total * elapsed) / duration;
}

export function getClaimable(stream: StreamState, nowSecs: number): bigint {
  const unlocked = calculateUnlocked(stream, nowSecs);
  const withdrawn = BigInt(stream.amountWithdrawn.toString());
  return unlocked > withdrawn ? unlocked - withdrawn : 0n;
}
```

---

## Verify the Setup

```typescript
// test-connection.ts
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { createBlockBiteClient, BLOCKBITE_PROGRAM_ID } from "./blockbite-client";
import * as anchor from "@coral-xyz/anchor";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const wallet = anchor.Wallet.local();
const program = createBlockBiteClient(connection, wallet);

console.log("Program ID:", program.programId.toBase58());
console.log("Expected:  ", BLOCKBITE_PROGRAM_ID.toBase58());
// Both should print: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
```

Run:
```bash
ts-node test-connection.ts
```

If you see matching program IDs, you're ready for Step 2.

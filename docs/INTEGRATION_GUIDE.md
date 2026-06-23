# BlockBite — Integration Guide

This guide walks you through integrating with the BlockBite on-chain program from scratch. By the end you will have a working TypeScript client that creates a vesting stream, withdraws tokens, and interacts with the campaign/milestone reward system.

**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Last updated:** 2026-06-20  
**Reviewed for clarity by:** BlockBite Marketing Team ✅

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Dependencies](#2-install-dependencies)
3. [Load the IDL and Program](#3-load-the-idl-and-program)
4. [Create a Token Mint (for testing)](#4-create-a-token-mint-for-testing)
5. [Derive PDAs](#5-derive-pdas)
6. [Create a Stream](#6-create-a-stream)
7. [Withdraw Vested Tokens](#7-withdraw-vested-tokens-as-recipient)
8. [Cancel a Stream](#8-cancel-a-stream-as-creator)
9. [Milestone-Gated Stream](#9-milestone-gated-stream-optional)
10. [Campaign & Milestone Rewards](#10-campaign--milestone-rewards)
11. [Read On-Chain State](#11-read-on-chain-state)
12. [Close a Stream](#12-close-a-stream-rent-recovery)
13. [Complete Quickstart Script](#13-complete-quickstart-script)
14. [Common Errors & Fixes](#common-errors--fixes)
15. [Next Steps](#next-steps)

---

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Yarn or npm | latest | `npm i -g yarn` |
| Solana CLI | 2.3.0+ | [docs.solanalabs.com](https://docs.solanalabs.com/cli/install) |
| `@coral-xyz/anchor` | 1.0.0 | via `npm install` below |
| `@solana/spl-token` | ^0.4.x | via `npm install` below |
| `@solana/web3.js` | ^1.x | via `npm install` below |

You also need a funded Solana wallet. For devnet:

```bash
solana-keygen new -o ~/.config/solana/id.json   # skip if you already have one
solana config set --url devnet
solana airdrop 2
```

---

## 2. Install Dependencies

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

Or with yarn:

```bash
yarn add @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

---

## 3. Load the IDL and Program

The IDL (Interface Definition Language) is the ABI of the program. Fetch it directly from the chain — no local file needed.

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ── Connection & wallet ───────────────────────────────────────────────────────
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Load your wallet keypair — adjust path as needed
const wallet = new anchor.Wallet(
  Keypair.fromSecretKey(
    Uint8Array.from(
      require(require("os").homedir() + "/.config/solana/id.json")
    )
  )
);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

// ── Program ───────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq"); // devnet

// Fetch IDL from chain — no local file needed
const idl     = await Program.fetchIdl(PROGRAM_ID, provider);
const program  = new Program(idl!, provider);

console.log("Connected to BlockBite:", PROGRAM_ID.toBase58());
```

> **Localnet:** Replace the program ID with `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` and import the IDL from `../target/idl/blockbite.json` after `anchor build`.

---

## 4. Create a Token Mint (for testing)

Skip this step if you already have a devnet token mint to test with.

```typescript
// Create a fresh SPL token mint
const mint = await createMint(
  connection,
  wallet.payer,      // payer
  wallet.publicKey,  // mint authority
  null,              // freeze authority (none)
  6                  // decimals
);
console.log("Mint:", mint.toBase58());

// Fund the creator's token account
const creatorAta = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet.payer,
  mint,
  wallet.publicKey
);
await mintTo(
  connection,
  wallet.payer,
  mint,
  creatorAta.address,
  wallet.payer,
  10_000_000  // 10 tokens with 6 decimals
);
console.log("Creator ATA funded:", creatorAta.address.toBase58());
```

---

## 5. Derive PDAs

BlockBite uses deterministic Program Derived Addresses (PDAs). Compute them client-side before calling any instruction — no RPC call required.

```typescript
const recipientPublicKey = new PublicKey("..."); // replace with actual recipient

// Pick a unique seed per stream (timestamp is convenient for demos)
const seed = new BN(Date.now());

// Stream state account PDA — seeds: ["stream", creator, recipient, seed_le]
const [streamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    wallet.publicKey.toBuffer(),       // creator
    recipientPublicKey.toBuffer(),     // recipient
    seed.toArrayLike(Buffer, "le", 8), // seed as little-endian u64
  ],
  PROGRAM_ID
);

// Escrow token vault PDA — seeds: ["escrow", stream_pubkey]
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  PROGRAM_ID
);

console.log("Stream PDA:", streamPda.toBase58());
console.log("Escrow PDA:", escrowPda.toBase58());
```

> **Rule:** The seed must be the same `u64` value you pass as the `seed` parameter to `create_stream`. Using `Date.now()` guarantees uniqueness per call.

---

## 6. Create a Stream

This deposits tokens into the on-chain escrow and initialises the vesting schedule.

```typescript
// Ensure recipient has an ATA so they can receive tokens later
const recipientAta = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet.payer,
  mint,
  recipientPublicKey
);

const now       = Math.floor(Date.now() / 1000);
const startTime = new BN(now);
const endTime   = new BN(now + 86_400); // 24 hours of linear vesting
const cliffTime = new BN(0);            // no cliff

// Helper: encode stream name into 32-byte null-padded buffer
function encodeStreamName(label: string): number[] {
  const buf = Buffer.alloc(32, 0);
  Buffer.from(label.slice(0, 31), "utf8").copy(buf);
  return Array.from(buf);
}

const tx = await program.methods
  .createStream(
    new BN(1_000_000),                    // total_amount: 1 000 000 token units
    startTime,
    endTime,
    cliffTime,
    seed,
    false,                                // milestone_enabled: false → pure linear vesting
    encodeStreamName("Team Salary Q1")    // name: display label, max 31 chars
  )
  .accounts({
    creator: wallet.publicKey,
    recipient: recipientPublicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    escrowTokenAccount: escrowPda,
    stream: streamPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

console.log("Stream created! Tx:", tx);
```

**What just happened:**  
- A `StreamAccount` PDA is initialised with the vesting schedule  
- `1_000_000` token units are transferred from your wallet into `escrowPda`  
- The recipient can now call `withdraw` at any point after `start_time`

---

## 7. Withdraw Vested Tokens (as recipient)

The recipient claims all currently unlocked tokens. This can be called multiple times — each call only moves the newly unlocked delta.

```typescript
// This transaction must be signed by the recipient keypair
const recipientKeypair = Keypair.fromSecretKey(/* ... */);
const recipientWallet   = new anchor.Wallet(recipientKeypair);
const recipientProvider = new AnchorProvider(connection, recipientWallet, { commitment: "confirmed" });
const recipientProgram  = new Program(idl!, recipientProvider);

const withdrawTx = await recipientProgram.methods
  .withdraw()
  .accounts({
    recipient: recipientKeypair.publicKey,
    stream: streamPda,
    mint,
    escrowTokenAccount: escrowPda,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([recipientKeypair])
  .rpc();

console.log("Withdrew tokens! Tx:", withdrawTx);

// Check progress
const streamState = await program.account.streamAccount.fetch(streamPda);
console.log("Amount withdrawn:", streamState.amountWithdrawn.toString());
```

> **Tip:** Cliff or milestone gates cause `NothingToWithdraw` — the cliff period has not passed, or the creator has not called `set_milestone` yet.

---

## 8. Cancel a Stream (as creator)

The creator cancels the stream at any time before it is fully vested. The on-chain program atomically splits the escrow: vested tokens go to the recipient, unvested tokens return to the creator.

```typescript
const cancelTx = await program.methods
  .cancel()
  .accounts({
    creator: wallet.publicKey,
    stream: streamPda,
    mint,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();

console.log("Stream cancelled! Tx:", cancelTx);
// Vested portion → recipient ATA
// Unvested portion → creator ATA
// Both transfers happen atomically in one transaction
```

---

## 9. Milestone-Gated Stream (Optional)

Use this when you want tokens locked until the creator manually confirms a KPI has been hit (e.g. product launch, governance vote, sales target).

```typescript
// Create a milestone-gated stream
const mseed = new BN(Date.now() + 1);
const [msStreamPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("stream"), wallet.publicKey.toBuffer(), recipientPublicKey.toBuffer(), mseed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [msEscrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), msStreamPda.toBuffer()],
  PROGRAM_ID
);

// milestone_enabled = true — recipient CANNOT withdraw until set_milestone is called
await program.methods
  .createStream(
    new BN(500_000),
    new BN(Math.floor(Date.now() / 1000)),
    new BN(Math.floor(Date.now() / 1000) + 86_400),
    new BN(0),    // no cliff
    mseed,
    true          // ← milestone_enabled
  )
  .accounts({
    creator: wallet.publicKey,
    recipient: recipientPublicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    escrowTokenAccount: msEscrowPda,
    stream: msStreamPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

// ... later, when the KPI is confirmed ...

// Creator unlocks the stream
await program.methods
  .setMilestone()
  .accounts({
    creator: wallet.publicKey,
    stream: msStreamPda,
  })
  .rpc();

console.log("Milestone set — recipient can now withdraw.");
// Recipient's withdraw call will now succeed
```

---

## 10. Campaign & Milestone Rewards

This flow is for game publishers (founders) who want to reward players for hitting in-game targets. Four parties are involved:

| Party | Role |
|---|---|
| **Founder** | Creates campaign + milestones, deposits budget |
| **Game Server** | Verifies player achievement on-chain (oracle) |
| **Player** | Claims reward after verification |
| **Program** | Holds tokens in escrow; enforces all rules trustlessly |

```typescript
import { createHash } from "crypto";

// ── Step 1: Founder creates campaign ────────────────────────────────────────
const campaignSeed = new BN(9999);
const titleHash    = Array.from(createHash("sha256").update("Season 1 Campaign").digest());

const [campaignPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign"), wallet.publicKey.toBuffer(), campaignSeed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [campaignEscrow] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
  PROGRAM_ID
);

await program.methods
  .createCampaign(titleHash, new BN(1_000_000), campaignSeed)
  .accounts({
    founder: wallet.publicKey,
    mint,
    founderTokenAccount: creatorAta.address,
    campaignEscrow,
    campaign: campaignPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();
console.log("Campaign created:", campaignPda.toBase58());

// ── Step 2: Founder adds a milestone ────────────────────────────────────────
const milestoneSeed  = new BN(1);
const descHash       = Array.from(createHash("sha256").update("Reach Level 10").digest());

// gameAuthorityKeypair = the game server's hot wallet
const gameAuthorityKeypair = Keypair.generate(); // your game server key
const playerKeypair        = Keypair.generate(); // the player's wallet

const [milestonePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("milestone"), campaignPda.toBuffer(), milestoneSeed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);

await program.methods
  .createMilestone(
    descHash,
    campaignSeed,
    milestoneSeed,
    new BN(100_000),                    // token reward
    gameAuthorityKeypair.publicKey,     // game server signing key
    playerKeypair.publicKey,            // player who can claim
    10,                                 // target_level: reach level 10
    2                                   // difficulty: medium
  )
  .accounts({
    founder: wallet.publicKey,
    campaign: campaignPda,
    milestone: milestonePda,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();
console.log("Milestone created:", milestonePda.toBase58());

// ── Step 3: Game server verifies player achievement ──────────────────────────
// (This tx is built and signed by your game backend, not the player)
const gameServerProvider = new AnchorProvider(
  connection,
  new anchor.Wallet(gameAuthorityKeypair),
  { commitment: "confirmed" }
);
const gameServerProgram = new Program(idl!, gameServerProvider);

await gameServerProgram.methods
  .verifyGame(milestoneSeed, 12) // player achieved level 12 (≥ target 10)
  .accounts({
    campaign: campaignPda,
    milestone: milestonePda,
    gameAuthority: gameAuthorityKeypair.publicKey,
  })
  .signers([gameAuthorityKeypair])
  .rpc();
console.log("Verification submitted.");

// ── Step 4: Player claims reward ─────────────────────────────────────────────
const playerProvider = new AnchorProvider(
  connection,
  new anchor.Wallet(playerKeypair),
  { commitment: "confirmed" }
);
const playerProgram = new Program(idl!, playerProvider);
const playerAta = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet.payer,   // payer for ATA creation
  mint,
  playerKeypair.publicKey
);

await playerProgram.methods
  .claimMilestone(milestoneSeed, campaignSeed)
  .accounts({
    recipient: playerKeypair.publicKey,
    milestone: milestonePda,
    campaign: campaignPda,
    mint,
    campaignEscrow,
    recipientTokenAccount: playerAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([playerKeypair])
  .rpc();
console.log("Reward claimed by player!");
```

---

## 11. Read On-Chain State

All account types are fetchable by their PDA.

```typescript
// ── Stream state ──────────────────────────────────────────────────────────────
const stream = await program.account.streamAccount.fetch(streamPda);
console.log({
  creator:          stream.creator.toBase58(),
  recipient:        stream.recipient.toBase58(),
  totalAmount:      stream.totalAmount.toString(),
  amountWithdrawn:  stream.amountWithdrawn.toString(),
  startTime:        new Date(stream.startTime.toNumber() * 1000).toISOString(),
  endTime:          new Date(stream.endTime.toNumber() * 1000).toISOString(),
  cliffTime:        stream.cliffTime.toNumber(),
  isCancelled:      stream.isCancelled,
  milestoneEnabled: stream.milestoneEnabled,
  milestoneReached: stream.milestoneReached,
});

// ── Campaign state ────────────────────────────────────────────────────────────
const campaign = await program.account.campaignAccount.fetch(campaignPda);
console.log({
  founder:         campaign.founder.toBase58(),
  totalBudget:     campaign.totalBudget.toString(),
  allocatedAmount: campaign.allocatedAmount.toString(),
  milestoneCount:  campaign.milestoneCount,
});

// ── Milestone state ───────────────────────────────────────────────────────────
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
console.log({
  recipient:     milestone.recipient.toBase58(),
  targetLevel:   milestone.targetLevel,
  achievedLevel: milestone.achievedLevel,
  tokenAmount:   milestone.tokenAmount.toString(),
  isVerified:    milestone.isVerified,
  isClaimed:     milestone.isClaimed,
});

// ── Derived claimable amount (off-chain calculation) ──────────────────────────
function calculateUnlocked(stream: any, nowSecs: number): number {
  const { cliffTime, milestoneEnabled, milestoneReached, startTime, endTime, totalAmount } = stream;
  if (cliffTime.toNumber() > 0 && nowSecs < cliffTime.toNumber()) return 0;
  if (milestoneEnabled && !milestoneReached) return 0;
  if (nowSecs < startTime.toNumber()) return 0;
  if (nowSecs >= endTime.toNumber()) return totalAmount.toNumber();

  const effectiveStart = cliffTime.toNumber() > 0 ? cliffTime.toNumber() : startTime.toNumber();
  const elapsed  = nowSecs - effectiveStart;
  const duration = endTime.toNumber() - effectiveStart;
  return Math.floor((totalAmount.toNumber() * elapsed) / duration);
}

const unlocked  = calculateUnlocked(stream, Math.floor(Date.now() / 1000));
const claimable = unlocked - stream.amountWithdrawn.toNumber();
console.log(`Claimable now: ${claimable} token units`);
```

---

## 12. Close a Stream (Rent Recovery)

After a stream is fully withdrawn or cancelled, call `close_stream` to reclaim the SOL rent locked in both the stream account and the escrow token account (~0.004 SOL per stream pair).

```typescript
const closeTx = await program.methods
  .closeStream()
  .accounts({
    creator: wallet.publicKey,
    stream: streamPda,
    recipient: recipientPublicKey,   // needed for PDA seed verification
    mint,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();

console.log("Stream closed, rent reclaimed:", closeTx);
// Both streamPda and escrowPda accounts are now closed
```

> **When to call:** Only valid if `is_cancelled == true` OR `amount_withdrawn == total_amount`. Otherwise throws `StreamNotSettled (6015)`.

---

## 13. Complete Quickstart Script

Copy this self-contained script to test the full vesting flow on devnet:

```typescript
/**
 * BlockBite — Complete Quickstart (devnet)
 * Run: npx ts-node quickstart.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");

(async () => {
  // ── Setup ─────────────────────────────────────────────────────────────────
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const creator    = Keypair.generate();
  const recipient  = Keypair.generate();

  // Fund accounts
  await connection.requestAirdrop(creator.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.requestAirdrop(recipient.publicKey, LAMPORTS_PER_SOL);
  await new Promise(r => setTimeout(r, 3000)); // wait for airdrop

  const provider = new AnchorProvider(connection, new anchor.Wallet(creator), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl     = await Program.fetchIdl(PROGRAM_ID, provider);
  const program  = new Program(idl!, provider);

  // ── Token mint ────────────────────────────────────────────────────────────
  const mint = await createMint(connection, creator, creator.publicKey, null, 6);
  const creatorAta = await getOrCreateAssociatedTokenAccount(connection, creator, mint, creator.publicKey);
  await mintTo(connection, creator, mint, creatorAta.address, creator, 10_000_000);
  console.log("Mint:", mint.toBase58());

  // ── Derive PDAs ───────────────────────────────────────────────────────────
  const seed = new BN(Date.now());
  const [streamPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), streamPda.toBuffer()],
    PROGRAM_ID
  );
  const recipientAta = await getOrCreateAssociatedTokenAccount(connection, creator, mint, recipient.publicKey);

  // ── Create stream ─────────────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const createTx = await program.methods
    .createStream(new BN(1_000_000), new BN(now), new BN(now + 3600), new BN(0), seed, false)
    .accounts({
      creator: creator.publicKey,
      recipient: recipient.publicKey,
      mint,
      creatorTokenAccount: creatorAta.address,
      escrowTokenAccount: escrowPda,
      stream: streamPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
  console.log("Stream created:", createTx);

  // ── Withdraw (as recipient) ───────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 2000)); // wait a couple of seconds
  const recipientProvider = new AnchorProvider(connection, new anchor.Wallet(recipient), { commitment: "confirmed" });
  const recipientProgram  = new Program(idl!, recipientProvider);
  const withdrawTx = await recipientProgram.methods
    .withdraw()
    .accounts({
      recipient: recipient.publicKey,
      stream: streamPda,
      mint,
      escrowTokenAccount: escrowPda,
      recipientTokenAccount: recipientAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([recipient])
    .rpc();
  console.log("Withdrawn:", withdrawTx);

  // ── Read state ────────────────────────────────────────────────────────────
  const state = await program.account.streamAccount.fetch(streamPda);
  console.log("Amount withdrawn:", state.amountWithdrawn.toString());
  console.log("Is cancelled:", state.isCancelled);
})();
```

---

## Common Errors & Fixes

| Error Name | Code | Likely Cause | Fix |
|---|---|---|---|
| `Unauthorized` | 6000 | Wrong keypair signed the transaction | Check which party must sign: creator vs recipient vs game_authority |
| `NothingToWithdraw` | 6001 | Cliff not passed, milestone not set, or nothing new unlocked | Wait past cliff; or creator calls `set_milestone` first |
| `StreamCancelled` | 6002 | Tried to `withdraw` on a cancelled stream | Stream is cancelled — no further withdrawals |
| `AlreadyCancelled` | 6003 | `cancel` called twice | Check `stream.isCancelled` before calling |
| `StreamNotStarted` | 6004 | `withdraw` called before `start_time` | Wait until the scheduled start time |
| `InvalidTimestamp` | 6005 | `end_time ≤ start_time` | Ensure `end_time > start_time` and `cliff_time ≤ end_time` |
| `InvalidAmount` | 6006 | Zero passed as `total_amount` or `total_budget` | Use a positive `u64` value |
| `InvalidRecipient` | 6007 | Creator and recipient are the same account | Use different keypairs for creator and recipient |
| `FullyVested` | 6008 | `cancel` called after full vest | Cannot cancel a fully vested stream |
| `StreamNotSettled` | 6015 | `close_stream` called on active stream | Cancel first, or wait for full withdrawal |
| `InsufficientBudget` | 6013 | Milestone reward exceeds remaining campaign budget | Reduce `token_amount` or increase campaign `total_budget` |
| `InvalidGameAuthority` | 6016 | Wrong keypair signed `verify_game` | Ensure `game_authority` keypair matches the one stored in `MilestoneAccount` |
| `LevelNotReached` | 6019 | `achieved_level < target_level` | Player must actually reach the target level |
| `MilestoneNotVerified` | 6014 | `claim_milestone` before `verify_game` | Wait for game server to submit verification |
| `AlreadyClaimed` | 6017 | `claim_milestone` called twice | Check `milestone.isClaimed` before calling |

---

## Next Steps

- See [`docs/INSTRUCTION_REFERENCE.md`](./INSTRUCTION_REFERENCE.md) for the full parameter and account reference for all 9 instructions
- See [`docs/ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) for design rationale (5 ADRs)
- Run the test suite locally: `anchor test` from the repo root
- Explore live transactions on [Solana Explorer (Devnet)](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet)
- Frontend demo: [blockbite-tdp.vercel.app](https://blockbite-tdp.vercel.app)

---

*This guide was reviewed by the BlockBite Marketing Team for clarity and accuracy before publication.*

# BlockBite — Integration Guide

This guide walks you through integrating with the BlockBite on-chain program from scratch. By the end you will have a working TypeScript client that creates a vesting stream, withdraws tokens, and interacts with the campaign/milestone reward system.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20+ |
| Yarn or npm | latest |
| Solana CLI | 2.3.0+ |
| `@coral-xyz/anchor` | 1.0.0 |
| `@solana/spl-token` | ^0.4.x |
| `@solana/web3.js` | ^1.x |

You also need a funded Solana wallet. For devnet:

```bash
solana-keygen new -o ~/.config/solana/id.json  # skip if you already have one
solana airdrop 2 --url devnet
```

---

## Step 1 — Install Dependencies

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

---

## Step 2 — Load the IDL and Program

The IDL is the machine-readable interface of the program. Fetch it directly from the chain or import the local JSON after building.

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
    Uint8Array.from(require(require("os").homedir() + "/.config/solana/id.json"))
  )
);
const provider = new AnchorProvider(connection, wallet, {
  commitment: "confirmed",
});
anchor.setProvider(provider);

// ── Program ───────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq"); // devnet

// Fetch IDL from chain (no local file needed)
const idl = await Program.fetchIdl(PROGRAM_ID, provider);
const program = new Program(idl!, provider);
```

---

## Step 3 — Create a Token Mint (for testing)

If you are integrating against an existing token on devnet, skip this step and use that mint address.

```typescript
// Create a fresh mint owned by the wallet
const mint = await createMint(
  connection,
  wallet.payer,          // payer
  wallet.publicKey,      // mint authority
  null,                  // freeze authority (none)
  6                      // decimals
);
console.log("Mint:", mint.toBase58());

// Create and fund a token account for the stream creator
const creatorAta = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet.payer,
  mint,
  wallet.publicKey
);
await mintTo(connection, wallet.payer, mint, creatorAta.address, wallet.payer, 10_000_000);
console.log("Creator ATA funded:", creatorAta.address.toBase58());
```

---

## Step 4 — Derive PDAs

BlockBite uses deterministic PDAs. Compute them client-side before calling any instruction.

```typescript
// Pick a unique seed per stream (timestamp works well for demos)
const seed = new BN(Date.now());

// Stream state account PDA
const [streamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    wallet.publicKey.toBuffer(),          // creator
    recipientPublicKey.toBuffer(),        // recipient
    seed.toArrayLike(Buffer, "le", 8),    // seed as little-endian u64
  ],
  PROGRAM_ID
);

// Escrow token vault PDA (derived from the stream PDA)
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  PROGRAM_ID
);

console.log("Stream PDA:  ", streamPda.toBase58());
console.log("Escrow PDA:  ", escrowPda.toBase58());
```

---

## Step 5 — Create a Stream

```typescript
// Recipient needs an ATA for later withdrawal
const recipientAta = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet.payer,
  mint,
  recipientPublicKey
);

const now = Math.floor(Date.now() / 1000);
const startTime = new BN(now);
const endTime   = new BN(now + 86_400);  // 24 hours of linear vesting
const cliffTime = new BN(0);             // no cliff

const tx = await program.methods
  .createStream(
    new BN(1_000_000),  // total_amount: 1M token units
    startTime,
    endTime,
    cliffTime,
    seed,
    false               // milestone_enabled: false (pure linear)
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

---

## Step 6 — Withdraw Vested Tokens (as recipient)

```typescript
// This must be called by the recipient keypair
const recipientWallet = new anchor.Wallet(recipientKeypair);
const recipientProvider = new AnchorProvider(connection, recipientWallet, {
  commitment: "confirmed",
});
const recipientProgram = new Program(idl!, recipientProvider);

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
```

> **Tip:** Call `withdraw` at any point after `start_time`. The amount transferred equals everything unlocked so far minus what has already been withdrawn. Repeated calls are safe — they only move the newly unlocked delta.

---

## Step 7 — Cancel a Stream (as creator)

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
// Vested portion → recipient, unvested portion → creator (automatic)
```

---

## Step 8 — Milestone-Gated Stream (Optional)

Use this when you want tokens locked until a KPI is manually confirmed by the creator.

```typescript
// Create a milestone-gated stream
const milestoneSeed = new BN(42);
const [msStreamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    wallet.publicKey.toBuffer(),
    recipientPublicKey.toBuffer(),
    milestoneSeed.toArrayLike(Buffer, "le", 8),
  ],
  PROGRAM_ID
);
const [msEscrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), msStreamPda.toBuffer()],
  PROGRAM_ID
);

await program.methods
  .createStream(
    new BN(500_000),
    new BN(now),
    new BN(now + 86_400),
    new BN(0),
    milestoneSeed,
    true  // ← milestone_enabled = true
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

// Recipient cannot withdraw until creator calls set_milestone:
await program.methods
  .setMilestone()
  .accounts({
    creator: wallet.publicKey,
    stream: msStreamPda,
  })
  .rpc();

// Now recipient can withdraw normally
```

---

## Step 9 — Campaign & Milestone Rewards

This flow is for game publishers who want to reward players for hitting in-game targets.

```typescript
import { createHash } from "crypto";

// ── 1. Create Campaign ────────────────────────────────────────────────────────
const campaignSeed  = new BN(9999);
const titleHash     = Array.from(createHash("sha256").update("Season 1 Campaign").digest());

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

// ── 2. Add a Milestone ────────────────────────────────────────────────────────
const milestoneSeedB = new BN(1);
const descHash       = Array.from(createHash("sha256").update("Reach Level 10").digest());

const [milestonePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("milestone"), campaignPda.toBuffer(), milestoneSeedB.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);

// gameAuthority = the game server's hot wallet keypair
await program.methods
  .createMilestone(
    descHash,
    campaignSeed,
    milestoneSeedB,
    new BN(100_000),      // token_amount: reward
    gameAuthorityPublicKey,
    playerPublicKey,
    10,                   // target_level: 10
    2                     // difficulty: medium
  )
  .accounts({
    founder: wallet.publicKey,
    campaign: campaignPda,
    milestone: milestonePda,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

// ── 3. Game Server Verifies Player Achievement ────────────────────────────────
// This tx is sent by the game server backend (signed with gameAuthorityKeypair)
const gameServerProgram = new Program(idl!, gameAuthorityProvider);

await gameServerProgram.methods
  .verifyGame(milestoneSeedB, 12)  // achieved_level = 12 (≥ target 10)
  .accounts({
    campaign: campaignPda,
    milestone: milestonePda,
    gameAuthority: gameAuthorityKeypair.publicKey,
  })
  .signers([gameAuthorityKeypair])
  .rpc();

// ── 4. Player Claims Reward ───────────────────────────────────────────────────
const playerProgram = new Program(idl!, playerProvider);
const playerAta = await getOrCreateAssociatedTokenAccount(connection, wallet.payer, mint, playerPublicKey);

await playerProgram.methods
  .claimMilestone(milestoneSeedB, campaignSeed)
  .accounts({
    recipient: playerPublicKey,
    milestone: milestonePda,
    campaign: campaignPda,
    mint,
    campaignEscrow,
    recipientTokenAccount: playerAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([playerKeypair])
  .rpc();
```

---

## Step 10 — Read On-Chain State

```typescript
// Fetch a stream account
const stream = await program.account.streamAccount.fetch(streamPda);
console.log({
  creator:          stream.creator.toBase58(),
  recipient:        stream.recipient.toBase58(),
  totalAmount:      stream.totalAmount.toString(),
  amountWithdrawn:  stream.amountWithdrawn.toString(),
  startTime:        new Date(stream.startTime.toNumber() * 1000).toISOString(),
  endTime:          new Date(stream.endTime.toNumber() * 1000).toISOString(),
  isCancelled:      stream.isCancelled,
  milestoneEnabled: stream.milestoneEnabled,
  milestoneReached: stream.milestoneReached,
});

// Fetch a campaign
const campaign = await program.account.campaignAccount.fetch(campaignPda);
console.log({
  founder:          campaign.founder.toBase58(),
  totalBudget:      campaign.totalBudget.toString(),
  allocatedAmount:  campaign.allocatedAmount.toString(),
  milestoneCount:   campaign.milestoneCount,
});

// Fetch a milestone
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
console.log({
  isVerified:   milestone.isVerified,
  isClaimed:    milestone.isClaimed,
  targetLevel:  milestone.targetLevel,
  achievedLevel: milestone.achievedLevel,
  tokenAmount:  milestone.tokenAmount.toString(),
});
```

---

## Common Errors & Fixes

| Error Name | Likely Cause | Fix |
|---|---|---|
| `Unauthorized` | Wrong signer for the instruction | Check which keypair must sign (creator vs recipient vs game_authority) |
| `NothingToWithdraw` | Cliff/milestone gate active, or no new tokens unlocked | Wait until past cliff; or creator must call `set_milestone` first |
| `InvalidTimestamp` | `end_time ≤ start_time` | Make sure `end_time > start_time` |
| `InvalidAmount` | Zero passed as amount | Use a positive `u64` value |
| `StreamNotSettled` | Tried to `close_stream` before fully settled | Cancel first, or wait for full withdrawal |
| `InsufficientBudget` | Milestone reward exceeds campaign remaining budget | Reduce `token_amount` or increase `total_budget` |
| `LevelNotReached` | Game server submitted level below target | Player must achieve `>= target_level` before server calls `verify_game` |
| `AlreadyClaimed` | Player tried to claim twice | Check `milestone.isClaimed` before calling |

---

## Next Steps

- Review [`docs/INSTRUCTION_REFERENCE.md`](./INSTRUCTION_REFERENCE.md) for the full parameter and account reference
- See [`docs/ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) for design rationale
- Run the full test suite locally: `anchor test` from the repo root
- Explore live transactions on [Solana Explorer (Devnet)](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet)

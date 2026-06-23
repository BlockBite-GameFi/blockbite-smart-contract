# Full Integration Guide

Step-by-step walkthrough covering every instruction. Reviewed for clarity by the BlockBite Marketing Team ✅.

---

## Prerequisites

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
solana-keygen new -o ~/.config/solana/id.json   # skip if you have one
solana config set --url devnet
solana airdrop 2
```

---

## Step 1 — Connect and Load the Program

```typescript
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");
const connection  = new Connection(clusterApiUrl("devnet"), "confirmed");

const wallet   = new anchor.Wallet(
  Keypair.fromSecretKey(
    Uint8Array.from(require(require("os").homedir() + "/.config/solana/id.json"))
  )
);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

// Fetch IDL from chain — no local JSON file needed
const idl    = await Program.fetchIdl(PROGRAM_ID, provider);
const program = new Program(idl!, provider);
```

---

## Step 2 — Derive PDAs

All BlockBite accounts are PDAs. Compute them client-side — no RPC call needed.

```typescript
const recipientPublicKey = new PublicKey("..."); // the vesting recipient
const seed = new BN(Date.now()); // unique per stream

// Stream state PDA
const [streamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    wallet.publicKey.toBuffer(),
    recipientPublicKey.toBuffer(),
    seed.toArrayLike(Buffer, "le", 8),
  ],
  PROGRAM_ID
);

// Escrow token vault PDA (derived from stream)
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  PROGRAM_ID
);
```

> **Key rule:** The `seed` value must match the `seed` parameter you pass to `create_stream`. Use `Date.now()` for uniqueness.

---

## Step 3 — Create a Stream

Deposits `total_amount` tokens into PDA-owned escrow and initialises the vesting schedule.

```typescript
const now = Math.floor(Date.now() / 1000);

// Encode stream name: max 31 UTF-8 chars, null-padded to 32 bytes
const nameBytes = Array.from(Buffer.alloc(32, 0));
Buffer.from("Team Salary Q1".slice(0, 31), "utf8").copy(Buffer.from(nameBytes));

await program.methods
  .createStream(
    new BN(1_000_000),      // total_amount
    new BN(now),             // start_time
    new BN(now + 86_400),    // end_time: 24h later
    new BN(0),               // cliff_time: none
    seed,
    false,                   // milestone_enabled: false
    nameBytes                // name: [u8; 32]
  )
  .accounts({
    creator:             wallet.publicKey,
    recipient:           recipientPublicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    escrowTokenAccount:  escrowPda,
    stream:              streamPda,
    tokenProgram:        TOKEN_PROGRAM_ID,
    systemProgram:       anchor.web3.SystemProgram.programId,
  })
  .rpc();
```

**Vesting modes** controlled by `cliff_time` + `milestone_enabled`:

| `cliff_time` | `milestone_enabled` | Mode |
|---|---|---|
| `0` | `false` | Pure linear from `start_time` |
| `> 0` | `false` | Zero until cliff; linear from cliff to `end_time` |
| `0` | `true` | Zero until `set_milestone` called; then linear |
| `> 0` | `true` | Both gates must pass; linear from cliff |

---

## Step 4 — Withdraw (as recipient)

```typescript
// Must be signed by the recipient keypair
const recipientProvider = new AnchorProvider(connection, new anchor.Wallet(recipientKeypair), { commitment: "confirmed" });
const recipientProgram  = new Program(idl!, recipientProvider);

await recipientProgram.methods
  .withdraw()
  .accounts({
    recipient:             recipientKeypair.publicKey,
    stream:                streamPda,
    mint,
    escrowTokenAccount:    escrowPda,
    recipientTokenAccount: recipientAta.address,
    tokenProgram:          TOKEN_PROGRAM_ID,
  })
  .signers([recipientKeypair])
  .rpc();
```

Each `withdraw` call transfers only the delta unlocked since the last withdrawal — safe to call repeatedly.

---

## Step 5 — Cancel (as creator)

Atomically splits escrow: vested → recipient, unvested → creator.

```typescript
await program.methods
  .cancel()
  .accounts({
    creator:              wallet.publicKey,
    stream:               streamPda,
    mint,
    escrowTokenAccount:   escrowPda,
    creatorTokenAccount:  creatorAta.address,
    recipientTokenAccount: recipientAta.address,
    tokenProgram:         TOKEN_PROGRAM_ID,
  })
  .rpc();
```

---

## Step 6 — Milestone-Gated Stream

Use when tokens should be locked until a KPI is confirmed.

```typescript
// Create stream with milestone_enabled = true
const mseed = new BN(Date.now() + 1);
// ... (derive msStreamPda + msEscrowPda same as above)
const msNameBytes = Array.from(Buffer.alloc(32, 0));
Buffer.from("Milestone Grant".slice(0, 31), "utf8").copy(Buffer.from(msNameBytes));

await program.methods
  .createStream(new BN(500_000), new BN(now), new BN(now + 86_400), new BN(0), mseed, true, msNameBytes)
  .accounts({ /* ... */ })
  .rpc();

// Later — when KPI is met — creator unlocks the stream
await program.methods
  .setMilestone()
  .accounts({ creator: wallet.publicKey, stream: msStreamPda })
  .rpc();
// Recipient can now withdraw
```

---

## Step 7 — Close Stream (Rent Recovery)

After fully withdrawn or cancelled, reclaim ~0.004 SOL.

```typescript
await program.methods
  .closeStream()
  .accounts({
    creator:             wallet.publicKey,
    stream:              streamPda,
    recipient:           recipientPublicKey,
    mint,
    escrowTokenAccount:  escrowPda,
    creatorTokenAccount: creatorAta.address,
    tokenProgram:        TOKEN_PROGRAM_ID,
  })
  .rpc();
// streamPda and escrowPda accounts are closed; SOL rent returned
```

---

## Step 8 — Campaign & Milestone Rewards

Full four-step game reward flow.

```typescript
import { createHash } from "crypto";

// ── 1. Founder creates campaign ──────────────────────────────────────────────
const campaignSeed = new BN(9999);
const titleHash    = Array.from(createHash("sha256").update("Season 1").digest());

const [campaignPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign"), wallet.publicKey.toBuffer(), campaignSeed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [campaignEscrow] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()], PROGRAM_ID
);

await program.methods
  .createCampaign(titleHash, new BN(1_000_000), campaignSeed)
  .accounts({
    founder: wallet.publicKey, mint,
    founderTokenAccount: creatorAta.address,
    campaignEscrow, campaign: campaignPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

// ── 2. Founder adds a milestone ──────────────────────────────────────────────
const milestoneSeed = new BN(1);
const descHash      = Array.from(createHash("sha256").update("Reach Level 10").digest());

const [milestonePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("milestone"), campaignPda.toBuffer(), milestoneSeed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);

await program.methods
  .createMilestone(
    descHash, campaignSeed, milestoneSeed,
    new BN(100_000),              // reward
    gameAuthorityKeypair.publicKey,
    playerKeypair.publicKey,
    10,                            // target level
    2                              // difficulty: medium
  )
  .accounts({
    founder: wallet.publicKey, campaign: campaignPda,
    milestone: milestonePda,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();

// ── 3. Game server verifies player ───────────────────────────────────────────
const gameServerProgram = new Program(idl!, gameAuthorityProvider);
await gameServerProgram.methods
  .verifyGame(milestoneSeed, 12) // player reached level 12 ≥ target 10
  .accounts({ campaign: campaignPda, milestone: milestonePda, gameAuthority: gameAuthorityKeypair.publicKey })
  .signers([gameAuthorityKeypair])
  .rpc();

// ── 4. Player claims reward ───────────────────────────────────────────────────
const playerProgram = new Program(idl!, playerProvider);
await playerProgram.methods
  .claimMilestone(milestoneSeed, campaignSeed)
  .accounts({
    recipient: playerKeypair.publicKey,
    milestone: milestonePda, campaign: campaignPda, mint,
    campaignEscrow, recipientTokenAccount: playerAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([playerKeypair])
  .rpc();
```

---

## Step 9 — Read On-Chain State

```typescript
// Stream
const stream = await program.account.streamAccount.fetch(streamPda);
console.log({
  totalAmount:      stream.totalAmount.toString(),
  amountWithdrawn:  stream.amountWithdrawn.toString(),
  isCancelled:      stream.isCancelled,
  milestoneEnabled: stream.milestoneEnabled,
  milestoneReached: stream.milestoneReached,
  endTime:          new Date(stream.endTime.toNumber() * 1000).toISOString(),
});

// Campaign
const campaign = await program.account.campaignAccount.fetch(campaignPda);
console.log({
  totalBudget:     campaign.totalBudget.toString(),
  allocatedAmount: campaign.allocatedAmount.toString(),
  milestoneCount:  campaign.milestoneCount,
});

// Milestone
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
console.log({
  isVerified:   milestone.isVerified,
  isClaimed:    milestone.isClaimed,
  targetLevel:  milestone.targetLevel,
  achievedLevel: milestone.achievedLevel,
});
```

---

## Troubleshooting

| Error | Code | Fix |
|---|---|---|
| `Unauthorized` | 6000 | Wrong keypair signed. Check: creator signs `cancel`/`set_milestone`; recipient signs `withdraw`; `game_authority` signs `verify_game` |
| `NothingToWithdraw` | 6001 | Cliff not passed, or `set_milestone` not called yet, or nothing new unlocked |
| `StreamNotStarted` | 6004 | `now < start_time` — wait for the scheduled start |
| `InvalidTimestamp` | 6005 | `end_time ≤ start_time` or `cliff_time > end_time` |
| `FullyVested` | 6008 | Cannot cancel after `end_time` — stream is fully vested |
| `StreamNotSettled` | 6015 | Call `cancel` or wait for full withdrawal before `close_stream` |
| `LevelNotReached` | 6019 | `achieved_level < target_level` — player hasn't earned it |
| `MilestoneNotVerified` | 6014 | Game server must call `verify_game` before player calls `claim_milestone` |
| `AlreadyClaimed` | 6017 | Check `milestone.isClaimed` before calling `claim_milestone` |

---

*This guide was reviewed by the BlockBite Marketing Team for clarity and accuracy.*

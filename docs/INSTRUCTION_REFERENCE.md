# BlockBite — Instruction Reference

**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Program ID (Localnet):** `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX`  
**Framework:** Anchor 1.0.0 · **Network:** Solana Devnet  
**Last updated:** 2026-06-17

---

## Table of Contents

- [Overview](#overview)
- [Loading the IDL](#loading-the-idl)
- [Stream Vesting Instructions](#stream-vesting-instructions)
  - [create_stream](#create_stream)
  - [withdraw](#withdraw)
  - [cancel](#cancel)
  - [set_milestone](#set_milestone)
  - [close_stream](#close_stream)
- [Campaign & Milestone Reward Instructions](#campaign--milestone-reward-instructions)
  - [create_campaign](#create_campaign)
  - [create_milestone](#create_milestone)
  - [verify_game](#verify_game)
  - [claim_milestone](#claim_milestone)
- [PDA Derivation Reference](#pda-derivation-reference)
- [Error Code Index](#error-code-index)
- [Unlock Calculation Logic](#unlock-calculation-logic)

---

## Overview

BlockBite exposes **9 on-chain instructions** split into two functional groups:

| Group | Instructions |
|---|---|
| Stream Vesting | `create_stream`, `withdraw`, `cancel`, `set_milestone`, `close_stream` |
| Campaign & Milestone Rewards | `create_campaign`, `create_milestone`, `verify_game`, `claim_milestone` |

**Vesting Modes** (controlled by `cliff_time` and `milestone_enabled` on `create_stream`):

| Mode | cliff_time | milestone_enabled | Behaviour |
|---|---|---|---|
| Linear | `0` | `false` | Tokens unlock proportionally from `start_time` to `end_time` |
| Cliff | `> 0` | `false` | Zero tokens before cliff; linear from cliff to `end_time` |
| Milestone | `0` | `true` | Zero tokens until creator calls `set_milestone`; then immediate unlock |
| Cliff + Milestone | `> 0` | `true` | Both gates must pass; linear from cliff after milestone set |

---

## Loading the IDL

The program IDL is stored on-chain. Fetch it once — no local JSON file required.

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");
const connection  = new Connection(clusterApiUrl("devnet"), "confirmed");
const wallet      = new anchor.Wallet(Keypair.generate()); // replace with real wallet
const provider    = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl     = await Program.fetchIdl(PROGRAM_ID, provider);
const program  = new Program(idl!, provider);
```

For **localnet** (after `anchor build && anchor test`):

```typescript
import idl from "../target/idl/blockbite.json";
const PROGRAM_ID = new PublicKey("9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX");
const program    = new Program(idl as anchor.Idl, provider);
```

---

## Stream Vesting Instructions

### `create_stream`

Creates a new token vesting stream. Transfers `total_amount` from creator's token account into a PDA-owned escrow vault.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `total_amount` | `u64` | Total tokens to vest (must be > 0) |
| `start_time` | `i64` | Unix timestamp when vesting begins |
| `end_time` | `i64` | Unix timestamp when vesting fully completes (`end_time > start_time` required) |
| `cliff_time` | `i64` | Unix timestamp for cliff unlock. Pass `0` for no cliff. If > 0, no tokens unlock before this time |
| `seed` | `u64` | Unique seed for PDA derivation — allows multiple streams between the same creator/recipient pair |
| `milestone_enabled` | `bool` | If `true`, tokens are gated behind `set_milestone` in addition to time |
| `name` | `[u8; 32]` | Display label for this stream (UTF-8, null-padded to 32 bytes). Max 31 meaningful chars. Does not affect vesting logic. |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Payer and stream owner |
| 1 | `recipient` | ❌ | ❌ | Token recipient (stored as Pubkey only) |
| 2 | `mint` | ❌ | ❌ | SPL token mint |
| 3 | `creator_token_account` | ❌ | ✅ | Source token account (authority = creator) |
| 4 | `escrow_token_account` | ❌ | ✅ | **Init** — PDA token vault (seeds: `["escrow", stream_pubkey]`) |
| 5 | `stream` | ❌ | ✅ | **Init** — stream state PDA (seeds: `["stream", creator, recipient, seed_le]`) |
| 6 | `token_program` | ❌ | ❌ | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| 7 | `system_program` | ❌ | ❌ | `11111111111111111111111111111111` |

**Behavior**
1. Validates: `total_amount > 0`, `end_time > start_time`, `cliff_time == 0 || cliff_time <= end_time`, `creator != recipient`
2. Initialises `StreamAccount` PDA with all vesting parameters
3. Transfers `total_amount` tokens from `creator_token_account` → `escrow_token_account` via `transfer_checked` CPI

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `InvalidAmount` | `total_amount == 0` |
| `InvalidTimestamp` | `end_time <= start_time` or `cliff_time > end_time` |
| `InvalidRecipient` | `creator == recipient` |

**Example (TypeScript)**

```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

const seed = new anchor.BN(Date.now());

// Derive PDAs deterministically
const [streamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    creator.publicKey.toBuffer(),
    recipient.publicKey.toBuffer(),
    seed.toArrayLike(Buffer, "le", 8),
  ],
  program.programId
);
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  program.programId
);

// Encode stream name: max 31 UTF-8 chars, null-padded to 32 bytes
function encodeStreamName(label: string): number[] {
  const buf = Buffer.alloc(32, 0);
  Buffer.from(label.slice(0, 31), "utf8").copy(buf);
  return Array.from(buf);
}

const now = Math.floor(Date.now() / 1000);
const tx = await program.methods
  .createStream(
    new anchor.BN(1_000_000),           // total_amount: 1 000 000 token units
    new anchor.BN(now),                  // start_time: now
    new anchor.BN(now + 86400),          // end_time: 24 h from now
    new anchor.BN(0),                    // cliff_time: 0 = no cliff
    seed,
    false,                               // milestone_enabled: false (pure linear)
    encodeStreamName("Team Salary Q1")   // name: display label, max 31 chars
  )
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    mint: mintAddress,
    creatorTokenAccount: creatorAta,
    escrowTokenAccount: escrowPda,
    stream: streamPda,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([creator])
  .rpc();

console.log("Stream created:", tx);
console.log("Stream PDA:", streamPda.toBase58());
```

---

### `withdraw`

Recipient claims all currently unlocked tokens from the stream. Uses linear unlock formula relative to `start_time`/`end_time` and respects cliff/milestone gates.

**Parameters:** none

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `recipient` | ✅ | ✅ | Must match `stream.recipient` |
| 1 | `stream` | ❌ | ✅ | Stream state PDA |
| 2 | `mint` | ❌ | ❌ | SPL token mint |
| 3 | `escrow_token_account` | ❌ | ✅ | Escrow PDA vault |
| 4 | `recipient_token_account` | ❌ | ✅ | Destination ATA |
| 5 | `token_program` | ❌ | ❌ | SPL Token program |

**Behavior**
1. Checks stream is not cancelled, has started
2. Computes `unlocked = calculate_unlocked(stream, now)`
3. `claimable = unlocked - stream.amount_withdrawn`
4. Increments `stream.amount_withdrawn` by `claimable`
5. Transfers `claimable` tokens from escrow → recipient via PDA-signed CPI

**Unlock Formula**

```
if cliff_time > 0 and now < cliff_time  → 0
if milestone_enabled and !milestone_reached → 0
if now < start_time  → 0
if now >= end_time   → total_amount
else:
  effective_start = cliff_time > 0 ? cliff_time : start_time
  unlocked = total_amount * (now - effective_start) / (end_time - effective_start)
```

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `stream.recipient` |
| `StreamCancelled` | Stream has been cancelled |
| `StreamNotStarted` | `now < stream.start_time` |
| `NothingToWithdraw` | `claimable == 0` (cliff/milestone gate active, or already fully withdrawn) |

**Example (TypeScript)**

```typescript
// Must be signed by the recipient keypair
const tx = await program.methods
  .withdraw()
  .accounts({
    recipient: recipient.publicKey,
    stream: streamPda,
    mint: mintAddress,
    escrowTokenAccount: escrowPda,
    recipientTokenAccount: recipientAta,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([recipient])
  .rpc();

console.log("Withdrew tokens:", tx);

// Check how much has been withdrawn
const state = await program.account.streamAccount.fetch(streamPda);
console.log("Amount withdrawn:", state.amountWithdrawn.toString());
```

> **Tip:** `withdraw` is safe to call repeatedly. Each call moves only the newly unlocked delta since the last withdrawal.

---

### `cancel`

Creator cancels a stream. The vested portion (already unlocked) transfers to the recipient; the unvested remainder returns to the creator.

**Parameters:** none

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Must match `stream.creator` |
| 1 | `stream` | ❌ | ✅ | Stream state PDA |
| 2 | `mint` | ❌ | ❌ | SPL token mint |
| 3 | `escrow_token_account` | ❌ | ✅ | Escrow PDA vault |
| 4 | `creator_token_account` | ❌ | ✅ | Creator's destination ATA (receives unvested tokens) |
| 5 | `recipient_token_account` | ❌ | ✅ | Recipient's destination ATA (receives vested tokens) |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

**Behavior**
1. Validates stream is not already cancelled, not fully vested
2. Computes `recipient_due = unlocked - amount_withdrawn`, `creator_due = escrow_balance - recipient_due`
3. Sets `stream.is_cancelled = true` (before CPIs — CEI pattern)
4. Transfers `recipient_due` to recipient and `creator_due` to creator (both via PDA-signed CPI)

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `stream.creator` |
| `AlreadyCancelled` | Stream already cancelled |
| `FullyVested` | `now >= stream.end_time` — stream is fully vested, cannot cancel |

**Example (TypeScript)**

```typescript
const tx = await program.methods
  .cancel()
  .accounts({
    creator: creator.publicKey,
    stream: streamPda,
    mint: mintAddress,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta,
    recipientTokenAccount: recipientAta,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("Stream cancelled:", tx);
// Vested portion → recipient; unvested portion → creator (atomic)
```

---

### `set_milestone`

Creator marks a milestone as reached on a stream that has `milestone_enabled = true`. After this call, `withdraw` will no longer be gated by the milestone condition and the recipient can claim all unlocked tokens.

**Parameters:** none

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Must match `stream.creator` |
| 1 | `stream` | ❌ | ✅ | Stream state PDA |

**Behavior**
1. Validates caller is creator, milestone not already reached, stream not cancelled
2. Sets `stream.milestone_reached = true`

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `stream.creator` |
| `MilestoneAlreadyReached` | Already set — idempotency guard |
| `StreamCancelled` | Stream is cancelled |

**Example (TypeScript)**

```typescript
// Only the creator can call this
const tx = await program.methods
  .setMilestone()
  .accounts({
    creator: creator.publicKey,
    stream: streamPda,
  })
  .signers([creator])
  .rpc();

console.log("Milestone reached — recipient can now withdraw:", tx);
```

---

### `close_stream`

Closes a fully settled stream (cancelled **or** fully withdrawn), recovering the SOL rent from both the stream account and the escrow token account.

**Parameters:** none

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Rent destination; must match `stream.creator` |
| 1 | `stream` | ❌ | ✅ | Stream state PDA — **closed** on success |
| 2 | `recipient` | ❌ | ❌ | Used for PDA seed derivation only |
| 3 | `mint` | ❌ | ❌ | SPL token mint |
| 4 | `escrow_token_account` | ❌ | ✅ | Escrow PDA vault — **closed** on success |
| 5 | `creator_token_account` | ❌ | ✅ | Receives any dust tokens before escrow closes |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

**Behavior**
1. Validates stream is settled (`is_cancelled == true` OR `amount_withdrawn == total_amount`)
2. Sweeps any remaining token dust from escrow → creator
3. Closes escrow token account (rent ~0.002 SOL → creator)
4. Anchor closes stream account (rent ~0.002 SOL → creator)

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `stream.creator` |
| `StreamNotSettled` | Stream is neither cancelled nor fully withdrawn |

**Example (TypeScript)**

```typescript
const tx = await program.methods
  .closeStream()
  .accounts({
    creator: creator.publicKey,
    stream: streamPda,
    recipient: recipient.publicKey,   // needed for PDA seed re-derivation
    mint: mintAddress,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("Stream closed, SOL rent reclaimed:", tx);
// stream and escrow accounts are gone; ~0.004 SOL returned to creator
```

---

## Campaign & Milestone Reward Instructions

### `create_campaign`

Founder creates a reward campaign with a fixed budget. Tokens are deposited into a campaign escrow PDA upfront, ensuring players can always claim their earned rewards.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `title_hash` | `[u8; 32]` | 32-byte SHA-256 or IPFS CID of campaign details (stored on-chain as tamper-evident commitment) |
| `total_budget` | `u64` | Total token budget for this campaign (must be > 0) |
| `seed` | `u64` | Unique seed for PDA derivation |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `founder` | ✅ | ✅ | Campaign owner; payer |
| 1 | `mint` | ❌ | ❌ | SPL token mint |
| 2 | `founder_token_account` | ❌ | ✅ | Source token account |
| 3 | `campaign_escrow` | ❌ | ✅ | **Init** — PDA vault (seeds: `["campaign_escrow", campaign_pubkey]`) |
| 4 | `campaign` | ❌ | ✅ | **Init** — campaign state PDA (seeds: `["campaign", founder, seed_le]`) |
| 5 | `token_program` | ❌ | ❌ | SPL Token program |
| 6 | `system_program` | ❌ | ❌ | System program |

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `InvalidAmount` | `total_budget == 0` |

**Example (TypeScript)**

```typescript
import { createHash } from "crypto";

const campaignSeed = new anchor.BN(Date.now());
// Hash the campaign title for on-chain storage (tamper-evident commitment)
const titleHash = Array.from(
  createHash("sha256").update("Season 1 — Summer Rewards Campaign").digest()
);

const [campaignPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("campaign"),
    founder.publicKey.toBuffer(),
    campaignSeed.toArrayLike(Buffer, "le", 8),
  ],
  program.programId
);
const [campaignEscrow] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
  program.programId
);

const tx = await program.methods
  .createCampaign(titleHash, new anchor.BN(1_000_000), campaignSeed)
  .accounts({
    founder: founder.publicKey,
    mint: mintAddress,
    founderTokenAccount: founderAta,
    campaignEscrow,
    campaign: campaignPda,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([founder])
  .rpc();

console.log("Campaign created:", tx);
console.log("Campaign PDA:", campaignPda.toBase58());
```

---

### `create_milestone`

Founder adds a milestone to a campaign. The milestone defines a game target, reward amount, the player who can claim, and the game server keypair authorised to verify completion.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `description_hash` | `[u8; 32]` | SHA-256/IPFS hash of milestone description |
| `campaign_seed` | `u64` | Seed of the parent campaign PDA |
| `milestone_seed` | `u64` | Unique seed for this milestone PDA |
| `token_amount` | `u64` | Reward tokens reserved for this milestone (must be > 0) |
| `game_authority` | `Pubkey` | Game server public key authorised to call `verify_game` |
| `recipient` | `Pubkey` | Player wallet that can claim after verification |
| `target_level` | `u8` | Required game level (1–30) |
| `difficulty` | `u8` | `1` = easy, `2` = medium, `3` = hard |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `founder` | ✅ | ✅ | Must match `campaign.founder` |
| 1 | `campaign` | ❌ | ✅ | Parent campaign PDA — `allocated_amount` incremented |
| 2 | `milestone` | ❌ | ✅ | **Init** — milestone PDA (seeds: `["milestone", campaign_pubkey, milestone_seed_le]`) |
| 3 | `system_program` | ❌ | ❌ | System program |

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `campaign.founder` |
| `InvalidAmount` | `token_amount == 0` |
| `InsufficientBudget` | `token_amount > campaign.total_budget - campaign.allocated_amount` |
| `InvalidLevel` | `target_level < 1 || target_level > 30` |
| `InvalidDifficulty` | `difficulty` not in `{1, 2, 3}` |

**Example (TypeScript)**

```typescript
import { createHash } from "crypto";

const milestoneSeed = new anchor.BN(1);
const descHash = Array.from(
  createHash("sha256").update("Reach Level 10 in BlockBite Dungeon Mode").digest()
);

const [milestonePda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("milestone"),
    campaignPda.toBuffer(),
    milestoneSeed.toArrayLike(Buffer, "le", 8),
  ],
  program.programId
);

const tx = await program.methods
  .createMilestone(
    descHash,                         // description_hash
    campaignSeed,                     // campaign_seed (parent)
    milestoneSeed,                    // milestone_seed (this milestone)
    new anchor.BN(100_000),           // token_amount: reward
    gameAuthority.publicKey,          // game_authority: game server hot wallet
    player.publicKey,                 // recipient: player who can claim
    10,                               // target_level: must reach level 10
    2                                 // difficulty: medium
  )
  .accounts({
    founder: founder.publicKey,
    campaign: campaignPda,
    milestone: milestonePda,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([founder])
  .rpc();

console.log("Milestone created:", tx);
console.log("Milestone PDA:", milestonePda.toBase58());
```

---

### `verify_game`

Game server signs and submits the player's achieved level for a milestone. This is the on-chain oracle step — only the `game_authority` key declared in the milestone account can call this instruction.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `milestone_seed` | `u64` | Seed of the milestone to verify |
| `achieved_level` | `u8` | Level the player achieved in-game (must be ≥ `target_level`) |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `campaign` | ❌ | ❌ | Parent campaign PDA (used for PDA seed derivation only) |
| 1 | `milestone` | ❌ | ✅ | Milestone PDA — `is_verified` set to `true` on success |
| 2 | `game_authority` | ✅ | ❌ | Must match `milestone.game_authority` — this is your game server's signing key |

**Behavior**
1. Validates `game_authority` matches on-chain `milestone.game_authority`
2. Validates `!milestone.is_verified` (idempotency guard)
3. Validates `achieved_level >= milestone.target_level`
4. Sets `milestone.achieved_level = achieved_level`
5. Sets `milestone.is_verified = true`

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `InvalidGameAuthority` | Signer doesn't match `milestone.game_authority` |
| `MilestoneAlreadyVerified` | `is_verified == true` — already verified |
| `InvalidLevel` | `achieved_level < 1 || achieved_level > 30` |
| `LevelNotReached` | `achieved_level < milestone.target_level` |

**Example (TypeScript — game server backend)**

```typescript
// This transaction is built and sent by your game server backend.
// The game server holds `gameAuthorityKeypair` as a hot wallet.
const gameServerProvider = new AnchorProvider(connection, new anchor.Wallet(gameAuthorityKeypair), {
  commitment: "confirmed",
});
const gameServerProgram = new Program(idl!, gameServerProvider);

const achievedLevel = 12; // player actually reached level 12 (target was 10)

const tx = await gameServerProgram.methods
  .verifyGame(
    milestoneSeed,  // milestone_seed
    achievedLevel   // achieved_level: must be >= target_level (10)
  )
  .accounts({
    campaign: campaignPda,
    milestone: milestonePda,
    gameAuthority: gameAuthorityKeypair.publicKey,
  })
  .signers([gameAuthorityKeypair])
  .rpc();

console.log("Game achievement verified:", tx);
// Player can now call claim_milestone
```

---

### `claim_milestone`

Recipient claims their milestone reward after `verify_game` has set `is_verified = true`. Transfers `token_amount` from campaign escrow to recipient. An idempotency guard (`is_claimed`) prevents double-claims.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `milestone_seed` | `u64` | Seed of the milestone to claim |
| `campaign_seed` | `u64` | Seed of the parent campaign (needed to derive the escrow signing PDA) |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `recipient` | ✅ | ✅ | Must match `milestone.recipient` |
| 1 | `milestone` | ❌ | ✅ | Milestone PDA — `is_claimed` set to `true` on success |
| 2 | `campaign` | ❌ | ❌ | Parent campaign PDA |
| 3 | `mint` | ❌ | ❌ | SPL token mint |
| 4 | `campaign_escrow` | ❌ | ✅ | Campaign escrow vault |
| 5 | `recipient_token_account` | ❌ | ✅ | Player's destination ATA |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

**Behavior**
1. Validates: `recipient == milestone.recipient`, `milestone.is_verified == true`, `!milestone.is_claimed`
2. Sets `milestone.is_claimed = true` **before** CPI (CEI pattern — prevents re-entrancy)
3. Transfers `milestone.token_amount` from campaign escrow → recipient ATA via PDA-signed CPI

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `milestone.recipient` |
| `MilestoneNotVerified` | `is_verified == false` — game server hasn't verified yet |
| `AlreadyClaimed` | `is_claimed == true` — reward already collected |

**Example (TypeScript — player frontend)**

```typescript
// This transaction is submitted by the player's wallet (browser or CLI)
const playerProvider = new AnchorProvider(connection, new anchor.Wallet(playerKeypair), {
  commitment: "confirmed",
});
const playerProgram = new Program(idl!, playerProvider);

const playerAta = await getOrCreateAssociatedTokenAccount(
  connection,
  playerKeypair,   // payer for ATA creation if needed
  mintAddress,
  playerKeypair.publicKey
);

const tx = await playerProgram.methods
  .claimMilestone(
    milestoneSeed,  // milestone_seed
    campaignSeed    // campaign_seed (parent)
  )
  .accounts({
    recipient: playerKeypair.publicKey,
    milestone: milestonePda,
    campaign: campaignPda,
    mint: mintAddress,
    campaignEscrow: campaignEscrowPda,
    recipientTokenAccount: playerAta.address,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([playerKeypair])
  .rpc();

console.log("Reward claimed:", tx);

// Confirm claim status
const ms = await program.account.milestoneAccount.fetch(milestonePda);
console.log("isClaimed:", ms.isClaimed); // true
```

---

## PDA Derivation Reference

All PDAs use canonical bump (stored in the account). Derive them off-chain with `PublicKey.findProgramAddressSync`.

| Account | Seeds | Notes |
|---|---|---|
| `StreamAccount` | `["stream", creator_pubkey (32B), recipient_pubkey (32B), seed_u64_le (8B)]` | Unique per creator/recipient/seed triple |
| `EscrowTokenAccount` | `["escrow", stream_pubkey (32B)]` | Derived from stream — 1-to-1 with stream |
| `CampaignAccount` | `["campaign", founder_pubkey (32B), seed_u64_le (8B)]` | Unique per founder/seed pair |
| `CampaignEscrow` | `["campaign_escrow", campaign_pubkey (32B)]` | Derived from campaign — 1-to-1 with campaign |
| `MilestoneAccount` | `["milestone", campaign_pubkey (32B), milestone_seed_u64_le (8B)]` | Unique per campaign/milestone_seed pair |

**JavaScript helper:**

```typescript
export function deriveStreamPdas(
  programId: PublicKey,
  creator: PublicKey,
  recipient: PublicKey,
  seed: anchor.BN
): { streamPda: PublicKey; escrowPda: PublicKey } {
  const [streamPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream"), creator.toBuffer(), recipient.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
    programId
  );
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), streamPda.toBuffer()],
    programId
  );
  return { streamPda, escrowPda };
}

export function deriveCampaignPdas(
  programId: PublicKey,
  founder: PublicKey,
  campaignSeed: anchor.BN
): { campaignPda: PublicKey; campaignEscrow: PublicKey } {
  const [campaignPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign"), founder.toBuffer(), campaignSeed.toArrayLike(Buffer, "le", 8)],
    programId
  );
  const [campaignEscrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
    programId
  );
  return { campaignPda, campaignEscrow };
}

export function deriveMilestonePda(
  programId: PublicKey,
  campaignPda: PublicKey,
  milestoneSeed: anchor.BN
): PublicKey {
  const [milestonePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("milestone"), campaignPda.toBuffer(), milestoneSeed.toArrayLike(Buffer, "le", 8)],
    programId
  );
  return milestonePda;
}
```

---

## Error Code Index

| Code | Name | Message | Instructions That Can Return It |
|---|---|---|---|
| 6000 | `Unauthorized` | Signer is not authorised to perform this action | `withdraw`, `cancel`, `set_milestone`, `close_stream`, `create_milestone`, `claim_milestone` |
| 6001 | `NothingToWithdraw` | No tokens available to withdraw | `withdraw` |
| 6002 | `StreamCancelled` | Stream has been cancelled | `withdraw`, `set_milestone` |
| 6003 | `AlreadyCancelled` | Stream is already cancelled | `cancel` |
| 6004 | `StreamNotStarted` | Stream has not started yet | `withdraw` |
| 6005 | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end | `create_stream` |
| 6006 | `InvalidAmount` | Amount must be greater than zero | `create_stream`, `create_campaign`, `create_milestone` |
| 6007 | `InvalidRecipient` | Creator and recipient cannot be the same account | `create_stream` |
| 6008 | `FullyVested` | Stream is fully vested and cannot be cancelled | `cancel` |
| 6009 | `MilestoneAlreadyReached` | Milestone has already been reached | `set_milestone` |
| 6010 | `CampaignNotFound` | Campaign not found | (PDA derivation mismatch) |
| 6011 | `MilestoneNotFound` | Milestone not found | (PDA derivation mismatch) |
| 6012 | `MilestoneAlreadyVerified` | Milestone has already been verified | `verify_game` |
| 6013 | `InsufficientBudget` | Campaign budget is insufficient for this milestone | `create_milestone` |
| 6014 | `MilestoneNotVerified` | Milestone has not been verified yet | `claim_milestone` |
| 6015 | `StreamNotSettled` | Stream must be fully withdrawn or cancelled before closing | `close_stream` |
| 6016 | `InvalidGameAuthority` | Provided game authority does not match the milestone's declared game authority | `verify_game` |
| 6017 | `AlreadyClaimed` | Milestone reward has already been claimed | `claim_milestone` |
| 6018 | `InvalidLevel` | Target level must be between 1 and 30 | `create_milestone`, `verify_game` |
| 6019 | `LevelNotReached` | Achieved level does not meet the target level requirement | `verify_game` |
| 6020 | `InvalidDifficulty` | Difficulty must be 1 (easy), 2 (medium), or 3 (hard) | `create_milestone` |

**Catching errors in TypeScript:**

```typescript
import { AnchorError } from "@coral-xyz/anchor";

try {
  await program.methods.withdraw().accounts({ ... }).rpc();
} catch (err) {
  if (err instanceof AnchorError) {
    console.log("Error code:", err.error.errorCode.number);   // e.g. 6001
    console.log("Error name:", err.error.errorCode.code);     // e.g. "NothingToWithdraw"
    console.log("Message:", err.error.errorMessage);
  }
}
```

---

## Unlock Calculation Logic

The core unlock function (`programs/blockbite/src/utils.rs`) is a pure Rust function with 13+ unit tests:

```rust
pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    // Gate 1: cliff — no tokens before cliff date
    if stream.cliff_time > 0 && current_time < stream.cliff_time {
        return 0;
    }
    // Gate 2: milestone — no tokens until creator calls set_milestone
    if stream.milestone_enabled && !stream.milestone_reached {
        return 0;
    }
    // Gate 3: before start time
    if current_time < stream.start_time {
        return 0;
    }
    // Fully vested at end time
    if current_time >= stream.end_time {
        return stream.total_amount;
    }
    // Linear interpolation from effective_start
    let effective_start = if stream.cliff_time > 0 { stream.cliff_time } else { stream.start_time };
    let elapsed  = (current_time - effective_start) as u128;
    let duration = (stream.end_time - effective_start) as u128;
    ((stream.total_amount as u128) * elapsed / duration) as u64
}
```

**Worked examples** (1 000 000 tokens, start=0, end=100, cliff=0):

| current_time | unlocked | notes |
|---|---|---|
| -10 | 0 | before start |
| 0 | 0 | at start (0% elapsed) |
| 25 | 250 000 | 25% of duration elapsed |
| 50 | 500 000 | 50% |
| 75 | 750 000 | 75% |
| 100 | 1 000 000 | at end — fully vested |
| 200 | 1 000 000 | past end — still fully vested |

**With cliff** (cliff=20):

| current_time | unlocked | notes |
|---|---|---|
| 15 | 0 | before cliff |
| 20 | 0 | exactly at cliff (0% of cliff→end elapsed) |
| 60 | 500 000 | 50% of (20→100) elapsed |
| 100 | 1 000 000 | fully vested |

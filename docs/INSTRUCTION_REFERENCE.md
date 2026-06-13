# BlockBite — Instruction Reference

**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Program ID (Localnet):** `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX`  
**Framework:** Anchor 1.0.0 · **Network:** Solana Devnet

---

## Overview

BlockBite exposes **9 on-chain instructions** split into two functional groups:

| Group | Instructions |
|---|---|
| Stream Vesting | `create_stream`, `withdraw`, `cancel`, `set_milestone`, `close_stream` |
| Campaign & Milestone Rewards | `create_campaign`, `create_milestone`, `verify_game`, `claim_milestone` |

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

const now = Math.floor(Date.now() / 1000);
await program.methods
  .createStream(
    new anchor.BN(1_000_000),  // total_amount: 1M tokens
    new anchor.BN(now),         // start_time: now
    new anchor.BN(now + 86400), // end_time: 24h from now
    new anchor.BN(0),           // cliff_time: none
    seed,
    false                       // milestone_enabled: false
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
| `NothingToWithdraw` | `claimable == 0` (cliff/milestone gate, or already fully withdrawn) |

**Example (TypeScript)**

```typescript
await program.methods
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
```

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
| 4 | `creator_token_account` | ❌ | ✅ | Creator's destination ATA |
| 5 | `recipient_token_account` | ❌ | ✅ | Recipient's destination ATA |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

**Behavior**
1. Validates stream is not already cancelled, not fully vested
2. Computes `recipient_due = unlocked - amount_withdrawn`, `creator_due = remaining in escrow - recipient_due`
3. Sets `stream.is_cancelled = true`
4. Transfers `recipient_due` to recipient and `creator_due` to creator (both via PDA-signed CPI)

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `stream.creator` |
| `StreamCancelled` | Already cancelled |
| `FullyVested` | `now >= stream.end_time` — stream fully vested, cannot cancel |

**Example (TypeScript)**

```typescript
await program.methods
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
```

---

### `set_milestone`

Creator marks a milestone as reached on a stream that has `milestone_enabled = true`. After this call, `withdraw` will no longer be gated by the milestone condition.

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
| `MilestoneAlreadyReached` | Already set |
| `StreamCancelled` | Stream is cancelled |

**Example (TypeScript)**

```typescript
await program.methods
  .setMilestone()
  .accounts({
    creator: creator.publicKey,
    stream: streamPda,
  })
  .signers([creator])
  .rpc();
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
3. Closes escrow token account (rent → creator)
4. Anchor closes stream account (rent → creator)

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `stream.creator` |
| `StreamNotSettled` | Stream is neither cancelled nor fully withdrawn |

**Example (TypeScript)**

```typescript
await program.methods
  .closeStream()
  .accounts({
    creator: creator.publicKey,
    stream: streamPda,
    recipient: recipient.publicKey,
    mint: mintAddress,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();
```

---

## Campaign & Milestone Reward Instructions

### `create_campaign`

Founder creates a reward campaign with a fixed budget. Tokens are deposited into a campaign escrow PDA.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `title_hash` | `[u8; 32]` | 32-byte IPFS/content hash of campaign details (stored on-chain for auditability) |
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

const campaignSeed = new anchor.BN(1001);
const titleHash = Array.from(createHash("sha256").update("My Campaign").digest());

const [campaignPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign"), founder.publicKey.toBuffer(), campaignSeed.toArrayLike(Buffer, "le", 8)],
  program.programId
);
const [campaignEscrow] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
  program.programId
);

await program.methods
  .createCampaign(titleHash, new anchor.BN(500_000), campaignSeed)
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
```

---

### `create_milestone`

Founder adds a milestone to a campaign. The milestone defines a game target, reward amount, and the player who can claim.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `description_hash` | `[u8; 32]` | IPFS/content hash of milestone description |
| `campaign_seed` | `u64` | Seed of the parent campaign PDA |
| `milestone_seed` | `u64` | Unique seed for this milestone PDA |
| `token_amount` | `u64` | Reward tokens reserved for this milestone |
| `game_authority` | `Pubkey` | Game server public key authorised to call `verify_game` |
| `recipient` | `Pubkey` | Player wallet that can claim after verification |
| `target_level` | `u8` | Required game level (1–30) |
| `difficulty` | `u8` | `1` = easy, `2` = medium, `3` = hard |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `founder` | ✅ | ✅ | Must match `campaign.founder` |
| 1 | `campaign` | ❌ | ✅ | Parent campaign PDA |
| 2 | `milestone` | ❌ | ✅ | **Init** — milestone PDA (seeds: `["milestone", campaign_pubkey, milestone_seed_le]`) |
| 3 | `system_program` | ❌ | ❌ | System program |

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `campaign.founder` |
| `InsufficientBudget` | `token_amount > campaign.total_budget - campaign.allocated_amount` |
| `InvalidAmount` | `token_amount == 0` |
| `InvalidLevel` | `target_level < 1 || target_level > 30` |
| `InvalidDifficulty` | `difficulty` not in `{1, 2, 3}` |

---

### `verify_game`

Game server signs and submits the player's achieved level for a milestone. This is the oracle step — only the `game_authority` declared in the milestone can call this.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `milestone_seed` | `u64` | Seed of the milestone to verify |
| `achieved_level` | `u8` | Level the player achieved in-game |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `campaign` | ❌ | ❌ | Parent campaign (used for PDA seed only) |
| 1 | `milestone` | ❌ | ✅ | Milestone PDA |
| 2 | `game_authority` | ✅ | ❌ | Must match `milestone.game_authority` |

**Behavior**
1. Validates `game_authority` matches on-chain `milestone.game_authority`
2. Validates `achieved_level >= milestone.target_level`
3. Sets `milestone.is_verified = true` and records `milestone.achieved_level`

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `InvalidGameAuthority` | Signer doesn't match `milestone.game_authority` |
| `MilestoneAlreadyVerified` | Already verified |
| `LevelNotReached` | `achieved_level < target_level` |

---

### `claim_milestone`

Recipient claims their milestone reward after verification. Transfers `token_amount` from campaign escrow to recipient.

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `milestone_seed` | `u64` | Seed of the milestone to claim |
| `campaign_seed` | `u64` | Seed of the parent campaign (needed for escrow PDA signing) |

**Accounts**

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `recipient` | ✅ | ✅ | Must match `milestone.recipient` |
| 1 | `milestone` | ❌ | ✅ | Milestone PDA |
| 2 | `campaign` | ❌ | ❌ | Parent campaign PDA |
| 3 | `mint` | ❌ | ❌ | SPL token mint |
| 4 | `campaign_escrow` | ❌ | ✅ | Campaign escrow vault |
| 5 | `recipient_token_account` | ❌ | ✅ | Player's destination ATA |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

**Behavior**
1. Validates: recipient matches, milestone is verified (`is_verified = true`), not already claimed
2. Sets `milestone.is_claimed = true` **before** CPI (CEI pattern, prevents re-entrancy)
3. Transfers `milestone.token_amount` from campaign escrow → recipient ATA

**Error Codes**

| Error | Trigger Condition |
|---|---|
| `Unauthorized` | Signer is not `milestone.recipient` |
| `MilestoneNotVerified` | `is_verified == false` |
| `AlreadyClaimed` | `is_claimed == true` |

---

## PDA Derivation Reference

| Account | Seeds | Program |
|---|---|---|
| `StreamAccount` | `["stream", creator_pubkey, recipient_pubkey, seed_u64_le]` | blockbite |
| `EscrowTokenAccount` | `["escrow", stream_pubkey]` | blockbite |
| `CampaignAccount` | `["campaign", founder_pubkey, seed_u64_le]` | blockbite |
| `CampaignEscrow` | `["campaign_escrow", campaign_pubkey]` | blockbite |
| `MilestoneAccount` | `["milestone", campaign_pubkey, milestone_seed_u64_le]` | blockbite |

---

## Error Code Index

| Code | Name | Message |
|---|---|---|
| 6000 | `Unauthorized` | Signer is not authorised to perform this action |
| 6001 | `NothingToWithdraw` | No tokens available to withdraw |
| 6002 | `StreamCancelled` | Stream has been cancelled |
| 6003 | `AlreadyCancelled` | Stream is already cancelled |
| 6004 | `StreamNotStarted` | Stream has not started yet |
| 6005 | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end |
| 6006 | `InvalidAmount` | Amount must be greater than zero |
| 6007 | `InvalidRecipient` | Creator and recipient cannot be the same account |
| 6008 | `FullyVested` | Stream is fully vested and cannot be cancelled |
| 6009 | `MilestoneAlreadyReached` | Milestone has already been reached |
| 6010 | `CampaignNotFound` | Campaign not found |
| 6011 | `MilestoneNotFound` | Milestone not found |
| 6012 | `MilestoneAlreadyVerified` | Milestone has already been verified |
| 6013 | `InsufficientBudget` | Campaign budget is insufficient for this milestone |
| 6014 | `MilestoneNotVerified` | Milestone has not been verified yet |
| 6015 | `StreamNotSettled` | Stream must be fully withdrawn or cancelled before closing |
| 6016 | `InvalidGameAuthority` | Provided game authority does not match the milestone's declared game authority |
| 6017 | `AlreadyClaimed` | Milestone reward has already been claimed |
| 6018 | `InvalidLevel` | Target level must be between 1 and 30 |
| 6019 | `LevelNotReached` | Achieved level does not meet the target level requirement |
| 6020 | `InvalidDifficulty` | Difficulty must be 1 (easy), 2 (medium), or 3 (hard) |

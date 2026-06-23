# All Instructions

**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Framework:** Anchor 1.0.0

BlockBite exposes **9 on-chain instructions** in two groups:

| Group | Instructions |
|---|---|
| Stream Vesting | `create_stream` · `withdraw` · `cancel` · `set_milestone` · `close_stream` |
| Campaign & Milestone | `create_campaign` · `create_milestone` · `verify_game` · `claim_milestone` |

---

## `create_stream`

Creates a vesting stream and locks `total_amount` tokens into a PDA-owned escrow vault.

### Parameters

| Name | Type | Description |
|---|---|---|
| `total_amount` | `u64` | Tokens to vest — must be > 0 |
| `start_time` | `i64` | Unix timestamp when vesting begins |
| `end_time` | `i64` | Unix timestamp when vesting fully completes (`end_time > start_time`) |
| `cliff_time` | `i64` | Cliff unlock timestamp. `0` = no cliff. If > 0, nothing unlocks before this time |
| `seed` | `u64` | Unique seed for PDA derivation |
| `milestone_enabled` | `bool` | If `true`, tokens are additionally gated until `set_milestone` is called |
| `name` | `[u8; 32]` | Display label (UTF-8, null-padded, max 31 chars). Display only — does not affect vesting logic |

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Payer and stream owner |
| 1 | `recipient` | ❌ | ❌ | Token recipient (stored as Pubkey) |
| 2 | `mint` | ❌ | ❌ | SPL token mint |
| 3 | `creator_token_account` | ❌ | ✅ | Source ATA (authority = creator) |
| 4 | `escrow_token_account` | ❌ | ✅ | **Init** — PDA vault (`["escrow", stream_pubkey]`) |
| 5 | `stream` | ❌ | ✅ | **Init** — stream state PDA (`["stream", creator, recipient, seed_le]`) |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |
| 7 | `system_program` | ❌ | ❌ | System program |

### Errors

| Error | Trigger |
|---|---|
| `InvalidAmount (6006)` | `total_amount == 0` |
| `InvalidTimestamp (6005)` | `end_time <= start_time` or `cliff_time > end_time` |
| `InvalidRecipient (6007)` | `creator == recipient` |

### Example

```typescript
const seed = new anchor.BN(Date.now());
const [streamPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("stream"), creator.publicKey.toBuffer(), recipient.publicKey.toBuffer(),
   seed.toArrayLike(Buffer, "le", 8)],
  program.programId
);
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()], program.programId
);
const now = Math.floor(Date.now() / 1000);

// Encode stream name: max 31 UTF-8 chars, null-padded to 32 bytes
const nameBytes = Array.from(Buffer.alloc(32, 0));
Buffer.from("Team Salary Q1".slice(0, 31), "utf8").copy(Buffer.from(nameBytes));

await program.methods
  .createStream(
    new anchor.BN(1_000_000), // total_amount
    new anchor.BN(now),        // start_time
    new anchor.BN(now + 86400),// end_time: 24h
    new anchor.BN(0),          // cliff_time: none
    seed,
    false,                     // milestone_enabled
    nameBytes                  // name: [u8; 32]
  )
  .accounts({
    creator: creator.publicKey, recipient: recipient.publicKey, mint,
    creatorTokenAccount: creatorAta, escrowTokenAccount: escrowPda,
    stream: streamPda,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([creator])
  .rpc();
```

---

## `withdraw`

Recipient claims all currently unlocked tokens. Safe to call multiple times — each call moves only the newly unlocked delta.

### Parameters

None.

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `recipient` | ✅ | ✅ | Must match `stream.recipient` |
| 1 | `stream` | ❌ | ✅ | Stream state PDA |
| 2 | `mint` | ❌ | ❌ | SPL token mint |
| 3 | `escrow_token_account` | ❌ | ✅ | Escrow vault |
| 4 | `recipient_token_account` | ❌ | ✅ | Destination ATA |
| 5 | `token_program` | ❌ | ❌ | SPL Token program |

### Unlock Formula

```
if cliff_time > 0 && now < cliff_time        → 0
if milestone_enabled && !milestone_reached   → 0
if now < start_time                          → 0
if now >= end_time                           → total_amount
else:
  effective_start = cliff_time > 0 ? cliff_time : start_time
  unlocked = total_amount × (now - effective_start) / (end_time - effective_start)
```

### Errors

| Error | Trigger |
|---|---|
| `Unauthorized (6000)` | Signer ≠ `stream.recipient` |
| `StreamCancelled (6002)` | Stream was cancelled |
| `StreamNotStarted (6004)` | `now < stream.start_time` |
| `NothingToWithdraw (6001)` | `claimable == 0` |

### Example

```typescript
await program.methods.withdraw()
  .accounts({
    recipient: recipient.publicKey, stream: streamPda, mint,
    escrowTokenAccount: escrowPda,
    recipientTokenAccount: recipientAta,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([recipient])
  .rpc();
```

---

## `cancel`

Creator cancels the stream. Vested tokens → recipient; unvested tokens → creator. Atomic — both transfers in one transaction.

### Parameters

None.

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Must match `stream.creator` |
| 1 | `stream` | ❌ | ✅ | Stream state PDA |
| 2 | `mint` | ❌ | ❌ | SPL token mint |
| 3 | `escrow_token_account` | ❌ | ✅ | Escrow vault |
| 4 | `creator_token_account` | ❌ | ✅ | Creator destination ATA |
| 5 | `recipient_token_account` | ❌ | ✅ | Recipient destination ATA |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

### Errors

| Error | Trigger |
|---|---|
| `Unauthorized (6000)` | Signer ≠ `stream.creator` |
| `AlreadyCancelled (6003)` | Already cancelled |
| `FullyVested (6008)` | `now >= end_time` — nothing unvested to return |

### Example

```typescript
await program.methods.cancel()
  .accounts({
    creator: creator.publicKey, stream: streamPda, mint,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta,
    recipientTokenAccount: recipientAta,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();
```

---

## `set_milestone`

Creator flips `milestone_reached = true` on a milestone-enabled stream. After this, `withdraw` no longer blocks on the milestone gate. One-way — cannot be unset.

### Parameters

None.

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Must match `stream.creator` |
| 1 | `stream` | ❌ | ✅ | Stream state PDA |

### Errors

| Error | Trigger |
|---|---|
| `Unauthorized (6000)` | Signer ≠ `stream.creator` |
| `MilestoneAlreadyReached (6009)` | Already set |
| `StreamCancelled (6002)` | Stream is cancelled |

### Example

```typescript
await program.methods.setMilestone()
  .accounts({ creator: creator.publicKey, stream: streamPda })
  .signers([creator])
  .rpc();
```

---

## `close_stream`

Closes a fully settled stream (cancelled or fully withdrawn). Returns ~0.004 SOL rent from both the stream account and the escrow token account to the creator.

### Parameters

None.

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `creator` | ✅ | ✅ | Rent destination; must match `stream.creator` |
| 1 | `stream` | ❌ | ✅ | Stream PDA — **closed** on success |
| 2 | `recipient` | ❌ | ❌ | Used for PDA seed derivation only |
| 3 | `mint` | ❌ | ❌ | SPL token mint |
| 4 | `escrow_token_account` | ❌ | ✅ | Escrow vault — **closed** on success |
| 5 | `creator_token_account` | ❌ | ✅ | Receives any dust tokens before close |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

### Errors

| Error | Trigger |
|---|---|
| `Unauthorized (6000)` | Signer ≠ `stream.creator` |
| `StreamNotSettled (6015)` | Stream is neither cancelled nor fully withdrawn |

### Example

```typescript
await program.methods.closeStream()
  .accounts({
    creator: creator.publicKey, stream: streamPda,
    recipient: recipient.publicKey, mint,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();
```

---

## `create_campaign`

Founder creates a reward campaign with a fixed token budget locked in escrow.

### Parameters

| Name | Type | Description |
|---|---|---|
| `title_hash` | `[u8; 32]` | SHA-256 of campaign title (tamper-evident on-chain commitment) |
| `total_budget` | `u64` | Total token budget — must be > 0 |
| `seed` | `u64` | Unique seed for PDA derivation |

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `founder` | ✅ | ✅ | Campaign owner; payer |
| 1 | `mint` | ❌ | ❌ | SPL token mint |
| 2 | `founder_token_account` | ❌ | ✅ | Source ATA |
| 3 | `campaign_escrow` | ❌ | ✅ | **Init** — PDA vault (`["campaign_escrow", campaign_pubkey]`) |
| 4 | `campaign` | ❌ | ✅ | **Init** — campaign PDA (`["campaign", founder, seed_le]`) |
| 5 | `token_program` | ❌ | ❌ | SPL Token program |
| 6 | `system_program` | ❌ | ❌ | System program |

### Errors

| Error | Trigger |
|---|---|
| `InvalidAmount (6006)` | `total_budget == 0` |

### Example

```typescript
import { createHash } from "crypto";
const campaignSeed = new anchor.BN(Date.now());
const titleHash    = Array.from(createHash("sha256").update("Season 1").digest());

const [campaignPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign"), founder.publicKey.toBuffer(), campaignSeed.toArrayLike(Buffer, "le", 8)],
  program.programId
);
const [campaignEscrow] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()], program.programId
);

await program.methods
  .createCampaign(titleHash, new anchor.BN(1_000_000), campaignSeed)
  .accounts({
    founder: founder.publicKey, mint,
    founderTokenAccount: founderAta,
    campaignEscrow, campaign: campaignPda,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([founder])
  .rpc();
```

---

## `create_milestone`

Founder adds a game milestone to a campaign — defines the reward, target level, difficulty, player, and game server oracle key.

### Parameters

| Name | Type | Description |
|---|---|---|
| `description_hash` | `[u8; 32]` | SHA-256 of milestone description |
| `campaign_seed` | `u64` | Seed of parent campaign |
| `milestone_seed` | `u64` | Unique seed for this milestone |
| `token_amount` | `u64` | Reward tokens — must be > 0 and ≤ remaining campaign budget |
| `game_authority` | `Pubkey` | Game server keypair authorised to call `verify_game` |
| `recipient` | `Pubkey` | Player wallet that can claim after verification |
| `target_level` | `u8` | Required level (1–30) |
| `difficulty` | `u8` | `1` = easy, `2` = medium, `3` = hard |

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `founder` | ✅ | ✅ | Must match `campaign.founder` |
| 1 | `campaign` | ❌ | ✅ | Parent campaign PDA |
| 2 | `milestone` | ❌ | ✅ | **Init** — milestone PDA (`["milestone", campaign_pubkey, milestone_seed_le]`) |
| 3 | `system_program` | ❌ | ❌ | System program |

### Errors

| Error | Trigger |
|---|---|
| `Unauthorized (6000)` | Signer ≠ `campaign.founder` |
| `InvalidAmount (6006)` | `token_amount == 0` |
| `InsufficientBudget (6013)` | `token_amount > remaining budget` |
| `InvalidLevel (6018)` | `target_level` outside 1–30 |
| `InvalidDifficulty (6020)` | `difficulty` not in {1, 2, 3} |

### Example

```typescript
const milestoneSeed = new anchor.BN(1);
const descHash = Array.from(createHash("sha256").update("Reach Level 10").digest());
const [milestonePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("milestone"), campaignPda.toBuffer(), milestoneSeed.toArrayLike(Buffer, "le", 8)],
  program.programId
);

await program.methods
  .createMilestone(
    descHash, campaignSeed, milestoneSeed,
    new anchor.BN(100_000),
    gameAuthority.publicKey,
    player.publicKey,
    10, 2
  )
  .accounts({
    founder: founder.publicKey,
    campaign: campaignPda, milestone: milestonePda,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .signers([founder])
  .rpc();
```

---

## `verify_game`

Game server oracle signs and submits the player's achieved level. Only the keypair stored in `milestone.game_authority` can call this.

### Parameters

| Name | Type | Description |
|---|---|---|
| `milestone_seed` | `u64` | Seed of the milestone to verify |
| `achieved_level` | `u8` | Level player achieved (must be ≥ `target_level`) |

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `campaign` | ❌ | ❌ | Parent campaign PDA (seed derivation only) |
| 1 | `milestone` | ❌ | ✅ | Milestone PDA |
| 2 | `game_authority` | ✅ | ❌ | Must match `milestone.game_authority` |

### Errors

| Error | Trigger |
|---|---|
| `InvalidGameAuthority (6016)` | Signer ≠ `milestone.game_authority` |
| `MilestoneAlreadyVerified (6012)` | Already verified |
| `InvalidLevel (6018)` | `achieved_level` outside 1–30 |
| `LevelNotReached (6019)` | `achieved_level < target_level` |

### Example

```typescript
// Signed by the game server's hot wallet
await gameServerProgram.methods
  .verifyGame(milestoneSeed, 12)
  .accounts({
    campaign: campaignPda, milestone: milestonePda,
    gameAuthority: gameAuthorityKeypair.publicKey,
  })
  .signers([gameAuthorityKeypair])
  .rpc();
```

---

## `claim_milestone`

Player claims their verified milestone reward. `is_claimed` is set to `true` before the token transfer (CEI pattern) — re-entrancy and double-claims are impossible.

### Parameters

| Name | Type | Description |
|---|---|---|
| `milestone_seed` | `u64` | Seed of the milestone to claim |
| `campaign_seed` | `u64` | Seed of the parent campaign |

### Accounts

| # | Account | Signer | Writable | Description |
|---|---|---|---|---|
| 0 | `recipient` | ✅ | ✅ | Must match `milestone.recipient` |
| 1 | `milestone` | ❌ | ✅ | Milestone PDA |
| 2 | `campaign` | ❌ | ❌ | Parent campaign PDA |
| 3 | `mint` | ❌ | ❌ | SPL token mint |
| 4 | `campaign_escrow` | ❌ | ✅ | Campaign escrow vault |
| 5 | `recipient_token_account` | ❌ | ✅ | Player's destination ATA |
| 6 | `token_program` | ❌ | ❌ | SPL Token program |

### Errors

| Error | Trigger |
|---|---|
| `Unauthorized (6000)` | Signer ≠ `milestone.recipient` |
| `MilestoneNotVerified (6014)` | `is_verified == false` |
| `AlreadyClaimed (6017)` | `is_claimed == true` |

### Example

```typescript
await playerProgram.methods
  .claimMilestone(milestoneSeed, campaignSeed)
  .accounts({
    recipient: playerKeypair.publicKey,
    milestone: milestonePda, campaign: campaignPda, mint,
    campaignEscrow, recipientTokenAccount: playerAta.address,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([playerKeypair])
  .rpc();
```

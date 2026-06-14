# create\_milestone

Add a game achievement milestone to an existing campaign, specifying the reward amount, target level, and recipient.

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `description_hash` | `[u8; 32]` | SHA-256 hash of the milestone description. Full content off-chain. |
| `campaign_seed` | `u64` | Seed used to derive the parent `campaign_account` PDA. |
| `milestone_seed` | `u64` | Unique seed for this milestone's PDA. |
| `token_amount` | `u64` | Tokens awarded to the player who completes this milestone. Must be > 0. |
| `game_authority` | `Pubkey` | Game server public key authorized to call `verify_game` for this milestone. |
| `recipient` | `Pubkey` | Player who can claim this reward after verification. |
| `target_level` | `u8` | Minimum level the player must reach. Range: 1–30. |
| `difficulty` | `u8` | Difficulty rating: `1` (easy), `2` (medium), `3` (hard). |

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `founder` | ✓ | ✓ | Must match `campaign_account.founder` |
| `campaign_account` | ✓ | — | Parent campaign PDA; `allocated_amount` and `milestone_count` are updated |
| `milestone_account` | ✓ | — | PDA: `["milestone", campaign_pda, milestone_seed_le8]` |
| `system_program` | — | — | Account creation |

---

## Behavior

1. **Checks** `signer == campaign.founder`.
2. **Validates** `token_amount > 0`.
3. **Validates** `1 <= target_level <= 30`.
4. **Validates** `difficulty ∈ {1, 2, 3}`.
5. **Checks** `campaign.allocated_amount + token_amount <= campaign.total_budget` (budget guard).
6. **Initializes** `MilestoneAccount` with all parameters; `is_verified = false`, `is_claimed = false`.
7. **Updates** `campaign.allocated_amount += token_amount`.
8. **Updates** `campaign.milestone_count += 1`.

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `Unauthorized (6000)` | Signer is not the campaign founder |
| `InvalidAmount (6006)` | `token_amount == 0` |
| `InvalidLevel (6018)` | `target_level < 1` OR `target_level > 30` |
| `InvalidDifficulty (6020)` | `difficulty ∉ {1, 2, 3}` |
| `InsufficientBudget (6013)` | `allocated_amount + token_amount > total_budget` |

---

## PDA Derivation

```typescript
const [milestonePda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("milestone"),
    campaignPda.toBuffer(),
    milestoneSeed.toArrayLike(Buffer, "le", 8),
  ],
  programId
);
```

---

## Example Usage

```typescript
import { createHash } from "crypto";

const milestoneSeed = new anchor.BN(1);
const descHash = createHash("sha256").update("Reach Level 10 in dungeon mode").digest();

await program.methods
  .createMilestone(
    [...descHash],              // description_hash [u8; 32]
    campaignSeed,               // campaign_seed
    milestoneSeed,              // milestone_seed
    new anchor.BN(5_000_000),   // token_amount: 5 tokens
    gameAuthority.publicKey,    // game server keypair
    player.publicKey,           // player who can claim
    10,                         // target_level: reach level 10
    2                           // difficulty: medium
  )
  .accounts({
    founder: founder.publicKey,
    campaignAccount: campaignPda,
    milestoneAccount: milestonePda,
    systemProgram: SystemProgram.programId,
  })
  .signers([founder])
  .rpc();
```

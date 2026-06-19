# Account Structures

All three on-chain account types are PDAs (Program Derived Addresses) owned by the BlockBite program. Fetch them with `program.account.<name>.fetch(pda)`.

---

## `StreamAccount`

**Total size:** 196 bytes (8 discriminator + 188 data)  
**PDA seeds:** `["stream", creator_pubkey, recipient_pubkey, seed_u64_le]`

| Field | Type | Bytes | Description |
|---|---|---|---|
| `creator` | `Pubkey` | 32 | Stream creator — can cancel and set milestone |
| `recipient` | `Pubkey` | 32 | Token recipient — can withdraw |
| `mint` | `Pubkey` | 32 | SPL token mint |
| `escrow_token_account` | `Pubkey` | 32 | Escrow vault PDA address |
| `total_amount` | `u64` | 8 | Total tokens to vest |
| `amount_withdrawn` | `u64` | 8 | Cumulative tokens claimed so far |
| `start_time` | `i64` | 8 | Vesting start (unix seconds) |
| `end_time` | `i64` | 8 | Vesting end (unix seconds) |
| `cliff_time` | `i64` | 8 | Cliff timestamp (`0` = no cliff) |
| `is_cancelled` | `bool` | 1 | Whether stream is cancelled |
| `bump` | `u8` | 1 | PDA canonical bump |
| `seed` | `u64` | 8 | Creator-supplied seed |
| `milestone_reached` | `bool` | 1 | Set by `set_milestone` |
| `milestone_enabled` | `bool` | 1 | Whether milestone gate is active |

**Fetch example:**

```typescript
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
```

**Off-chain unlock calculation:**

```typescript
function calculateUnlocked(stream: any, nowSecs: number): number {
  const { cliffTime, milestoneEnabled, milestoneReached,
          startTime, endTime, totalAmount } = stream;
  const cliff = cliffTime.toNumber();
  const start = startTime.toNumber();
  const end   = endTime.toNumber();
  const total = totalAmount.toNumber();

  if (cliff > 0 && nowSecs < cliff) return 0;
  if (milestoneEnabled && !milestoneReached) return 0;
  if (nowSecs < start) return 0;
  if (nowSecs >= end)  return total;

  const effectiveStart = cliff > 0 ? cliff : start;
  return Math.floor(total * (nowSecs - effectiveStart) / (end - effectiveStart));
}

const unlocked  = calculateUnlocked(stream, Math.floor(Date.now() / 1000));
const claimable = unlocked - stream.amountWithdrawn.toNumber();
```

---

## `CampaignAccount`

**Total size:** 90 bytes (8 discriminator + 82 data)  
**PDA seeds:** `["campaign", founder_pubkey, seed_u64_le]`

| Field | Type | Bytes | Description |
|---|---|---|---|
| `founder` | `Pubkey` | 32 | Campaign owner — can add milestones |
| `title_hash` | `[u8; 32]` | 32 | SHA-256/IPFS CID of campaign details |
| `total_budget` | `u64` | 8 | Total token budget deposited into escrow |
| `allocated_amount` | `u64` | 8 | Sum of all milestone `token_amount` values |
| `milestone_count` | `u8` | 1 | Number of milestones added so far |
| `bump` | `u8` | 1 | PDA canonical bump |

**Fetch example:**

```typescript
const campaign = await program.account.campaignAccount.fetch(campaignPda);
console.log({
  founder:         campaign.founder.toBase58(),
  totalBudget:     campaign.totalBudget.toString(),
  allocatedAmount: campaign.allocatedAmount.toString(),
  remaining:       (campaign.totalBudget.toNumber() - campaign.allocatedAmount.toNumber()).toString(),
  milestoneCount:  campaign.milestoneCount,
});
```

**Verify the off-chain title matches the on-chain hash:**

```typescript
import { createHash } from "crypto";

const offChainTitle = "Season 1 — Summer Campaign";
const computed = Array.from(createHash("sha256").update(offChainTitle).digest());
const matches  = JSON.stringify(computed) === JSON.stringify(Array.from(campaign.titleHash));
console.log("Title hash matches:", matches);
```

---

## `MilestoneAccount`

**Total size:** 150 bytes (8 discriminator + 142 data)  
**PDA seeds:** `["milestone", campaign_pubkey, milestone_seed_u64_le]`

| Field | Type | Bytes | Description |
|---|---|---|---|
| `campaign` | `Pubkey` | 32 | Parent campaign PDA |
| `recipient` | `Pubkey` | 32 | Player wallet that can claim |
| `description_hash` | `[u8; 32]` | 32 | SHA-256/IPFS CID of task description |
| `game_authority` | `Pubkey` | 32 | Game server keypair that can call `verify_game` |
| `token_amount` | `u64` | 8 | Reward token amount |
| `target_level` | `u8` | 1 | Required level (1–30) |
| `achieved_level` | `u8` | 1 | Level recorded by `verify_game` |
| `difficulty` | `u8` | 1 | `1` easy / `2` medium / `3` hard |
| `is_verified` | `bool` | 1 | Set to `true` by `verify_game` |
| `is_claimed` | `bool` | 1 | Set to `true` by `claim_milestone` |
| `bump` | `u8` | 1 | PDA canonical bump |

**Fetch example:**

```typescript
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
console.log({
  recipient:     milestone.recipient.toBase58(),
  gameAuthority: milestone.gameAuthority.toBase58(),
  tokenAmount:   milestone.tokenAmount.toString(),
  targetLevel:   milestone.targetLevel,
  achievedLevel: milestone.achievedLevel,
  difficulty:    ["", "easy", "medium", "hard"][milestone.difficulty],
  isVerified:    milestone.isVerified,
  isClaimed:     milestone.isClaimed,
});
```

---

## Protocol Constants

Defined in `programs/blockbite/src/constants.rs`:

| Constant | Value | Meaning |
|---|---|---|
| `MIN_LEVEL` | `1` | Minimum valid `target_level` / `achieved_level` |
| `MAX_LEVEL` | `30` | Maximum valid `target_level` / `achieved_level` |
| `DIFFICULTY_EASY` | `1` | Easy difficulty ID |
| `DIFFICULTY_MEDIUM` | `2` | Medium difficulty ID |
| `DIFFICULTY_HARD` | `3` | Hard difficulty ID |
| `EASY_MAX_LEVEL` | `5` | Easy mode caps at level 5 |
| `MEDIUM_MAX_LEVEL` | `15` | Medium mode caps at level 15 |

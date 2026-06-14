# Error Handling

BlockBite uses Anchor's `#[error_code]` macro. All program errors are typed and come with a numeric code (6000–6020) and a descriptive message. This page shows how to catch and handle them in your integration.

---

## Catching Errors in TypeScript

```typescript
import { AnchorError } from "@coral-xyz/anchor";

try {
  await program.methods.withdraw().accounts({ /* ... */ }).rpc();
} catch (err) {
  if (err instanceof AnchorError) {
    // err.error.errorCode.code    → "NothingToWithdraw"
    // err.error.errorCode.number  → 6001
    // err.error.errorMessage      → "No tokens available to withdraw"
    console.error(`BlockBite error [${err.error.errorCode.number}]: ${err.error.errorMessage}`);
    handleBlockBiteError(err.error.errorCode.number);
  } else {
    // Network error, account not found, etc.
    console.error("Transaction failed:", err);
  }
}
```

---

## Error Handler Utility

```typescript
export type BlockBiteErrorCode =
  | 6000 | 6001 | 6002 | 6003 | 6004 | 6005
  | 6006 | 6007 | 6008 | 6009 | 6010 | 6011
  | 6012 | 6013 | 6014 | 6015 | 6016 | 6017
  | 6018 | 6019 | 6020;

const BLOCKBITE_ERRORS: Record<number, string> = {
  6000: "You are not authorized to perform this action.",
  6001: "No tokens are available to withdraw yet. Wait for more time to elapse.",
  6002: "This stream has been cancelled.",
  6003: "This stream is already cancelled.",
  6004: "The stream has not started yet.",
  6005: "Invalid timestamps: end must be after start, and cliff must be before end.",
  6006: "Amount must be greater than zero.",
  6007: "Creator and recipient cannot be the same account.",
  6008: "Stream is fully vested and cannot be cancelled.",
  6009: "Milestone has already been reached. Cannot set it twice.",
  6010: "Campaign not found.",
  6011: "Milestone not found.",
  6012: "This milestone has already been verified.",
  6013: "Campaign budget is insufficient for this milestone reward.",
  6014: "Milestone has not been verified by the game server yet.",
  6015: "Stream must be fully withdrawn or cancelled before it can be closed.",
  6016: "The provided game authority does not match this milestone's declared authority.",
  6017: "This milestone reward has already been claimed.",
  6018: "Target level must be between 1 and 30.",
  6019: "The achieved level does not meet the milestone's required level.",
  6020: "Difficulty must be 1 (easy), 2 (medium), or 3 (hard).",
};

export function getBlockBiteErrorMessage(code: number): string {
  return BLOCKBITE_ERRORS[code] ?? `Unknown BlockBite error (${code})`;
}

export function handleBlockBiteError(code: number): never {
  throw new Error(getBlockBiteErrorMessage(code));
}
```

---

## Common Error Scenarios

### Withdraw Before Cliff

```typescript
// Stream has cliff_time in the future
// → NothingToWithdraw (6001)
// Solution: check cliffTime before calling withdraw
const stream = await program.account.streamAccount.fetch(streamPda);
const now = Math.floor(Date.now() / 1000);

if (stream.cliffTime.toNumber() > 0 && now < stream.cliffTime.toNumber()) {
  const cliffDate = new Date(stream.cliffTime.toNumber() * 1000);
  console.log(`Cliff not yet passed. Available from: ${cliffDate.toLocaleDateString()}`);
  return;
}
```

### Withdraw On Milestone Stream (Milestone Not Set)

```typescript
// stream.milestoneEnabled = true, stream.milestoneReached = false
// → NothingToWithdraw (6001)
const stream = await program.account.streamAccount.fetch(streamPda);
if (stream.milestoneEnabled && !stream.milestoneReached) {
  console.log("Waiting for creator to trigger the milestone gate.");
  return;
}
```

### Budget Exceeded When Adding Milestone

```typescript
// campaign.allocated_amount + token_amount > campaign.total_budget
// → InsufficientBudget (6013)
const campaign = await program.account.campaignAccount.fetch(campaignPda);
const remaining = BigInt(campaign.totalBudget.toString()) -
                  BigInt(campaign.allocatedAmount.toString());

if (BigInt(rewardAmount) > remaining) {
  console.error(`Insufficient budget. Remaining: ${remaining.toString()} raw tokens`);
  return;
}
```

### Player Tries to Claim Before Verification

```typescript
// milestone.is_verified = false
// → MilestoneNotVerified (6014)
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
if (!milestone.isVerified) {
  console.log("Achievement not yet verified by the game server.");
  return;
}
```

---

## Full Error Code Table

| Code | Name | Typical Fix |
|------|------|------------|
| 6000 | `Unauthorized` | Check signer matches expected authority |
| 6001 | `NothingToWithdraw` | Check cliff passed, milestone set, stream started |
| 6002 | `StreamCancelled` | Stream is dead; no further withdrawals |
| 6003 | `AlreadyCancelled` | Do not call `cancel` twice |
| 6004 | `StreamNotStarted` | Wait until `start_time` |
| 6005 | `InvalidTimestamp` | Ensure `end > start` and `cliff <= end` |
| 6006 | `InvalidAmount` | Amounts and budgets must be > 0 |
| 6007 | `InvalidRecipient` | Creator and recipient must differ |
| 6008 | `FullyVested` | Cannot cancel a fully vested stream |
| 6009 | `MilestoneAlreadyReached` | Gate already flipped; idempotent |
| 6010 | `CampaignNotFound` | Wrong PDA derivation for campaign |
| 6011 | `MilestoneNotFound` | Wrong PDA derivation for milestone |
| 6012 | `MilestoneAlreadyVerified` | Game server already verified this |
| 6013 | `InsufficientBudget` | Reduce milestone reward or increase budget |
| 6014 | `MilestoneNotVerified` | Wait for game server `verify_game` |
| 6015 | `StreamNotSettled` | Withdraw remaining tokens before closing |
| 6016 | `InvalidGameAuthority` | Wrong keypair signing `verify_game` |
| 6017 | `AlreadyClaimed` | Player already claimed this milestone |
| 6018 | `InvalidLevel` | Level must be 1–30 |
| 6019 | `LevelNotReached` | Achieved level below target level |
| 6020 | `InvalidDifficulty` | Difficulty must be 1, 2, or 3 |

See [full error reference](../reference/error-codes.md) for more detail.

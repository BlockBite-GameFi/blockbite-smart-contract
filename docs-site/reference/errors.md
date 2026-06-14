# Error Codes

BlockBite defines **21 error codes** starting at anchor offset `6000`. All errors are returned as `AnchorError` in TypeScript.

---

## Catching Errors

```typescript
import { AnchorError } from "@coral-xyz/anchor";

try {
  await program.methods.withdraw().accounts({ ... }).rpc();
} catch (err) {
  if (err instanceof AnchorError) {
    const code = err.error.errorCode.number;   // e.g. 6001
    const name = err.error.errorCode.code;     // e.g. "NothingToWithdraw"
    const msg  = err.error.errorMessage;
    console.error(`[${code}] ${name}: ${msg}`);
  }
}
```

---

## Full Error Table

| Code | Name | Message | Instructions |
|---|---|---|---|
| `6000` | `Unauthorized` | Signer is not authorised to perform this action | `withdraw`, `cancel`, `set_milestone`, `close_stream`, `create_milestone`, `claim_milestone` |
| `6001` | `NothingToWithdraw` | No tokens available to withdraw | `withdraw` |
| `6002` | `StreamCancelled` | Stream has been cancelled | `withdraw`, `set_milestone` |
| `6003` | `AlreadyCancelled` | Stream is already cancelled | `cancel` |
| `6004` | `StreamNotStarted` | Stream has not started yet | `withdraw` |
| `6005` | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end | `create_stream` |
| `6006` | `InvalidAmount` | Amount must be greater than zero | `create_stream`, `create_campaign`, `create_milestone` |
| `6007` | `InvalidRecipient` | Creator and recipient cannot be the same account | `create_stream` |
| `6008` | `FullyVested` | Stream is fully vested and cannot be cancelled | `cancel` |
| `6009` | `MilestoneAlreadyReached` | Milestone has already been reached | `set_milestone` |
| `6010` | `CampaignNotFound` | Campaign not found | PDA derivation mismatch |
| `6011` | `MilestoneNotFound` | Milestone not found | PDA derivation mismatch |
| `6012` | `MilestoneAlreadyVerified` | Milestone has already been verified | `verify_game` |
| `6013` | `InsufficientBudget` | Campaign budget is insufficient for this milestone | `create_milestone` |
| `6014` | `MilestoneNotVerified` | Milestone has not been verified yet | `claim_milestone` |
| `6015` | `StreamNotSettled` | Stream must be fully withdrawn or cancelled before closing | `close_stream` |
| `6016` | `InvalidGameAuthority` | Provided game authority does not match the milestone's declared game authority | `verify_game` |
| `6017` | `AlreadyClaimed` | Milestone reward has already been claimed | `claim_milestone` |
| `6018` | `InvalidLevel` | Target level must be between 1 and 30 | `create_milestone`, `verify_game` |
| `6019` | `LevelNotReached` | Achieved level does not meet the target level requirement | `verify_game` |
| `6020` | `InvalidDifficulty` | Difficulty must be 1 (easy), 2 (medium), or 3 (hard) | `create_milestone` |

---

## Errors by Instruction

### `create_stream`
- `6005 InvalidTimestamp` — `end_time <= start_time` or `cliff_time > end_time`
- `6006 InvalidAmount` — `total_amount == 0`
- `6007 InvalidRecipient` — creator and recipient are the same pubkey

### `withdraw`
- `6000 Unauthorized` — signer is not the recipient
- `6001 NothingToWithdraw` — nothing unlocked, or cliff/milestone gate still active
- `6002 StreamCancelled` — stream was cancelled before withdrawal
- `6004 StreamNotStarted` — called before `start_time`

### `cancel`
- `6000 Unauthorized` — signer is not the creator
- `6003 AlreadyCancelled` — already cancelled
- `6008 FullyVested` — past `end_time`; nothing unvested to return

### `set_milestone`
- `6000 Unauthorized` — signer is not the creator
- `6002 StreamCancelled` — stream is cancelled
- `6009 MilestoneAlreadyReached` — already set

### `close_stream`
- `6000 Unauthorized` — signer is not the creator
- `6015 StreamNotSettled` — stream is active (not cancelled, not fully withdrawn)

### `create_campaign`
- `6006 InvalidAmount` — `total_budget == 0`

### `create_milestone`
- `6000 Unauthorized` — signer is not the campaign founder
- `6006 InvalidAmount` — `token_amount == 0`
- `6013 InsufficientBudget` — reward exceeds remaining campaign budget
- `6018 InvalidLevel` — `target_level` outside 1–30
- `6020 InvalidDifficulty` — `difficulty` not in {1, 2, 3}

### `verify_game`
- `6012 MilestoneAlreadyVerified` — already verified
- `6016 InvalidGameAuthority` — signer doesn't match stored `game_authority`
- `6018 InvalidLevel` — `achieved_level` outside 1–30
- `6019 LevelNotReached` — `achieved_level < target_level`

### `claim_milestone`
- `6000 Unauthorized` — signer is not the milestone recipient
- `6014 MilestoneNotVerified` — game server hasn't verified yet
- `6017 AlreadyClaimed` — reward already claimed

---

## Common Fixes

| Error | Most Likely Cause | Fix |
|---|---|---|
| `Unauthorized` | Wrong keypair signed the tx | Creator signs `cancel`/`set_milestone`; recipient signs `withdraw`; game server signs `verify_game` |
| `NothingToWithdraw` | Cliff not passed or milestone not set | Wait past `cliff_time`; creator must call `set_milestone` first |
| `InvalidTimestamp` | Bad time parameters | Ensure `end_time > start_time`; `cliff_time` must be ≤ `end_time` or `0` |
| `FullyVested` | Tried to cancel after vesting ended | Vesting is complete; call `close_stream` instead |
| `StreamNotSettled` | Called `close_stream` on active stream | Either cancel the stream or wait for recipient to fully withdraw |
| `LevelNotReached` | `achieved_level < target_level` | Player must meet the target before game server calls `verify_game` |
| `InsufficientBudget` | Milestone reward > remaining campaign budget | Reduce `token_amount` or create a larger campaign |

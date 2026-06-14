# Error Codes

All 21 BlockBite error codes, their numeric identifiers, trigger conditions, and recommended client-side responses.

---

## Quick Reference Table

| Code | Name | Message | Trigger |
|------|------|---------|---------|
| **6000** | `Unauthorized` | Signer is not authorised to perform this action | Wrong signer on any mutating instruction |
| **6001** | `NothingToWithdraw` | No tokens available to withdraw | `claimable == 0` — cliff not passed, milestone not set, or already fully withdrawn |
| **6002** | `StreamCancelled` | Stream has been cancelled | Any operation on a cancelled stream |
| **6003** | `AlreadyCancelled` | Stream is already cancelled | Calling `cancel` on an already-cancelled stream |
| **6004** | `StreamNotStarted` | Stream has not started yet | `now < stream.start_time` on `withdraw` |
| **6005** | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end | `end_time <= start_time` OR `cliff_time > end_time` |
| **6006** | `InvalidAmount` | Amount must be greater than zero | `total_amount == 0`, `token_amount == 0`, or `total_budget == 0` |
| **6007** | `InvalidRecipient` | Creator and recipient cannot be the same account | `creator == recipient` on `create_stream` |
| **6008** | `FullyVested` | Stream is fully vested and cannot be cancelled | `unlocked == total_amount` when calling `cancel` |
| **6009** | `MilestoneAlreadyReached` | Milestone has already been reached | `set_milestone` called twice on same stream |
| **6010** | `CampaignNotFound` | Campaign not found | Campaign PDA derivation mismatch |
| **6011** | `MilestoneNotFound` | Milestone not found | Milestone PDA derivation mismatch |
| **6012** | `MilestoneAlreadyVerified` | Milestone has already been verified | `verify_game` called twice on same milestone |
| **6013** | `InsufficientBudget` | Campaign budget is insufficient for this milestone | `allocated_amount + token_amount > total_budget` |
| **6014** | `MilestoneNotVerified` | Milestone has not been verified yet | Player calls `claim_milestone` before `verify_game` |
| **6015** | `StreamNotSettled` | Stream must be fully withdrawn or cancelled before closing | `close_stream` called when stream still has locked tokens |
| **6016** | `InvalidGameAuthority` | Provided game authority does not match the milestone's declared game authority | `verify_game` signer ≠ `milestone.game_authority` |
| **6017** | `AlreadyClaimed` | Milestone reward has already been claimed | `claim_milestone` called after reward already claimed |
| **6018** | `InvalidLevel` | Target level must be between 1 and 30 | `target_level < 1`, `target_level > 30`, `achieved_level < 1`, or `achieved_level > 30` |
| **6019** | `LevelNotReached` | Achieved level does not meet the target level requirement | `achieved_level < milestone.target_level` in `verify_game` |
| **6020** | `InvalidDifficulty` | Difficulty must be 1 (easy), 2 (medium), or 3 (hard) | `difficulty ∉ {1, 2, 3}` on `create_milestone` |

---

## Detailed Descriptions

### 6000 — Unauthorized

**Raised by:** `withdraw`, `cancel`, `set_milestone`, `close_stream`, `create_milestone`, `verify_game`, `claim_milestone`

The transaction signer does not match the expected authority for this instruction. Each instruction has a designated signer:

| Instruction | Expected Signer |
|------------|----------------|
| `withdraw` | `stream.recipient` |
| `cancel` | `stream.creator` |
| `set_milestone` | `stream.creator` |
| `close_stream` | `stream.creator` |
| `create_milestone` | `campaign.founder` |
| `verify_game` | `milestone.game_authority` |
| `claim_milestone` | `milestone.recipient` |

**Fix:** Ensure the correct keypair signs the transaction.

---

### 6001 — NothingToWithdraw

**Raised by:** `withdraw`

The calculated `claimable` amount is zero. This can happen for several reasons:

1. **Cliff not passed** — `stream.cliff_time > 0` and `now < stream.cliff_time`
2. **Milestone gate active** — `stream.milestone_enabled == true` and `stream.milestone_reached == false`
3. **Stream not started** — `now < stream.start_time`
4. **Already fully withdrawn** — `stream.amount_withdrawn == stream.total_amount`
5. **Integer rounding** — all fractional tokens have been claimed and only dust remains (claim on `close_stream`)

**Fix:** Use `calculateUnlocked()` client-side before calling `withdraw` to check if claimable > 0.

---

### 6002 — StreamCancelled

**Raised by:** `withdraw`

The stream has been cancelled by the creator. No further withdrawals are possible.

**Fix:** No tokens remain claimable. If vested tokens were owed, they were sent during `cancel`.

---

### 6003 — AlreadyCancelled

**Raised by:** `cancel`

Calling `cancel` on a stream that is already `is_cancelled == true`.

**Fix:** Check `stream.is_cancelled` before calling `cancel`.

---

### 6004 — StreamNotStarted

**Raised by:** `withdraw`

The current block time is before `stream.start_time`.

**Fix:** Wait until after `start_time` to call `withdraw`.

---

### 6005 — InvalidTimestamp

**Raised by:** `create_stream`

Timestamp validation failed:
- `end_time <= start_time` — vesting duration must be positive
- `cliff_time > end_time` — cliff cannot be after vesting ends

**Fix:** Ensure `start_time < end_time` and `cliff_time <= end_time`.

---

### 6006 — InvalidAmount

**Raised by:** `create_stream`, `create_campaign`, `create_milestone`

An amount parameter was zero.

**Fix:** All amounts and budgets must be > 0.

---

### 6007 — InvalidRecipient

**Raised by:** `create_stream`

The creator and recipient are the same account. A stream from yourself to yourself is meaningless.

**Fix:** Use a different recipient public key.

---

### 6008 — FullyVested

**Raised by:** `cancel`

The stream is 100% vested (`unlocked == total_amount`). There are no unvested tokens to return to the creator, making cancellation a no-op.

**Fix:** If the stream is fully vested, the creator has no recourse. The recipient should `withdraw` the remaining tokens. The creator can then call `close_stream`.

---

### 6009 — MilestoneAlreadyReached

**Raised by:** `set_milestone`

`set_milestone` was already called for this stream. The gate is already open.

**Fix:** This is an idempotent operation — the gate is already open. No action needed.

---

### 6010 — CampaignNotFound / 6011 — MilestoneNotFound

**Raised by:** account constraint validation

The PDA derivation did not match the expected account. Usually a client-side bug.

**Fix:** Double-check seed ordering and types. See [PDA Seeds](pda-seeds.md).

---

### 6013 — InsufficientBudget

**Raised by:** `create_milestone`

Adding this milestone's `token_amount` would exceed `campaign.total_budget`.

**Fix:** Check `campaign.total_budget - campaign.allocated_amount` before adding milestones.

---

### 6015 — StreamNotSettled

**Raised by:** `close_stream`

The stream still has unvested (or unclaimed) tokens. It is neither fully withdrawn nor cancelled.

**Fix:** Either wait for full vesting and `withdraw` all tokens, or `cancel` the stream first.

---

### 6016 — InvalidGameAuthority

**Raised by:** `verify_game`

The keypair signing `verify_game` does not match `milestone.game_authority`.

**Fix:** Ensure the game server is using the correct keypair — the one that was declared when `create_milestone` was called.

---

### 6018 — InvalidLevel / 6019 — LevelNotReached

**Raised by:** `verify_game`, `create_milestone`

- `InvalidLevel (6018)`: Level value outside 1–30 range
- `LevelNotReached (6019)`: `achieved_level < milestone.target_level`

**Fix:** For `6018`, keep levels in [1, 30]. For `6019`, only call `verify_game` after the player has actually reached the target level.

---

## Using Error Codes in TypeScript

```typescript
import { AnchorError } from "@coral-xyz/anchor";

try {
  await program.methods.withdraw().accounts({...}).rpc();
} catch (err) {
  if (err instanceof AnchorError) {
    switch (err.error.errorCode.number) {
      case 6001:
        console.log("Nothing to withdraw yet — check cliff or milestone status");
        break;
      case 6002:
        console.log("Stream was cancelled");
        break;
      case 6004:
        console.log("Stream hasn't started yet");
        break;
      default:
        console.error(`BlockBite error ${err.error.errorCode.number}: ${err.error.errorMessage}`);
    }
  }
}
```

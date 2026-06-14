# withdraw

Claim all currently unlocked tokens from a vesting stream. Can be called repeatedly as more tokens vest.

---

## Parameters

None. The amount is calculated on-chain from the current clock.

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `recipient` | — | ✓ | Must match `stream_account.recipient` |
| `stream_account` | ✓ | — | Stream PDA; `amount_withdrawn` is updated here |
| `escrow_token_account` | ✓ | — | Source of tokens |
| `recipient_token_account` | ✓ | — | Recipient's ATA; destination of tokens |
| `token_program` | — | — | SPL Token Program |

---

## Behavior

1. **Checks** that `signer == stream.recipient`.
2. **Checks** that the stream is not cancelled.
3. **Checks** that `now >= stream.start_time`.
4. **Calls** `calculate_unlocked(stream, now)` to get total unlocked tokens.
5. **Computes** `claimable = unlocked - stream.amount_withdrawn`.
6. **Checks** `claimable > 0` (errors if nothing to withdraw).
7. **Updates** `stream.amount_withdrawn += claimable` (CEI: effect before CPI).
8. **Transfers** `claimable` tokens from escrow → recipient ATA via program-signed CPI.

---

## Unlock Formula

```
if cliff_time > 0 and now < cliff_time → unlocked = 0
if milestone_enabled and !milestone_reached → unlocked = 0
if now < start_time → unlocked = 0
if now >= end_time → unlocked = total_amount
else:
  effective_start = cliff_time > 0 ? cliff_time : start_time
  elapsed  = now - effective_start
  duration = end_time - effective_start
  unlocked = total_amount × elapsed / duration  (integer arithmetic)
```

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `Unauthorized (6000)` | Signer is not the stream recipient |
| `StreamCancelled (6002)` | Stream has been cancelled by creator |
| `StreamNotStarted (6004)` | Current time is before `start_time` |
| `NothingToWithdraw (6001)` | `claimable == 0` (cliff not passed, milestone not set, or already fully withdrawn) |

---

## Example Usage

```typescript
const withdrawTx = await program.methods
  .withdraw()
  .accounts({
    recipient: recipient.publicKey,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([recipient])
  .rpc();

console.log("Withdrew! TX:", withdrawTx);
```

### Check Claimable Amount Client-Side

Before calling `withdraw`, you can predict the claimable amount:

```typescript
import { calculateUnlocked } from "./blockbite-utils"; // your client helper

const stream = await program.account.streamAccount.fetch(streamPda);
const now = Math.floor(Date.now() / 1000);

function calculateUnlocked(stream: any, now: number): bigint {
  if (stream.cliffTime.toNumber() > 0 && now < stream.cliffTime.toNumber()) return 0n;
  if (stream.milestoneEnabled && !stream.milestoneReached) return 0n;
  if (now < stream.startTime.toNumber()) return 0n;
  if (now >= stream.endTime.toNumber()) return BigInt(stream.totalAmount.toString());

  const effectiveStart = stream.cliffTime.toNumber() > 0
    ? stream.cliffTime.toNumber()
    : stream.startTime.toNumber();

  const elapsed = BigInt(now - effectiveStart);
  const duration = BigInt(stream.endTime.toNumber() - effectiveStart);
  return (BigInt(stream.totalAmount.toString()) * elapsed) / duration;
}

const unlocked = calculateUnlocked(stream, now);
const claimable = unlocked - BigInt(stream.amountWithdrawn.toString());
console.log("Claimable:", claimable.toString());
```

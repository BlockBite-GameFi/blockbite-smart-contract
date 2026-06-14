# set\_milestone

Flip the one-way milestone gate on a milestone-enabled stream, allowing the recipient to begin withdrawing.

---

## Parameters

None.

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `creator` | — | ✓ | Must match `stream_account.creator` |
| `stream_account` | ✓ | — | `milestone_reached` is set to `true` here |

---

## Behavior

1. **Checks** `signer == stream.creator`.
2. **Checks** `stream.milestone_enabled == true` (only valid on milestone streams; though technically the error path is via anchor constraint).
3. **Checks** `!stream.milestone_reached` — cannot flip twice (`MilestoneAlreadyReached`).
4. **Sets** `stream.milestone_reached = true`.

After this call, `calculate_unlocked()` no longer returns 0 due to the milestone gate. The recipient can call `withdraw` to claim tokens that have vested since `start_time`.

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `Unauthorized (6000)` | Signer is not the creator |
| `MilestoneAlreadyReached (6009)` | `set_milestone` was already called on this stream |

---

## Example Usage

```typescript
const setMilestoneTx = await program.methods
  .setMilestone()
  .accounts({
    creator: creator.publicKey,
    streamAccount: streamPda,
  })
  .signers([creator])
  .rpc();

console.log("Milestone reached! TX:", setMilestoneTx);

// Recipient can now withdraw
const stream = await program.account.streamAccount.fetch(streamPda);
console.log("milestoneReached:", stream.milestoneReached); // true
```

---

## Use Cases

| Use Case | Example |
|----------|---------|
| **KPI milestone** | Flip when team ships the mainnet product |
| **Fundraise completion** | Flip after IDO closes and tokens distribute |
| **Governance vote** | Flip after DAO approves a proposal |
| **Partnership sign-off** | Flip when legal docs are executed |

---

## Notes

- The gate is **one-way**: once flipped to `true`, it cannot be reset to `false`. Revocation requires cancelling the stream.
- If the stream also has a `cliff_time`, both the cliff **and** the milestone must be satisfied before tokens unlock.
- The creator is a **trusted party** for this gate. There is no on-chain timeout — if the creator becomes unresponsive, the stream is effectively frozen until they act (or until it's cancelled).

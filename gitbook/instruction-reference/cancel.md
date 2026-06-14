# cancel

Cancel an active vesting stream. Vested tokens go to the recipient; unvested tokens return to the creator.

---

## Parameters

None.

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `creator` | ✓ | ✓ | Must match `stream_account.creator` |
| `recipient` | ✓ | — | Receives their vested portion |
| `stream_account` | ✓ | — | `is_cancelled` flag is set here |
| `escrow_token_account` | ✓ | — | Source of all tokens |
| `creator_token_account` | ✓ | — | Creator's ATA; receives unvested portion |
| `recipient_token_account` | ✓ | — | Recipient's ATA; receives vested portion |
| `token_program` | — | — | SPL Token Program |

---

## Behavior

1. **Checks** `signer == stream.creator`.
2. **Checks** stream is not already cancelled (`AlreadyCancelled`).
3. **Computes** `unlocked = calculate_unlocked(stream, now)`.
4. **Checks** `unlocked < total_amount` (cannot cancel a fully vested stream).
5. **Computes** split:
   - `vested_to_recipient = unlocked - amount_withdrawn` (their claimable portion)
   - `unvested_to_creator = total_amount - unlocked`
6. **Sets** `stream.is_cancelled = true` (CEI: effect before CPIs).
7. **Transfers** vested tokens → recipient ATA (if > 0).
8. **Transfers** unvested tokens → creator ATA (if > 0).

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `Unauthorized (6000)` | Signer is not the creator |
| `AlreadyCancelled (6003)` | Stream was already cancelled |
| `FullyVested (6008)` | `unlocked == total_amount`; cancellation would give creator nothing |

---

## Token Split Example

```
Stream: 1,000,000 tokens, 0 → 1,000 seconds
Cancel at t=400 (40% through)
Recipient already withdrew 200,000 tokens

  unlocked         = 1,000,000 × 400 / 1000 = 400,000
  vested_to_recipient = 400,000 - 200,000   = 200,000  → recipient
  unvested_to_creator = 1,000,000 - 400,000 = 600,000  → creator
```

---

## Example Usage

```typescript
const cancelTx = await program.methods
  .cancel()
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("Stream cancelled! TX:", cancelTx);
```

---

## Notes

- After cancellation, `stream.is_cancelled = true`. No further `withdraw` calls are possible.
- The creator should call [`close_stream`](close-stream.md) after cancellation to recover rent.
- If the recipient has **never withdrawn**, the full vested amount is sent in one transfer during cancel.

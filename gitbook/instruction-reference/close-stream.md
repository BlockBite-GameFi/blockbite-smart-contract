# close\_stream

Close a fully settled stream, recovering SOL rent from both the stream account and the escrow account.

---

## Parameters

None.

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `creator` | ✓ | ✓ | Rent recipient; must match `stream_account.creator` |
| `stream_account` | ✓ | — | Closed — lamports returned to creator |
| `escrow_token_account` | ✓ | — | Closed — remaining tokens swept to creator, rent returned |
| `creator_token_account` | ✓ | — | Creator's ATA; receives any dust tokens from escrow |
| `token_program` | — | — | SPL Token Program |

---

## Behavior

1. **Checks** `signer == stream.creator`.
2. **Checks** the stream is **settled** — either:
   - `stream.is_cancelled == true`, OR
   - `stream.amount_withdrawn == stream.total_amount` (fully withdrawn)
3. If escrow has a non-zero token balance (dust from rounding), **transfers** dust → `creator_token_account`.
4. **Closes** `escrow_token_account` via SPL `close_account` (returns lamports to creator).
5. **Closes** `stream_account` (returns lamports to creator).

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `Unauthorized (6000)` | Signer is not the creator |
| `StreamNotSettled (6015)` | Stream is neither fully withdrawn nor cancelled |

---

## Example Usage

```typescript
// After stream is fully withdrawn OR cancelled:
const closeTx = await program.methods
  .closeStream()
  .accounts({
    creator: creator.publicKey,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("Stream closed! Rent recovered. TX:", closeTx);
```

---

## Rent Recovery

Two accounts are closed:

| Account | Approx. Rent (SOL) |
|---------|-------------------|
| `StreamAccount` (196 bytes + discriminator) | ~0.002 SOL |
| `EscrowTokenAccount` (165 bytes) | ~0.002 SOL |
| **Total recovered** | **~0.004 SOL** |

Values depend on Solana's rent schedule. Use `getMinimumBalanceForRentExemption` to get exact values.

---

## Notes

- `close_stream` is **optional** — streams can remain on-chain indefinitely. Calling it simply recovers rent.
- Dust tokens in the escrow (from integer division rounding) are automatically swept to the creator on close.
- After closing, the stream PDA no longer exists. Do not attempt to fetch it.

# create\_stream

Initialize a vesting schedule and transfer tokens into a PDA-controlled escrow.

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `total_amount` | `u64` | Total tokens to vest (raw units). Must be > 0. |
| `start_time` | `i64` | Unix timestamp when vesting begins. |
| `end_time` | `i64` | Unix timestamp when vesting completes. Must be > `start_time`. |
| `cliff_time` | `i64` | Unix timestamp of the cliff (0 = no cliff). Must be ≤ `end_time` if set. |
| `seed` | `u64` | Unique creator-supplied seed for PDA derivation. Allows multiple streams between same creator/recipient pair. |
| `milestone_enabled` | `bool` | If `true`, recipient cannot withdraw until `set_milestone` is called. |

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `creator` | ✓ | ✓ | Stream creator; pays rent and deposits tokens |
| `recipient` | — | — | Designated token recipient |
| `mint` | — | — | SPL token mint address |
| `creator_token_account` | ✓ | — | Creator's ATA; source of `total_amount` |
| `stream_account` | ✓ | — | PDA: `["stream", creator, recipient, seed_le8]` |
| `escrow_token_account` | ✓ | — | PDA: `["escrow", stream_pda]` — holds locked tokens |
| `token_program` | — | — | SPL Token Program |
| `system_program` | — | — | For account creation |
| `rent` | — | — | Rent sysvar |

---

## Behavior

1. **Validates** all parameters: `total_amount > 0`, `end_time > start_time`, `cliff_time <= end_time` (if non-zero), `creator != recipient`.
2. **Initializes** `StreamAccount` with the provided parameters.
3. **Creates** the `EscrowTokenAccount` PDA (owned by the program).
4. **Transfers** `total_amount` tokens from `creator_token_account` → `escrow_token_account` via SPL `transfer_checked`.

After this call: the creator no longer controls the tokens. They are held by the program until withdrawn, cancelled, or swept on close.

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `InvalidAmount (6006)` | `total_amount == 0` |
| `InvalidTimestamp (6005)` | `end_time <= start_time` OR `cliff_time > end_time` |
| `InvalidRecipient (6007)` | `creator == recipient` |

---

## PDA Derivation

```typescript
const [streamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    creator.publicKey.toBuffer(),
    recipient.publicKey.toBuffer(),
    seed.toArrayLike(Buffer, "le", 8),
  ],
  programId
);

const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  programId
);
```

---

## Example Usage

```typescript
const seed = new anchor.BN(42);
const now = Math.floor(Date.now() / 1000);

await program.methods
  .createStream(
    new anchor.BN(10_000_000), // 10 tokens (6 decimals)
    new anchor.BN(now),
    new anchor.BN(now + 86400 * 365), // 1 year
    new anchor.BN(now + 86400 * 90),  // 90-day cliff
    seed,
    false // no milestone gate
  )
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .signers([creator])
  .rpc();
```

### With Milestone Gate

```typescript
await program.methods
  .createStream(
    new anchor.BN(5_000_000),
    new anchor.BN(now),
    new anchor.BN(now + 86400 * 180), // 6-month vest after milestone
    new anchor.BN(0),                  // no cliff
    seed,
    true // milestone required before any withdrawal
  )
  .accounts({ /* ... same as above ... */ })
  .rpc();
```

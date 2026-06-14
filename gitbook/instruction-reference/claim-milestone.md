# claim\_milestone

Claim a verified game achievement reward. Transfers tokens from the campaign escrow to the player.

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `milestone_seed` | `u64` | Seed used to derive the `milestone_account` PDA. |
| `campaign_seed` | `u64` | Seed used to derive the `campaign_account` PDA. |

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `player` | — | ✓ | Must match `milestone_account.recipient` |
| `campaign_account` | — | — | Parent campaign PDA |
| `milestone_account` | ✓ | — | `is_claimed` is set to `true` here |
| `campaign_escrow_token_account` | ✓ | — | Source of reward tokens |
| `player_token_account` | ✓ | — | Player's ATA; destination of reward |
| `token_program` | — | — | SPL Token Program |

---

## Behavior

1. **Checks** `signer == milestone.recipient` (`Unauthorized`).
2. **Checks** `milestone.is_verified == true` (`MilestoneNotVerified`).
3. **Checks** `!milestone.is_claimed` (`AlreadyClaimed`).
4. **Sets** `milestone.is_claimed = true` (CEI: effect before CPI).
5. **Transfers** `milestone.token_amount` from campaign escrow → player ATA via program-signed CPI.

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `Unauthorized (6000)` | Signer is not the declared recipient |
| `MilestoneNotVerified (6014)` | Game server has not yet called `verify_game` |
| `AlreadyClaimed (6017)` | Reward was already claimed |

---

## Example Usage

```typescript
const claimTx = await program.methods
  .claimMilestone(
    milestoneSeed,
    campaignSeed
  )
  .accounts({
    player: player.publicKey,
    campaignAccount: campaignPda,
    milestoneAccount: milestonePda,
    campaignEscrowTokenAccount: campaignEscrowPda,
    playerTokenAccount: playerAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([player])
  .rpc();

console.log("Reward claimed! TX:", claimTx);

const milestone = await program.account.milestoneAccount.fetch(milestonePda);
console.log("isClaimed:", milestone.isClaimed); // true
```

---

## Full Flow Summary

```
Founder                  Game Server              Player
  │                           │                      │
  ├─ create_campaign ─────────┼──────────────────────┤
  ├─ create_milestone ────────┼──────────────────────┤
  │                           │                      │
  │                           ├─ [player plays game] ┤
  │                           ├─ verify_game ─────── ┤
  │                           │  (signs with         │
  │                           │   game_authority)     │
  │                           │                      │
  │                           │                      ├─ claim_milestone
  │                           │                      │  (tokens arrive)
```

---

## Notes

- The claim is **idempotent-protected**: `is_claimed = true` is set before the token transfer (CEI pattern), making double-spend impossible even if the transaction is replayed.
- The player **must have a valid ATA** for the campaign's token mint before claiming. If it doesn't exist, create it first with `getOrCreateAssociatedTokenAccount`.

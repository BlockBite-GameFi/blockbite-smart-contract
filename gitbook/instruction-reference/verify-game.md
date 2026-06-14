# verify\_game

Called by the game server to cryptographically confirm that a player has reached the required level for a milestone.

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `milestone_seed` | `u64` | Seed used to derive the `milestone_account` PDA. |
| `achieved_level` | `u8` | Level the player actually reached. Must be ≥ `milestone.target_level`. Range: 1–30. |

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `game_authority` | — | ✓ | Must match `milestone_account.game_authority` |
| `campaign_account` | — | — | Parent campaign PDA (for seed derivation) |
| `milestone_account` | ✓ | — | `is_verified` and `achieved_level` are set here |

---

## Behavior

1. **Checks** `signer == milestone.game_authority` (`InvalidGameAuthority` if mismatch).
2. **Checks** `!milestone.is_verified` (`MilestoneAlreadyVerified` if already done).
3. **Validates** `1 <= achieved_level <= 30`.
4. **Checks** `achieved_level >= milestone.target_level` (`LevelNotReached` if insufficient).
5. **Sets** `milestone.achieved_level = achieved_level`.
6. **Sets** `milestone.is_verified = true`.

After this call, the player (recipient) can call `claim_milestone` to receive their reward.

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `InvalidGameAuthority (6016)` | Signer's public key does not match `milestone.game_authority` |
| `MilestoneAlreadyVerified (6012)` | `verify_game` was already successfully called for this milestone |
| `InvalidLevel (6018)` | `achieved_level < 1` OR `achieved_level > 30` |
| `LevelNotReached (6019)` | `achieved_level < milestone.target_level` |

---

## Example Usage

```typescript
// This is called by your game server backend, not by the player

const verifyTx = await program.methods
  .verifyGame(
    milestoneSeed,    // milestone_seed
    12                // achieved_level: player reached level 12 (target was 10)
  )
  .accounts({
    gameAuthority: gameAuthority.publicKey,
    campaignAccount: campaignPda,
    milestoneAccount: milestonePda,
  })
  .signers([gameAuthority]) // game server keypair signs this
  .rpc();

console.log("Achievement verified! TX:", verifyTx);
```

### Game Server Integration Pattern

```typescript
// In your game backend (Node.js / Express / Fastify)
app.post("/api/verify-achievement", async (req, res) => {
  const { playerId, milestoneSeedStr, achievedLevel } = req.body;

  // Load game authority keypair from secure env
  const gameAuthority = Keypair.fromSecretKey(
    Buffer.from(process.env.GAME_AUTHORITY_SECRET_KEY!, "base64")
  );

  const milestoneSeed = new anchor.BN(milestoneSeedStr);
  const [milestonePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("milestone"),
      campaignPda.toBuffer(),
      milestoneSeed.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );

  try {
    const tx = await program.methods
      .verifyGame(milestoneSeed, achievedLevel)
      .accounts({
        gameAuthority: gameAuthority.publicKey,
        campaignAccount: campaignPda,
        milestoneAccount: milestonePda,
      })
      .signers([gameAuthority])
      .rpc();

    res.json({ success: true, tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

---

## Security Notes

- The `game_authority` keypair should be stored securely (HSM, env secrets) — it is the sole trust anchor for achievement verification.
- If the `game_authority` keypair is compromised, an attacker can verify arbitrary achievements for the milestones it controls.
- Per-milestone authority allows damage isolation: rotating the key requires creating new milestones, not a full protocol upgrade.
- Players **cannot self-report** — only the game authority's signature unlocks `is_verified`.

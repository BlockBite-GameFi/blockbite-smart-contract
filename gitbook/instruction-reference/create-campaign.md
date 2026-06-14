# create\_campaign

Initialize a game reward campaign, deposit the total reward budget into a PDA-controlled escrow.

---

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `title_hash` | `[u8; 32]` | SHA-256 hash of the campaign title/metadata. Full content stored off-chain (IPFS/backend). |
| `total_budget` | `u64` | Total tokens allocated for all milestones in this campaign. Must be > 0. |
| `seed` | `u64` | Unique founder-supplied seed for PDA derivation. |

---

## Required Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `founder` | ✓ | ✓ | Campaign creator; pays rent and deposits budget |
| `mint` | — | — | SPL token mint |
| `founder_token_account` | ✓ | — | Source of `total_budget` tokens |
| `campaign_account` | ✓ | — | PDA: `["campaign", founder, seed_le8]` |
| `campaign_escrow_token_account` | ✓ | — | PDA: `["campaign_escrow", campaign_pda]` |
| `token_program` | — | — | SPL Token Program |
| `system_program` | — | — | Account creation |
| `rent` | — | — | Rent sysvar |

---

## Behavior

1. **Validates** `total_budget > 0`.
2. **Initializes** `CampaignAccount` with `total_budget`, `title_hash`, `allocated_amount = 0`, `milestone_count = 0`.
3. **Creates** `campaign_escrow_token_account` PDA.
4. **Transfers** `total_budget` from founder → campaign escrow.

---

## Error Codes

| Error | Trigger |
|-------|---------|
| `InvalidAmount (6006)` | `total_budget == 0` |

---

## PDA Derivation

```typescript
const [campaignPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("campaign"),
    founder.publicKey.toBuffer(),
    campaignSeed.toArrayLike(Buffer, "le", 8),
  ],
  programId
);

const [campaignEscrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
  programId
);
```

---

## Example Usage

```typescript
import { createHash } from "crypto";

const campaignSeed = new anchor.BN(1);
const titleHash = createHash("sha256").update("Season 1 Campaign").digest();

await program.methods
  .createCampaign(
    [...titleHash],          // [u8; 32]
    new anchor.BN(100_000_000), // 100 tokens budget
    campaignSeed
  )
  .accounts({
    founder: founder.publicKey,
    mint,
    founderTokenAccount: founderAta.address,
    campaignAccount: campaignPda,
    campaignEscrowTokenAccount: campaignEscrowPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .signers([founder])
  .rpc();
```

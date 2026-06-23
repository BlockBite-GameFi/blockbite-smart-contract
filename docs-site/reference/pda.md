# PDA Derivation

All BlockBite accounts are Program Derived Addresses (PDAs). They are computed deterministically off-chain — no RPC call needed before you send a transaction.

**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

---

## Seed Table

| Account | Seeds (in order) | Notes |
|---|---|---|
| `StreamAccount` | `"stream"` · `creator_pubkey (32B)` · `recipient_pubkey (32B)` · `seed_u64_le (8B)` | Unique per creator/recipient/seed triple |
| `EscrowTokenAccount` | `"escrow"` · `stream_pubkey (32B)` | 1-to-1 with stream — derivable from stream PDA alone |
| `CampaignAccount` | `"campaign"` · `founder_pubkey (32B)` · `seed_u64_le (8B)` | Unique per founder/seed pair |
| `CampaignEscrowTokenAccount` | `"campaign_escrow"` · `campaign_pubkey (32B)` | 1-to-1 with campaign |
| `MilestoneAccount` | `"milestone"` · `campaign_pubkey (32B)` · `milestone_seed_u64_le (8B)` | Unique per campaign/milestone_seed pair |

> **Little-endian u64:** Seeds that are `u64` values must be serialised as 8-byte little-endian (`seed.toArrayLike(Buffer, "le", 8)` in Anchor BN).

---

## TypeScript Derivation Helpers

```typescript
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");

// ── Stream PDAs ───────────────────────────────────────────────────────────────
export function deriveStream(
  creator: PublicKey,
  recipient: PublicKey,
  seed: BN
): { streamPda: PublicKey; bump: number } {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stream"),
      creator.toBuffer(),
      recipient.toBuffer(),
      seed.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
  return { streamPda: pda, bump };
}

export function deriveEscrow(streamPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), streamPda.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// ── Campaign PDAs ─────────────────────────────────────────────────────────────
export function deriveCampaign(
  founder: PublicKey,
  seed: BN
): { campaignPda: PublicKey; bump: number } {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("campaign"),
      founder.toBuffer(),
      seed.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
  return { campaignPda: pda, bump };
}

export function deriveCampaignEscrow(campaignPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// ── Milestone PDA ─────────────────────────────────────────────────────────────
export function deriveMilestone(
  campaignPda: PublicKey,
  milestoneSeed: BN
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("milestone"),
      campaignPda.toBuffer(),
      milestoneSeed.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
  return pda;
}
```

---

## Usage Example

```typescript
import { deriveStream, deriveEscrow, deriveCampaign,
         deriveCampaignEscrow, deriveMilestone } from "./pda-helpers";

// Stream
const seed = new BN(Date.now());
const { streamPda } = deriveStream(creator, recipient, seed);
const escrowPda     = deriveEscrow(streamPda);
console.log("Stream:", streamPda.toBase58());
console.log("Escrow:", escrowPda.toBase58());

// Campaign + milestone
const campaignSeed  = new BN(9999);
const { campaignPda } = deriveCampaign(founder, campaignSeed);
const campaignEscrow  = deriveCampaignEscrow(campaignPda);
const milestonePda    = deriveMilestone(campaignPda, new BN(1));
console.log("Campaign:", campaignPda.toBase58());
console.log("Campaign Escrow:", campaignEscrow.toBase58());
console.log("Milestone:", milestonePda.toBase58());
```

---

## Rust Seeds (on-chain, `_dispatch.rs`)

For reference — the seeds used inside the program match the TypeScript helpers above:

```rust
// StreamAccount
seeds = [b"stream", creator.key().as_ref(), recipient.key().as_ref(), &seed.to_le_bytes()]

// EscrowTokenAccount
seeds = [b"escrow", stream.key().as_ref()]

// CampaignAccount
seeds = [b"campaign", founder.key().as_ref(), &seed.to_le_bytes()]

// CampaignEscrowTokenAccount
seeds = [b"campaign_escrow", campaign.key().as_ref()]

// MilestoneAccount
seeds = [b"milestone", campaign.key().as_ref(), &milestone_seed.to_le_bytes()]
```

---

## Why Seeds Are Structured This Way

- **`creator + recipient + seed`** for streams allows the same two parties to create multiple independent streams (different seeds) without collision.
- **`campaign + milestone_seed`** for milestones means one campaign can have up to `u64::MAX` milestones with zero collision.
- **Escrow PDAs derived from their parent** means clients only need to know the stream or campaign PDA to find the associated vault — no extra storage or lookup.

# PDA Seeds

All BlockBite PDAs use **deterministic seeds** so clients can derive addresses without network calls. This page is the authoritative reference for every PDA in the protocol.

---

## Seed Conventions

- All seeds are byte arrays (`&[u8]`)
- Numeric seeds (`u64`) are encoded as **8-byte little-endian** (`seed.to_le_bytes()` in Rust, `.toArrayLike(Buffer, "le", 8)` in TypeScript)
- Public keys are encoded as 32-byte raw bytes (`.toBuffer()` in TypeScript, `.as_ref()` in Rust)
- String prefixes are UTF-8 encoded (`b"stream"` in Rust, `Buffer.from("stream")` in TypeScript)
- All PDAs store their canonical `bump` in the account for use in CPI signer seeds

---

## StreamAccount

**Seeds:** `["stream", creator_pubkey, recipient_pubkey, seed_le8]`

| Seed Component | Type | Encoding |
|---------------|------|---------|
| `"stream"` | string literal | `b"stream"` |
| `creator` | `Pubkey` | 32 raw bytes |
| `recipient` | `Pubkey` | 32 raw bytes |
| `seed` | `u64` | 8-byte little-endian |

```typescript
const [streamPda, streamBump] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    creator.publicKey.toBuffer(),
    recipient.publicKey.toBuffer(),
    seed.toArrayLike(Buffer, "le", 8),
  ],
  BLOCKBITE_PROGRAM_ID
);
```

```rust
// Rust (verification in constraint)
seeds = [
    b"stream",
    creator.key().as_ref(),
    recipient.key().as_ref(),
    &stream.seed.to_le_bytes(),
],
bump = stream.bump
```

---

## EscrowTokenAccount

**Seeds:** `["escrow", stream_pda]`

Derived from the `StreamAccount` PDA — must be derived **after** `StreamAccount`.

| Seed Component | Type | Encoding |
|---------------|------|---------|
| `"escrow"` | string literal | `b"escrow"` |
| `stream_pda` | `Pubkey` | 32 raw bytes |

```typescript
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  BLOCKBITE_PROGRAM_ID
);
```

**Authority:** The `StreamAccount` PDA. Used in CPI signer seeds as:

```rust
let seeds = &[
    b"stream",
    stream.creator.as_ref(),
    stream.recipient.as_ref(),
    &stream.seed.to_le_bytes(),
    &[stream.bump],
];
```

---

## CampaignAccount

**Seeds:** `["campaign", founder_pubkey, seed_le8]`

| Seed Component | Type | Encoding |
|---------------|------|---------|
| `"campaign"` | string literal | `b"campaign"` |
| `founder` | `Pubkey` | 32 raw bytes |
| `seed` | `u64` | 8-byte little-endian |

```typescript
const [campaignPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("campaign"),
    founder.publicKey.toBuffer(),
    campaignSeed.toArrayLike(Buffer, "le", 8),
  ],
  BLOCKBITE_PROGRAM_ID
);
```

---

## CampaignEscrowTokenAccount

**Seeds:** `["campaign_escrow", campaign_pda]`

| Seed Component | Type | Encoding |
|---------------|------|---------|
| `"campaign_escrow"` | string literal | `b"campaign_escrow"` |
| `campaign_pda` | `Pubkey` | 32 raw bytes |

```typescript
const [campaignEscrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
  BLOCKBITE_PROGRAM_ID
);
```

---

## MilestoneAccount

**Seeds:** `["milestone", campaign_pda, milestone_seed_le8]`

| Seed Component | Type | Encoding |
|---------------|------|---------|
| `"milestone"` | string literal | `b"milestone"` |
| `campaign_pda` | `Pubkey` | 32 raw bytes |
| `milestone_seed` | `u64` | 8-byte little-endian |

```typescript
const [milestonePda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("milestone"),
    campaignPda.toBuffer(),
    milestoneSeed.toArrayLike(Buffer, "le", 8),
  ],
  BLOCKBITE_PROGRAM_ID
);
```

---

## Full Derivation Utility

```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");

export const pda = {
  stream: (creator: PublicKey, recipient: PublicKey, seed: anchor.BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), creator.toBuffer(), recipient.toBuffer(),
       seed.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    ),

  escrow: (streamPda: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), streamPda.toBuffer()],
      PROGRAM_ID
    ),

  campaign: (founder: PublicKey, seed: anchor.BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), founder.toBuffer(),
       seed.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    ),

  campaignEscrow: (campaignPda: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
      PROGRAM_ID
    ),

  milestone: (campaignPda: PublicKey, milestoneSeed: anchor.BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), campaignPda.toBuffer(),
       milestoneSeed.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    ),
};

// Usage:
const [streamPda]         = pda.stream(creator, recipient, seed);
const [escrowPda]         = pda.escrow(streamPda);
const [campaignPda]       = pda.campaign(founder, campaignSeed);
const [campaignEscrowPda] = pda.campaignEscrow(campaignPda);
const [milestonePda]      = pda.milestone(campaignPda, milestoneSeed);
```

---

## Common Mistakes

| Mistake | Error | Fix |
|---------|-------|-----|
| Wrong seed order (e.g., recipient before creator) | Account constraint fails (PDA mismatch) | Follow the exact seed ordering above |
| Using `"be"` (big-endian) instead of `"le"` for seed | PDA mismatch | Always use `.toArrayLike(Buffer, "le", 8)` |
| Using `toNumber()` and re-encoding instead of `.toArrayLike` | PDA mismatch for large seeds | Use `anchor.BN.toArrayLike` directly |
| Deriving escrow PDA before stream PDA | Wrong escrow address | Derive `streamPda` first, then `escrowPda` |

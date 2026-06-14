# ADR-005: Hash Commitments for Off-Chain Content

**Status:** Accepted
**Date:** 2025-12

---

## Context

Campaign titles and milestone descriptions are natural-language strings. Storing arbitrary-length strings on-chain has two problems:

1. **Cost** — Solana storage costs ~7 lamports/byte. A 1KB description would cost ~0.007 SOL per milestone, and that cost scales with the number of characters.
2. **Rigid sizing** — Anchor requires accounts to be sized at initialization time (`space = X`). Variable-length strings require worst-case padding or dynamic reallocation.

The information must still be:
- **Tamper-evident** — content linked to the on-chain record cannot be silently changed
- **Discoverable** — clients can retrieve and verify the content
- **Fixed-size** — to keep account sizing predictable

---

## Decision

Store a **32-byte SHA-256 hash** of the content on-chain. The full content is stored off-chain (IPFS, a backend database, or any content-addressable store).

```rust
// In CampaignAccount
pub title_hash: [u8; 32],      // SHA-256 of campaign title/metadata

// In MilestoneAccount
pub description_hash: [u8; 32], // SHA-256 of milestone description
```

Client-side commitment:
```typescript
import { createHash } from "crypto";

const titleHash = createHash("sha256").update("Season 1 — Dragon Quest").digest();
// titleHash is a 32-byte Buffer; pass as [...titleHash] to Anchor
```

Client-side verification:
```typescript
// Retrieve content from off-chain store (IPFS/backend)
const offChainTitle = await fetchFromIPFS(ipfsCid);

// Verify against on-chain hash
const computedHash = createHash("sha256").update(offChainTitle).digest("hex");
const onChainHash  = Buffer.from(campaign.titleHash).toString("hex");

if (computedHash !== onChainHash) {
  throw new Error("Content does not match on-chain commitment! Possible tampering.");
}
```

---

## Alternatives Considered

**Option A: Store content as `String` in account**
- ✓ Simple to read
- ✗ Variable length — requires `realloc` or worst-case padding
- ✗ Cost scales with content size
- ✗ On-chain storage is not the right place for long strings

**Option B: Store content in account as fixed-size array**
- ✓ Fixed size
- ✗ Length limit (e.g., 256 bytes) artificially constrains descriptions
- ✗ Wastes storage for short content

**Option C: IPFS CID on-chain**
- ✓ Content-addressable, similar to hashing
- ✗ CIDv0 is 46 bytes, CIDv1 varies — less predictable than SHA-256 32 bytes
- ✗ Requires clients to have IPFS gateway access; SHA-256 can be verified against any content source

**Option D: SHA-256 hash commitment (chosen)**
- ✓ Fixed 32 bytes — always predictable account size
- ✓ SHA-256 is a cryptographic commitment — content cannot be changed without detection
- ✓ Content can be stored anywhere (IPFS, S3, backend DB) and verified independently
- ✗ Content is not visible directly on-chain — requires off-chain fetch for human-readable details
- ✗ Hash cannot be updated; changing content requires a new campaign (intended as a feature for immutability)

---

## Consequences

- **Positive:** Account sizes are fixed and predictable. `CampaignAccount` is always exactly 90 bytes; `MilestoneAccount` is always 158 bytes.
- **Positive:** Campaign and milestone metadata is tamper-evident. Any block explorer or client can verify that the off-chain content matches the on-chain hash.
- **Positive:** Content can be rich (markdown, JSON, images via IPFS links) without affecting on-chain costs.
- **Negative:** Clients must make an off-chain request to display human-readable campaign/milestone descriptions.
- **Negative:** If the off-chain content store goes down, the hash is unverifiable (but the protocol still functions — rewards can still be claimed).
- **Negative:** Once a campaign is created, its `title_hash` is immutable. Correcting a typo requires creating a new campaign.

# ADR-004: Dual PDA Architecture (State + Escrow)

**Status:** Accepted
**Date:** 2025-12

---

## Context

BlockBite needs to:
1. Store stream metadata (amounts, timestamps, flags)
2. Hold tokens in custody on behalf of the program until they vest

A naive approach would store everything in one account. But SPL token accounts have a fixed structure (165 bytes) defined by the Token Program, and program state accounts have a separate discriminator-prefixed structure. They cannot be merged into a single account type.

This means every stream needs at least two accounts: a state account and a token vault.

---

## Decision

Use a **dual PDA architecture** for both streams and campaigns:

### Stream Pair
- **`StreamAccount`** (state PDA): `["stream", creator, recipient, seed_le8]`
  - Stores all metadata: amounts, timestamps, flags, bump
  - 196 bytes
- **`EscrowTokenAccount`** (token PDA): `["escrow", stream_pda]`
  - A standard SPL token account (165 bytes)
  - Owned by the Token Program; authority is the `StreamAccount` PDA

### Campaign Pair
- **`CampaignAccount`** (state PDA): `["campaign", founder, seed_le8]`
  - Stores budget, milestone count, title hash
  - 90 bytes
- **`CampaignEscrowTokenAccount`** (token PDA): `["campaign_escrow", campaign_pda]`
  - A standard SPL token account
  - Owned by the Token Program; authority is the `CampaignAccount` PDA

### Why the escrow authority is the state PDA

To transfer tokens out of the escrow, the program must sign the CPI with the state PDA's seeds:

```rust
let seeds = &[
    b"stream",
    stream.creator.as_ref(),
    stream.recipient.as_ref(),
    &stream.seed.to_le_bytes(),
    &[stream.bump],
];
let signer_seeds = &[&seeds[..]];

token::transfer_checked(
    CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer { /* ... */ },
        signer_seeds,
    ),
    amount,
    decimals,
)?;
```

This means no external party can drain the escrow — only program instructions can produce the valid signer seeds.

---

## Alternatives Considered

**Option A: Native SOL streams (no SPL token support)**
- ✓ Simpler — one account per stream
- ✗ Only supports SOL, not USDC/BONK/etc.
- ✗ Severely limits protocol utility

**Option B: Token account stored inside the stream account**
- Not possible — SPL token accounts have a fixed 165-byte layout required by the Token Program; they cannot be embedded in Anchor account structs

**Option C: Program-owned token account with arbitrary authority**
- ✓ Could use any pubkey as authority
- ✗ Requires storing the authority keypair somewhere; defeats the purpose of trustless escrow

**Option D: Dual PDA (chosen)**
- ✓ Fully trustless — no authority keypair stored anywhere; program signs with PDA seeds
- ✓ Compatible with any SPL token (USDC, BONK, custom tokens)
- ✓ Anchor has first-class support for this pattern (`init`, `token::authority = stream_account`)
- ✗ Two accounts per stream/campaign — higher rent (~0.004 SOL per stream)
- ✗ Recovered on `close_stream` — rent is not lost permanently

---

## Consequences

- **Positive:** BlockBite works with any SPL token. Teams can stream USDC, project tokens, stablecoins, etc.
- **Positive:** Fund custody is trustless. No admin key, no upgrade authority over the escrow. Only the program's instruction logic can release funds.
- **Positive:** The escrow authority pattern is well-understood in Solana and auditable.
- **Negative:** Two PDAs per stream. At ~0.002 SOL each, creating a stream costs ~0.004 SOL in rent-exemption deposits. This is recovered on `close_stream`.
- **Negative:** Each instruction must pass both PDAs as accounts, adding minor transaction size overhead.

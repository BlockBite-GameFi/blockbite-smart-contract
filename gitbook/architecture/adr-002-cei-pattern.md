# ADR-002: CEI (Checks-Effects-Interactions) Pattern

**Status:** Accepted
**Date:** 2025-12

---

## Context

Solana programs can call other programs via **Cross-Program Invocations (CPIs)**. If a program's state is not updated *before* a CPI, and the called program re-enters the original program (reentrancy), the original program may process the interaction with stale state — allowing an attacker to double-claim tokens.

This is the same class of vulnerability as the infamous Ethereum reentrancy attacks (e.g., The DAO hack). While Solana's account model makes the attack surface different from EVM, CPI-based reentrancy is still possible.

---

## Decision

Every instruction that performs both state mutations and CPIs must follow **CEI order** strictly:

1. **Checks** — validate all preconditions (authorization, amounts, states)
2. **Effects** — mutate all on-chain state (set flags, update counters)
3. **Interactions** — perform CPIs (token transfers, other program calls)

### Example: `withdraw`

```rust
// CHECKS
require!(ctx.accounts.recipient.key() == stream.recipient, BlockBiteError::Unauthorized);
require!(!stream.is_cancelled, BlockBiteError::StreamCancelled);
require!(claimable > 0, BlockBiteError::NothingToWithdraw);

// EFFECTS (state mutation BEFORE CPI)
stream.amount_withdrawn = stream.amount_withdrawn
    .checked_add(claimable)
    .ok_or(BlockBiteError::InvalidAmount)?;

// INTERACTIONS (CPI after state is committed)
token::transfer_checked(cpi_ctx, claimable, mint_decimals)?;
```

### Example: `cancel`

```rust
// EFFECTS (set cancelled flag BEFORE sending tokens)
stream.is_cancelled = true;

// INTERACTIONS
token::transfer_checked(cpi_ctx_recipient, vested_amount, decimals)?;
token::transfer_checked(cpi_ctx_creator, unvested_amount, decimals)?;
```

### Example: `claim_milestone`

```rust
// EFFECTS
milestone.is_claimed = true;  // idempotency guard set BEFORE transfer

// INTERACTIONS
token::transfer_checked(cpi_ctx, milestone.token_amount, decimals)?;
```

---

## Alternatives Considered

**Option A: Effects after Interactions (naive order)**
- Simpler to read
- ✗ Vulnerable to reentrancy: a malicious program in a CPI chain could re-enter `claim_milestone` before `is_claimed` is set, claiming twice
- ✗ Does not follow established Solana security best practices

**Option B: Reentrancy guards (mutex pattern)**
- Common in EVM (OpenZeppelin ReentrancyGuard)
- ✗ Adds complexity and account bloat on Solana
- ✗ Solana programs are not reentrant by default (same program cannot be in CPI stack twice), but CEI is simpler and more robust

**Option C: CEI (chosen)**
- ✓ Industry standard for Solana/EVM contract security
- ✓ Prevents all reentrancy scenarios by ensuring state is committed before CPIs
- ✓ Verified by the Week 7 security audit

---

## Consequences

- **Positive:** All instructions are reentrancy-safe. The security audit (SECURITY_CHECKLIST.md) explicitly verified CEI compliance.
- **Positive:** Code review is simplified — any PR that moves a state mutation after a CPI is an obvious security regression.
- **Negative:** Occasionally requires careful scoping of mutable borrows in Rust. `stream.is_cancelled = true` must be set before calling into Anchor's `CpiContext`, which also borrows from `ctx.accounts`. In practice, this requires scoping `let stream = &mut ctx.accounts.stream_account;` and dropping the borrow before the CPI.
- **Borrow note:** Rust's borrow checker enforces this naturally — attempting to hold a `&mut StreamAccount` while passing accounts to a CPI will fail at compile time. CEI and Rust's ownership model are complementary.

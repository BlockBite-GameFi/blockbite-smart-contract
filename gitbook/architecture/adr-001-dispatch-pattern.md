# ADR-001: Dispatch Pattern (Separation of Anchor Boilerplate)

**Status:** Accepted
**Date:** 2025-12

---

## Context

Anchor programs mix two kinds of code in the same files:

1. **Anchor boilerplate** — `#[derive(Accounts)]` structs, account validation constraints, handler function wrappers. These require the BPF runtime to compile and cannot be unit-tested without spinning up a validator.

2. **Business logic** — the actual computation: unlock calculations, amount splits, validation checks. These are pure functions of their inputs and can be tested with standard `cargo test` in milliseconds.

When these two are mixed together, the business logic becomes untestable without a full Solana validator environment — making the test-feedback loop slow and expensive.

---

## Decision

Split each instruction into **two files**:

- **`_dispatch.rs`** — contains all `#[derive(Accounts)]` structs and thin handler functions that call into the logic layer. This is the Anchor entrypoint; it only runs in BPF context.

- **`<instruction_name>.rs`** — contains the pure business logic as a standalone Rust function (e.g., `init_stream()`, `compute_withdraw()`, `compute_cancel()`). No Anchor macros, no account references — just data in, data out.

The handler in `_dispatch.rs` looks like:

```rust
pub fn handler(ctx: Context<CreateStream>, params: CreateStreamParams) -> Result<()> {
    let stream = &mut ctx.accounts.stream_account;
    init_stream(stream, params)?;
    // ... token transfer CPI ...
    Ok(())
}
```

The pure function in `create_stream.rs` looks like:

```rust
pub fn init_stream(stream: &mut StreamAccount, params: CreateStreamParams) -> Result<()> {
    require!(params.total_amount > 0, BlockBiteError::InvalidAmount);
    require!(params.end_time > params.start_time, BlockBiteError::InvalidTimestamp);
    // ... set fields ...
    Ok(())
}
```

---

## Alternatives Considered

**Option A: Keep all logic in `lib.rs` (monolithic)**
- Simple structure
- ✗ Untestable without a validator
- ✗ Files grow to 1000+ lines as instructions are added

**Option B: One file per instruction with everything mixed**
- Slightly better organization than Option A
- ✗ Still not unit-testable without BPF

**Option C: Dispatch split (chosen)**
- ✓ Pure functions unit-testable with `cargo test` (13 tests run in <1s)
- ✓ Clear separation of concerns
- ✗ Two files per instruction (minor overhead)

---

## Consequences

- **Positive:** All business logic is covered by offline unit tests. The `tests_logic.rs`, `tests_cancel.rs`, `tests_campaign.rs`, and `tests_edge_cases.rs` files run 13+ tests in under 1 second without a validator.
- **Positive:** New developers can read and understand logic without understanding Anchor account constraints.
- **Positive:** Integration tests (`anchor test`) focus on the CPI/account layer, not re-testing business logic.
- **Negative:** Slightly more files. IDEs may require navigation between two files per instruction.
- **Coverage note:** `_dispatch.rs` is excluded from code coverage — it is tested implicitly by the TypeScript integration test suite.

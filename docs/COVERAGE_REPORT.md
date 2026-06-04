# Test Coverage Report — BLOCKBITE TDP (Week 7)

Program: `programs/blockbite-vesting/src/lib.rs`
Program ID: `DvhxiL5PF8Cq3icqcjdbQvtMhJcj6LWheUgovRpaXTFf`
Test suites: `tests/vesting.ts` (34 tests) + `tests/week7-security.ts` (21 tests) = **55 tests**

---

## How coverage is measured (and an honest caveat)

Anchor programs run as SBF bytecode and are exercised by **TypeScript integration
tests against a validator**. Istanbul/`nyc`-style *line* coverage instruments
JS/TS — it cannot instrument SBF, so it does **not** apply to the on-chain handlers.
The industry-standard, meaningful metric for Anchor programs is therefore
**instruction + branch + error-path coverage**, reported below and verifiable by
reading the cited tests.

For the pure vesting math (`StreamAccount::unlocked_amount`) we additionally run
**native `cargo llvm-cov`** (CI job `coverage`, see `.github/workflows/ci.yml`) which
produces a *real* line-coverage number for that module. Unit tests live in
`programs/blockbite-vesting/src/lib.rs` (`mod unit_tests`).

> We deliberately do **not** report a single fabricated ">80% line coverage" figure.
> The numbers below are countable against the source.

---

## 1. Instruction coverage — 7/7 (100%)

| Instruction | Exercised by | Status |
|---|---|---|
| `create_stream` | vesting AC1+AC2, EC1, EC2; week7 INT-1..4 | ✓ |
| `configure_milestones` | week7 INT-3, SEC-5, SEC-6 | ✓ |
| `verify_milestone` | week7 INT-3, SEC-7, SEC-8; vesting T06 | ✓ |
| `withdraw` | vesting AC4, AC5, AC6; week7 INT-1, INT-2, EC-W7-2/3/5 | ✓ |
| `fund_vault` | vesting "W5 fund_vault 70/15/10/5"; week7 SEC-4, SEC-9 | ✓ |
| `update_proof` | vesting "W4 update_proof" ×3; week7 SEC-3 | ✓ |
| `cancel` | vesting W5.5–W5.10, EC4; week7 INT-4, EC-W7-4, SEC-1 | ✓ |

## 2. Error-code coverage — 14/16 directly asserted (87.5%)

| # | Error | Asserted by | Status |
|---|---|---|---|
| 1 | `ZeroAmount` | vesting EC5, week7 EC-W7-1 | ✓ |
| 2 | `InvalidTimeRange` | week7 EC-W7-6 | ✓ |
| 3 | `InvalidCliff` | week7 EC-W7-7 | ✓ |
| 4 | `NothingToWithdraw` | vesting AC6, week7 EC-W7-2 | ✓ |
| 5 | `Unauthorized` | vesting AC7, W5.5; week7 SEC-1, SEC-7 | ✓ |
| 6 | `AlreadyCancelled` | vesting W5.7, W5.10 | ✓ |
| 7 | `FullyVested` | vesting W5.8, week7 EC-W7-4 | ✓ |
| 8 | `MilestoneNotMet` | vesting W5.3 | ✓ |
| 9 | `MilestoneNotVerified` | — (reachable; no dedicated negative test) | ✗ gap |
| 10 | `InvalidMilestoneIndex` | week7 SEC-8 | ✓ |
| 11 | `InvalidMilestonePct` | week7 SEC-6 | ✓ |
| 12 | `MilestoneAlreadyConfigured` | week7 SEC-5 | ✓ |
| 13 | `Overflow` | — (checked-math path verified by SEC-4, but error not forced) | ✗ gap |
| 14 | `VelocityViolation` | vesting T12; week7 SEC-10 | ✓ |
| 15 | `InvalidTier` | vesting EC6, "tier > 2 rejected" | ✓ |
| 16 | `StreamExpired` | week7 SEC-9 | ✓ |

**Known gaps (documented, not hidden):** `MilestoneNotVerified` and `Overflow` are
reachable code paths without a dedicated negative-assertion test. `Overflow` is
guarded by `checked_add`/`checked_mul`/u128 intermediates and is impractical to
trigger on-chain with realistic u64 inputs; the u128 safety is unit-tested
(`no_overflow_with_large_total`). Tracked as follow-ups.

## 3. Required edge cases (Week 7 brief) — 5/5

| Required edge case | Test | Status |
|---|---|---|
| Zero amount stream | vesting EC5, week7 EC-W7-1 | ✓ |
| Withdraw at exactly cliff date | week7 EC-W7-3 | ✓ |
| Cancel at exactly end date | week7 EC-W7-4 | ✓ |
| Double withdraw | week7 EC-W7-5 | ✓ |
| Withdraw with nothing available | vesting AC6, week7 EC-W7-2 | ✓ |

## 4. Security checklist (Week 7 brief) — 5/5

| Requirement | Evidence | Status |
|---|---|---|
| All instructions verify signer authority | `Signer<'info>` on every auth account; week7 SEC-1, SEC-7 | ✓ |
| PDA seeds are unique | seeds `[b"stream", authority, stream_id]`; week7 SEC-2 | ✓ |
| No integer overflow | `checked_*`/u128; week7 SEC-4 + unit `no_overflow_with_large_total` | ✓ |
| Account ownership validated | `token::mint`/`token::authority`/`has_one`; week7 SEC-7 | ✓ |
| No reentrancy | CEI — state written before CPI; week7 SEC-10 | ✓ |

## 5. Pure-math line coverage (native llvm-cov)

`StreamAccount::unlocked_amount` branches covered by `mod unit_tests`:

| Branch | Unit test |
|---|---|
| `now < cliff_ts` → 0 | `nothing_unlocked_before_cliff` |
| `now < start_ts` → 0 | `nothing_unlocked_before_start` |
| `now >= end_ts` → total | `fully_unlocked_at_and_after_end` |
| linear 25/50/99% | `linear_midpoints` |
| cliff boundary (linear-from-start) | `cliff_boundary_counts_from_start_not_cliff` |
| u128 no-overflow | `no_overflow_with_large_total` |

→ All branches of `unlocked_amount` covered. The CI `coverage` job emits the exact
line-% (`cargo llvm-cov --summary-only`, uploaded as the `coverage-summary` artifact).

---

## Summary

- **Instructions:** 7/7 (100%)
- **Error codes:** 14/16 directly asserted (87.5%); 2 documented gaps
- **Required edge cases:** 5/5
- **Security checklist:** 5/5
- **Pure-math branches:** 6/6, line-% generated by CI

Total executable tests: **55** (`tests/vesting.ts` 34 + `tests/week7-security.ts` 21).

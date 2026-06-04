# Week 7 Report — Testing & Security — Vincentius Bryan Kwandou (nayrbryanGaming)

**Team:** BlockBite (Token Distribution Platform) · **Partner:** Raisha Adhila (raishaney)
**Repo:** https://github.com/BlockBite-GameFi/blockbite-smart-contract
**PR (my deliverable):** https://github.com/BlockBite-GameFi/blockbite-smart-contract/pull/4 — *"Week 7 — nayrbryanGaming — Tests + Security"*

---

## What I specifically built this week

I owned the **integration test suite, edge-case tests, and the security review/checklist** for the `blockbite` Anchor program. Concretely (all verifiable by commit author):

- **`3507977`** — wrote `SECURITY_CHECKLIST.md` (signer validation, PDA seed uniqueness, integer-overflow guards, account ownership, reentrancy/CEI, frontrunning) + 8 edge-case integration tests.
- **`deb31c9`** — VGPV (velocity-guard) bot-detection test, hardened for CI clock drift.
- **`3f7924c`** — 7 full-flow + security tests: end-to-end `create_stream → withdraw → verify balances`, MIN_CLAIM_AMOUNT dust guard, PDA seed-collision attack, cross-stream replay attack, integer-overflow verification.
- **`03e65fd`** — rewrote the full-flow test to share a stream account, fixing a `TokenAccountNotFoundError` flake on CI.

These cover the acceptance criteria directly:
- ✅ Full flow: `create_stream → wait → withdraw → verify balance` (`W7: Full flow` test)
- ✅ Zero-amount stream → `InvalidAmount`
- ✅ Withdraw at/around cliff date (`Cliff: before` blocked, `after` unlocks)
- ✅ Cancel at exactly end date → `FullyVested` guard
- ✅ Double withdraw → `NothingToWithdraw`
- ✅ Withdraw with nothing available → `NothingToWithdraw` / `ClaimTooSmall`
- ✅ Security checklist: signer authority, unique PDA seeds (`creator+recipient+seed_le`), checked arithmetic, account ownership via `token::authority`, CEI reentrancy reasoning.

## How my partner and I split the work

- **Me (Bryan):** integration tests (`tests/blockbite.ts`), edge-case tests, security checklist, and CI stabilization of the test runs.
- **Raisha (partner):** the campaign/milestone vesting alignment with acceptance criteria (`6bbc2c7`, `96e6a96`, `760bdf9`), anti-bot/milestone features (`f3193f5`), surfpool test-timing fixes (`2ef47b4`, `4222701`), and **fuzzing + invariant testing** for Week 7. *(Her fuzzing/invariant work is submitted under her own report/PR — it is not part of my deliverable above.)*

## Status — what works / what doesn't

**Works:**
- 27 integration tests on `main` (34 on the PR branch, +7 `W7:`-labeled) + 36 Rust unit tests, passing on surfpool CI.
- Security checklist documents 8 real issues found & fixed during Weeks 5–7 (borrow-checker conflict, double-counted discriminator space, CI gossip panic, wrong `set_milestone` discriminator recomputed via `sha256("global:set_milestone")[..8]`, etc.).

**Doesn't / incomplete:**
- PR #4 is still **OPEN** (not yet merged to `main`); the `W7:`-labeled tests live on the `week7-security-tests` branch.
- No tool-generated coverage report yet — the checklist states an *estimated* >85% line coverage, not a `cargo tarpaulin`/`llvm-cov` artifact.

## Blockers

1. **Coverage report tooling** — KPI asks for a >80% *line-coverage report*. I have an estimate, not a generated artifact. Need to wire `cargo tarpaulin` (or `anchor test` + `llvm-cov`) into CI to produce a real number.
2. **PR merge** — waiting on review to merge #4 into `main`.

## Metrics (counted from source, not estimated where noted)

| Metric | Value | Evidence |
|---|---|---|
| Integration tests (TS) | 27 on main / 34 on PR branch | `tests/blockbite.ts` |
| Rust unit tests | 36 | `tests_campaign.rs` 9, `tests_cancel.rs` 8, `utils.rs` 19 |
| Total tests | 70 (37 unit + 33 integration on PR) | PR #4 checklist summary |
| Security checklist sections | 9 | `SECURITY_CHECKLIST.md` |
| Documented issues found & fixed | 8 | checklist §8 |
| Line coverage | *estimated* >85% (no tool report yet) | checklist §8 — **gap vs KPI** |
| My Week 7 commits | 4 | `3507977`, `deb31c9`, `3f7924c`, `03e65fd` |

## Insight

Most of my "bugs" were not in program logic but in **test determinism on CI**: surfpool's clock drift made timing-based vesting assertions flaky, so I switched to soft assertions + shared-account setup and recomputed the `set_milestone` discriminator by hand when a hardcoded value silently returned `0x65`. The security review's biggest payoff was confirming PDA seeds bind `creator + recipient + seed_le` — that's what blocks the cross-stream replay class from sealevel-attacks. The honest weak spot is coverage: I can claim broad behavioral coverage, but I should ship a generated coverage number before calling the KPI met.

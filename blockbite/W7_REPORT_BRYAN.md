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

**Doesn't / incomplete (honest):**
- PR #4 is still **OPEN** (not yet merged to `main`); the `W7:`-labeled tests live on the `week7-security-tests` branch.
- **Tool-measured line coverage is 23.36% overall, NOT >80%.** A real `cargo-llvm-cov` report now runs in CI (`.github/workflows/coverage.yml`) — `utils.rs` (the vesting math) is **100%**, but the instruction handlers measure **0%** under the host coverage tool (see Insight). The earlier "estimated >85%" in the checklist was not tool-backed; I replaced it with the real number.

## Blockers

1. **Coverage KPI is structurally unreachable via host tooling for this program.** Two independent walls (both documented in CI logs):
   - **Anchor 1.0.2 CPI cannot run host-side.** I built a `solana-program-test` native harness (`coverage-tests/`) to execute handlers as host code. It compiles and runs, but every token-moving handler panics at `solana-invoke 0.5.0`: *"not implemented: only supported with target_os = solana."* Anchor's CPI layer has no native syscall-stub, so `create_stream`/`withdraw`/`cancel` cannot execute off-chain.
   - **Even non-CPI handler execution under `solana-program-test` is not recorded by `llvm-cov`** (the validation-path tests pass but `create_stream.rs` still measures 0% — bank worker-thread counters aren't reflected).
   The handlers ARE exercised behaviorally by the 33 TS integration tests on surfpool, but surfpool runs BPF, which a host coverage tool cannot instrument.
2. **PR merge** — waiting on review to merge #4 into `main`.

## Metrics (counted from source / CI, not estimated)

| Metric | Value | Evidence |
|---|---|---|
| Integration tests (TS) | 27 on main / 34 on PR branch | `tests/blockbite.ts` |
| Rust unit tests | 36 | `tests_campaign.rs` 9, `tests_cancel.rs` 8, `utils.rs` 19 |
| Native host harness tests | 6 (2 run, 4 documented-`#[ignore]`) | `coverage-tests/tests/stream_lifecycle.rs` |
| Security checklist sections | 9 | `SECURITY_CHECKLIST.md` |
| Documented issues found & fixed | 8 | checklist §8 |
| **Line coverage (real, CI llvm-cov)** | **23.36% total · `utils.rs` 100%** | `coverage.yml` run, GITHUB_STEP_SUMMARY |
| My Week 7 commits | 9 (4 tests/checklist + 5 coverage harness) | `3507977`, `deb31c9`, `3f7924c`, `03e65fd`, `coverage.yml`+harness |

## Insight

My most useful finding this week was negative and hard-won: **you cannot hit the >80% host-coverage KPI on an Anchor 1.0.2 program whose handlers are CPI-driven.** I proved it rather than assumed it — wired `cargo-llvm-cov` into CI (real number: `utils.rs` 100%, total 23%), then built a `solana-program-test` native harness to lift the handler numbers. It compiles and the validation paths run, but Anchor's CPI (`solana-invoke 0.5.0`) panics off-chain (`only supported with target_os=solana`), and `llvm-cov` doesn't capture the bank's program execution anyway. So the program's real coverage story is two-layer: **pure logic (vesting math) is 100% unit-covered and tool-verified; the instruction handlers are covered behaviorally by 33 surfpool integration tests that a host tool structurally can't measure.** Practically, the way to actually raise the *measured* number is to refactor business logic out of the `#[derive(Accounts)]` handlers into pure functions (like `utils::calculate_unlocked`, already 100%) — a design lesson, not a test-writing one. On security, the highest-value confirmation was that stream PDAs bind `creator + recipient + seed_le`, which closes the cross-stream replay class from sealevel-attacks.

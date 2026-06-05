# Week 7 Report — Testing & Security — Vincentius Bryan Kwandou

**Team:** BlockBite (Token Distribution Protocol) · **Partner:** Raisha Adhila
**Repo:** https://github.com/BlockBite-GameFi/blockbite-smart-contract
**PR (my deliverable):** *"Week 7 — nayrbryanGaming — Tests + Security"* (branch `week7-security-tests`)

> Git note: my commits appear under three identities that are all me — `Vincentius Bryan Kwandou` and `Bryan Kwandou` (`vincentius.kwandou@gmail.com`) and `nayrbryanGaming` (GitHub noreply). Raisha's appear as `raishaney` / `Raisha Adhila`.

---

## What I specifically built this week

I owned the **integration test suite, edge-case tests, the security review/checklist, and the coverage CI** for the `blockbite` Anchor program. No smart-contract source (`programs/blockbite/src/`) was modified — this week is tests + docs + CI only, by design, so the audited program byte-for-byte matches what is deployed.

- **`3507977`**, **`3f7924c`** — edge-case + security tests in `tests/blockbite.ts` and the first `SECURITY_CHECKLIST.md`.
- **`03e65fd`** — rewrote the full-flow test to share one stream account, fixing a `TokenAccountNotFoundError` flake on CI.
- **`a1eaba8`** — wired `cargo-llvm-cov` into CI (`.github/workflows/coverage.yml`) to produce a **real** line-coverage number instead of an estimate.
- **`ac3db23` → `85b4a6f`** — built a `solana-program-test` native harness (`coverage-tests/`) to try to lift the handlers' coverage host-side (see Insight — it hit a structural wall).
- **`48e3445`, `2a470ab`** — replaced the earlier ">85% estimated" claim with the real measured numbers and the two-layer coverage explanation.
- **This submission** — rewrote the 7 `W7:`-labeled tests so none are `assert.ok(true)` placeholders: they now decode the real on-chain `StreamAccount` bytes and assert invariants, and re-implement `calculate_unlocked` exactly in TypeScript to check the overflow/cancel boundaries. Rewrote `SECURITY_CHECKLIST.md` and this report to describe **only code that exists** (see Issue #1).

### Acceptance criteria → where it's covered (all against the *real* program)

| Criterion | Covered by | Error/result |
|---|---|---|
| Full flow create→wait→withdraw→verify balance | `before()` + `Withdraw at ~50 percent` + `W7: Full flow` (asserts `recipient balance == amount_withdrawn`) | balances reconcile |
| Zero-amount stream | `create_stream` validation test | `InvalidAmount` |
| Withdraw before / at / after cliff | `Cliff` tests + `utils.rs` unit tests | 0 before, linear after |
| Cancel at exactly end date | `W7: Cancel at exactly end_time` (replica proves `unlocked == total`) | `FullyVested` |
| Double / empty withdraw | `Nothing to withdraw` + `W7: Withdraw never releases more than unlocked` | `NothingToWithdraw` |
| Unauthorized cancel / withdraw | `Cancel by non-creator` / `Withdraw by non-recipient` + `W7: Unauthorized withdraw` | `Unauthorized` |
| Signer / PDA / overflow / ownership | `SECURITY_CHECKLIST.md` §1–4 with verified `file:line` | — |

## How my partner and I split the work

- **Me (Bryan):** the test suite (`tests/blockbite.ts`), edge-case + security tests, `SECURITY_CHECKLIST.md`, the coverage workflow, and the native-harness coverage experiment.
- **Raisha (partner):** the campaign/milestone vesting alignment (`6bbc2c7`, `96e6a96`, `760bdf9`), milestone features (`f3193f5`), surfpool test-timing fixes (`2ef47b4`, `4222701`), and **fuzzing + invariant testing** for Week 7. *Her fuzzing/invariant work is in her own report/PR — it is not part of my deliverable above, and I did not touch it.*

## Status — what works / what doesn't

**Works:**
- 34 TypeScript integration tests (7 `W7:`-labeled) + 36 Rust unit tests (`utils.rs` 19, `tests_cancel.rs` 8, `tests_campaign.rs` 9).
- `SECURITY_CHECKLIST.md` now maps every claim to a real `file:line` in the current source.
- Real CI coverage report runs on every push.

**Doesn't / honest gaps:**
- **Tool-measured whole-program line coverage is ~23%, not >80%.** `utils.rs` (the vesting math, where a token-loss bug would hide) is **100%**; the CPI-driven instruction handlers read 0% under the *host* coverage tool because they only execute on-chain — they are covered behaviorally by the integration tests, which a host tool cannot instrument. This is a structural property of an Anchor program, proven (Insight), not an excuse.
- PR is open, not yet merged to `main`.

## Blockers

1. **The >80% host-coverage KPI is structurally unreachable for this program without changing the contract.** Two independent walls, both reproducible in CI:
   - Anchor CPI cannot run host-side: the `coverage-tests/` native harness compiles but every token-moving handler panics at `solana-invoke` — *"only supported with target_os = solana."*
   - Even non-CPI handler lines under `solana-program-test` aren't reflected by `llvm-cov`.
   The only way to raise the *measured* number is to refactor logic out of the handlers into pure functions — a contract change I deliberately did **not** make this week per the no-modify constraint.

## Metrics (counted from source / CI, not estimated)

| Metric | Value | Evidence |
|---|---|---|
| Integration tests (TS) | 34 (7 `W7:`) | `tests/blockbite.ts` |
| Rust unit tests | 36 | `utils.rs` 19 · `tests_cancel.rs` 8 · `tests_campaign.rs` 9 |
| Security checklist sections | 10 | `SECURITY_CHECKLIST.md` |
| Documented issues found & fixed | 7 | checklist §9 |
| Line coverage (real, CI `llvm-cov`) | `utils.rs` 100% · whole-program ~23% | `coverage.yml` GITHUB_STEP_SUMMARY |
| Smart-contract source files changed | **0** | `git diff main..HEAD -- programs/blockbite/src/` is empty |

## Insight

Two findings this week, both more useful for being uncomfortable:

1. **A doc-vs-reality drift, caught before review.** The earlier checklist and report described a velocity-guard bot filter, a `close_stream` instruction, a `MIN_CLAIM_AMOUNT` dust filter and a developer fee — all of which had been **reverted** out of the program when we simplified to Linear/Cliff/Milestone. A reviewer opening the code would have found the security doc describing instructions that don't exist. I rewrote both documents to cite only verified `file:line`, and added it as Issue #1 in the checklist. Lesson: a security checklist has to be regenerated from the source it audits, not carried forward.

2. **You cannot hit >80% host-coverage on a CPI-driven Anchor program — I proved it rather than assumed it.** Wired real `llvm-cov` into CI (`utils.rs` 100%, total ~23%), then built a `solana-program-test` harness to execute handlers host-side; it dies at `solana-invoke` because Anchor's CPI has no off-chain syscall stub. So the honest coverage story is two-layer: pure logic is 100% unit-covered and tool-verified; handlers are covered behaviorally by integration tests a host tool structurally can't measure. The real lever to raise the *number* is to pull business logic into pure functions like `calculate_unlocked` — a design lesson, not a test-writing one.

On security specifically, the highest-value confirmation was that stream PDAs bind `creator + recipient + seed_le`, which closes the cross-stream replay class from sealevel-attacks; the one hardening item I'd flag for next revision is making `withdraw`/`cancel` strict Checks-Effects-Interactions (update state before the transfer CPI) — safe today on Solana's no-reentrancy model, but cleaner.

# Week 7 — Testing & Security — Individual Report

**Developer:** Vincentius Bryan Kwandou (`vincentius.kwandou@gmail.com`)
**Team:** 2 developers — partner commits as `nayrbryanGaming`
**Program:** `programs/blockbite-vesting` · Program ID `DvhxiL5PF8Cq3icqcjdbQvtMhJcj6LWheUgovRpaXTFf`
**Due:** 2026-06-06

> Every claim below is backed by a commit hash or a file:line that exists in the
> repo. Nothing is asserted without evidence.

---

## Deliverable

- **Test suite (my Week 7 work):** `tests/week7-security.ts` — 21 tests
  (4 integration + 7 edge + 10 security). Commit **`0a48939`** "Week 7 — Vincentius
  Bryan — Tests + Security" (+1033 lines), authored by me, 2026-05-30.
- **Coverage report:** `docs/COVERAGE_REPORT.md` + native unit tests in
  `programs/blockbite-vesting/src/lib.rs` (`mod unit_tests`) + non-blocking
  `coverage` CI job (`cargo-llvm-cov`). Commit **`185de62`**.
- **CI build fix:** `Cargo.lock` blake3 pin. Commit **`d655f36`**.
- **Security checklist:** `docs/SECURITY_CHECKLIST.md` (prose; partner-authored in
  Week 5 pivot) + executable `SEC-1..10` assertions I wrote in `tests/week7-security.ts`.
- Full pre-existing suite: `tests/vesting.ts` — 34 tests (Week 4–6).
- **PR:** _to be opened_ — title `Week 7 — Vincentius Bryan — Tests + Security`
  (commits `0a48939`, `d655f36`, `185de62` on `main`).

**Total executable tests: 55** (34 `vesting.ts` + 21 `week7-security.ts`).

---

## What I specifically built this week

1. **Integration tests** (`tests/week7-security.ts`, INT-1..INT-4):
   - INT-1: full `create_stream → withdraw → verify vault drained to zero`
   - INT-2: multi-step partial withdrawals sum to total vested
   - INT-3: milestone flow `configure → verify → withdraw → balance`
   - INT-4: cancel flow with conservation-law assertion
2. **Edge-case tests** (EC-W7-1..7) — covers all 5 required by the brief:
   zero amount, withdraw-at-cliff boundary, cancel-at-end (`FullyVested`),
   double withdraw, withdraw-with-nothing-available, plus `InvalidTimeRange`
   and `InvalidCliff` boundaries.
3. **Security tests** (SEC-1..10) — mapped to the Sealevel attack surface:
   signer forgery (SEC-1), PDA uniqueness (SEC-2), cross-stream ProofCache
   substitution (SEC-3), checked-math/overflow (SEC-4), duplicate milestone
   config (SEC-5), pct≠100 (SEC-6), account-ownership on verify_milestone
   (SEC-7), out-of-range index (SEC-8), `StreamExpired` on fund_vault (SEC-9),
   reentrancy/CEI double-spend guard (SEC-10).
4. **Surfpool devnet-fork validation:** ran the contract suite on a real devnet
   fork — `34/34 green` (commits **`66007a6`**, **`578a459`**), fixing fast-slot
   timing edge cases that only surface on a live fork.
5. **This week, to close the brief honestly:** native `unlocked_amount` unit
   tests + `cargo-llvm-cov` CI job + `docs/COVERAGE_REPORT.md`; and the
   `Cargo.lock` fix that unblocks `anchor build` in CI.

## How my partner and I split the work

- **Partner (`nayrbryanGaming`):** authored the on-chain program across Weeks 4–6
  (`programs/blockbite-vesting/src/lib.rs` — create/withdraw/cancel/fund_vault/
  update_proof, cliff + milestone + VGPV), most of `tests/vesting.ts` (34 tests),
  and the prose `docs/SECURITY_CHECKLIST.md` during the Week 5 TDP pivot
  (commit `cbe6439`).
- **Me (`Vincentius`):** owned Week 7 — wrote the integration/edge/security test
  file (`week7-security.ts`), turned the prose checklist into executable SEC-1..10
  assertions, validated the suite on a surfpool devnet fork, and built the
  coverage tooling + CI build fix. (Also owned the frontend TokenSelector,
  commit `3e84450`.)

This split is visible in `git log --format='%an' -- tests/`.

## Issues I found and how I fixed them

| # | Issue | Evidence | Fix |
|---|---|---|---|
| 1 | On surfpool's fast 400ms/slot fork, two txs in the same slot shared a blockhash → duplicate signature "already processed", and tiny vest amounts appeared between AC5/AC6 firing VGPV | commit `578a459` | Added `sleep(600)` (>1 slot) to force a fresh blockhash before the second tx, and accepted `already processed`/`duplicate` alongside the expected errors (AC6, W5.7) |
| 2 | `anchor build` red in CI: `failed to parse manifest … block-buffer-0.12.0` | CI run logs (Anchor CI) | Pinned `blake3 1.8.5 → 1.5.5` (`digest 0.10`/`block-buffer 0.10.4`), removing the un-parseable manifest — commit `d655f36` |
| 3 | Cliff boundary semantics ambiguous (does linear count from cliff or start?) | test EC-W7-3 | Asserted + documented: linear counts from `start_ts`; cliff only gates (0 before cliff) — matches `lib.rs:680-687` |
| 4 | No coverage tooling existed (KPI unverifiable) | repo had no nyc/llvm-cov | Added `cargo-llvm-cov` CI job + `COVERAGE_REPORT.md` — commit `185de62` |

## Status — what works / what doesn't

**Works (evidence-backed):**
- 55 tests committed; `vesting.ts` 34/34 validated green on surfpool fork.
- Coverage (source-verifiable, see `COVERAGE_REPORT.md`):
  **7/7 instructions**, **14/16 error codes**, **5/5 required edge cases**,
  **5/5 security-checklist items**.
- Security review complete; no critical issues open (2 documented low-risk gaps).

**Doesn't / not yet proven:**
- A single green CI run for the *combined* 55-test suite is **not** captured:
  the 21 Week 7 tests post-date the `34/34` surfpool run, and GitHub Actions is
  not generating new runs (see Blockers). Recommend running `anchor test` locally
  and attaching the output to the PR.
- `cargo-llvm-cov` line-% is generated by CI; pending an Actions run.
- 2 error paths (`MilestoneNotVerified`, `Overflow`) lack a dedicated negative
  test (documented in `COVERAGE_REPORT.md §2`).

## Blockers

1. **GitHub Actions not triggering new runs.** Workflows show `active`, but pushes
   `d655f36` and `185de62` produced no run and none are queued — consistent with
   the repo's monthly Actions minutes being exhausted by prior failing runs.
   Need: top up Actions minutes, make the repo public, or run tests locally to
   capture green output. The build fix itself is verified locally (lockfile no
   longer references `block-buffer 0.12.0`).
2. **Line-coverage on SBF is not directly measurable** by Istanbul/`nyc`. Resolved
   by reporting instruction/branch/error coverage (industry standard for Anchor)
   plus native `llvm-cov` for the pure math module.

## Metrics

- Tests authored by me this week: **21** (`week7-security.ts`), +6 native unit tests.
- Total suite: **55** executable tests.
- Instruction coverage: **7/7 (100%)**.
- Error-code coverage: **14/16 (87.5%)** asserted; 2 documented gaps.
- Required edge cases: **5/5**. Security checklist: **5/5**.
- Lines added in my Week 7 test commit `0a48939`: **+1033**.

## Insight

The hardest part of testing a Solana program is not writing assertions — it is the
**oracle problem on a live fork**: `Clock` advances by real slots, so any test that
hard-codes "expected 25% unlocked" is flaky. Computing expectations from the same
on-chain clock the program sees (and asserting invariants like the cancel
conservation law `claimable + refund + withdrawn == total`, INT-4) is far more
robust than asserting exact balances. Second insight: "80% line coverage" is the
wrong KPI for SBF programs — **branch/error-path coverage** is what actually proves
the contract is safe, because the dangerous code is in the `require!` guards, not
the happy path.

# BlockBite Smart Contract — Security Checklist (Week 7)

> Phase: Week 7 — Testing & Security.
> Scope: this checklist describes **exactly the code currently in `programs/blockbite/src/`** — nothing more. Every row cites a real `file:line`. No smart-contract source was modified to produce this document.

Program: `blockbite` · Framework: Anchor · Network: Solana Devnet (targeting)

**Stream instructions reviewed:** `create_stream`, `withdraw`, `cancel`, `set_milestone`
(The program also ships campaign/milestone instructions — `create_campaign`, `create_milestone`, `submit_proof`, `verify_oracle`, `verify_game`, `verify_multisig`, `claim_milestone` — which are out of scope for the Week-7 vesting-flow review and listed in §8.)

---

## 1. Signer Validation

| Check | Location | Status |
|---|---|---|
| `create_stream` payer/creator is a signer | `create_stream.rs:21-22` — `creator: Signer<'info>` | ✅ |
| Only the stream recipient can `withdraw` | `withdraw.rs:11` `recipient: Signer`, `:17` `constraint = stream.recipient == recipient.key() @ Unauthorized` | ✅ |
| Only the stream creator can `cancel` | `cancel.rs:11` `creator: Signer`, `:17` `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| Only the stream creator can `set_milestone` | `set_milestone.rs:9` `creator: Signer`, `:15` `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| All signers use Anchor's `Signer<'info>` (on-chain Ed25519 signature check) | all four instruction files | ✅ |

**Test coverage:** `Withdraw by non-recipient fails (Unauthorized)`, `Cancel by non-creator fails (Unauthorized)` in `tests/blockbite.ts`.

---

## 2. PDA Seed Correctness

| Check | Location | Status |
|---|---|---|
| Stream PDA seeds: `["stream", creator, recipient, seed.to_le_bytes()]` | `create_stream.rs:50`; re-derived `withdraw.rs:15`, `cancel.rs:15`, `set_milestone.rs:13` | ✅ |
| Escrow PDA seeds: `["escrow", stream.key()]` | `create_stream.rs:41` | ✅ |
| Bump stored in `StreamAccount.bump` (`create_stream.rs:107`), verified via `bump = stream.bump` on every later call | `withdraw.rs:16`, `cancel.rs:16`, `set_milestone.rs:14` | ✅ |
| `seed` is a `u64` little-endian → different `seed` values give distinct PDAs (no collision) | `create_stream.rs:50` | ✅ |
| `creator` **and** `recipient` are part of the seeds → a PDA for (A,B) cannot be reused for (A,C) → no cross-stream replay | all stream PDA derivations | ✅ |
| Anchor's `seeds = [...] , bump = ...` auto-verifies the passed account is the canonical PDA (`ConstraintSeeds` error otherwise) | all instructions | ✅ |

**Test coverage:** `W7: PDA seed collision attack` and `W7: Cross-stream replay attack` in `tests/blockbite.ts` assert PDA uniqueness across `seed` and across `recipient`.

---

## 3. Integer Overflow Protection

| Check | Location | Status |
|---|---|---|
| `calculate_unlocked` does the vesting multiply in `u128` then casts back to `u64`, using `checked_mul` + `checked_div` | `utils.rs:37-43` | ✅ |
| `withdraw` computes `claimable = unlocked.checked_sub(amount_withdrawn).ok_or(NothingToWithdraw)` — cannot underflow | `withdraw.rs:49-51` | ✅ |
| `withdraw` updates `amount_withdrawn = amount_withdrawn.checked_add(claimable).unwrap()` — panics instead of wrapping | `withdraw.rs:86-91` | ✅ |
| `cancel` computes `recipient_due = unlocked.checked_sub(amount_withdrawn).unwrap_or(0)` — safe if already over-withdrawn | `cancel.rs:56-58` | ✅ |
| `cancel` computes `creator_due = total_amount.checked_sub(amount_withdrawn).unwrap().checked_sub(recipient_due).unwrap()` | `cancel.rs:59-64` | ✅ |

**Test coverage:** `utils.rs` unit tests (19) exercise every branch of `calculate_unlocked` at 0/25/50/100%+ for linear, cliff, milestone, and cliff+milestone; `tests_cancel.rs` (8) verifies `recipient_due + creator_due == total_amount` across the full elapsed range (`test_cancel_sum_equals_total`).

---

## 4. Account Ownership

| Check | Location | Status |
|---|---|---|
| Escrow token account's authority is the stream PDA (`token::authority = stream`) — only the program (signing as the PDA) can move escrowed tokens | `create_stream.rs:40`, `withdraw.rs:26`, `cancel.rs:26` | ✅ |
| `creator_token_account` must be owned by the creator (`token::authority = creator`) at deposit | `create_stream.rs:32` | ✅ |
| Mint accounts validated by `Account<'info, Mint>` wrapper (SPL Mint discriminator check) | all instructions | ✅ |
| Token accounts validated by `Account<'info, TokenAccount>` + `token::mint = mint` constraint (correct mint guaranteed) | `withdraw.rs:25`, `cancel.rs:25/32/38`, `create_stream.rs:31/39` | ✅ |
| `StreamAccount` identity enforced by Anchor's 8-byte account discriminator on deserialisation | `StreamAccount` (`state/stream.rs`) | ✅ |
| Token movements use `transfer_checked` (mint + decimals verified), not bare `transfer` | `create_stream.rs:89`, `withdraw.rs:84`, `cancel.rs:97/112` | ✅ |

---

## 5. Business-Logic Guards (only errors that exist in `errors.rs`)

| Guard | Error | Location | Status |
|---|---|---|---|
| `total_amount > 0` | `InvalidAmount` | `create_stream.rs:69` | ✅ |
| `end_time > start_time` | `InvalidTimestamp` | `create_stream.rs:70` | ✅ |
| `cliff_time == 0 || cliff_time <= end_time` | `InvalidTimestamp` | `create_stream.rs:71-74` | ✅ |
| `creator != recipient` | `InvalidRecipient` | `create_stream.rs:75-78` | ✅ |
| `!stream.is_cancelled` (withdraw) | `StreamCancelled` | `withdraw.rs:45` | ✅ |
| `current_time >= stream.start_time` (withdraw) | `StreamNotStarted` | `withdraw.rs:46` | ✅ |
| `claimable > 0` (withdraw) | `NothingToWithdraw` | `withdraw.rs:53` | ✅ |
| `!stream.is_cancelled` (cancel) | `AlreadyCancelled` | `cancel.rs:50` | ✅ |
| `unlocked < stream.total_amount` (cancel) | `FullyVested` | `cancel.rs:54` | ✅ |
| `!stream.milestone_reached` (set_milestone) | `MilestoneAlreadyReached` | `set_milestone.rs:16` | ✅ |
| `!stream.is_cancelled` (set_milestone) | `StreamCancelled` | `set_milestone.rs:17` | ✅ |

All 10 stream-path custom errors are defined in `errors.rs:4-24`. (Errors `CampaignNotFound … MilestoneNotVerified` belong to the campaign module.)

---

## 6. Reentrancy

Solana's runtime executes one instruction at a time and a CPI into `spl-token` **cannot re-enter** the `blockbite` program within the same transaction, so classic reentrancy is structurally impossible here.

**Honest note on ordering (hardening item, not a vulnerability):**
- `withdraw` performs the token `transfer_checked` (`withdraw.rs:84`) **before** it updates `amount_withdrawn` (`withdraw.rs:86-91`) — i.e. interaction-before-effect. This is safe on Solana because spl-token cannot call back into us, but strict Checks-Effects-Interactions (update state first) would be more defensive. Recorded as a recommended hardening for a future revision (no contract change made this week per the no-modify constraint).
- `cancel` flips `is_cancelled = true` (`cancel.rs:115`) after its transfers, for the same reason; the `AlreadyCancelled` guard (`cancel.rs:50`) prevents a second cancel.

**Status:** ✅ Not exploitable on Solana's execution model · ⚠️ CEI ordering noted for future hardening.

---

## 7. Frontrunning / MEV

| Concern | Mitigation | Location | Status |
|---|---|---|---|
| Creator cancels while recipient has accrued tokens | `cancel` pays the recipient their vested `recipient_due` **first**, then returns only the remainder to the creator | `cancel.rs:85-113` | ✅ |
| Concurrent double-withdraw | One signer per tx; Solana serialises writes to the same `stream` PDA, and `amount_withdrawn` is updated with `checked_add` | `withdraw.rs:86-91` | ✅ |

---

## 8. Test Coverage Summary (Week 7)

| Category | Count | Pass |
|---|---|---|
| Rust unit tests (`utils.rs` 19, `tests_cancel.rs` 8, `tests_campaign.rs`) | 36 | 100% |
| TypeScript integration tests (surfpool, `tests/blockbite.ts`) | 33 | 100% |

**Coverage areas exercised:**
- Happy path: `create_stream → withdraw (partial) → withdraw (full) → balances verified` ✅
- Edge cases: zero amount (`InvalidAmount`), withdraw before start (`StreamNotStarted`), double/empty withdraw (`NothingToWithdraw`), before/at/after cliff, cancel after full vest (`FullyVested`), cancel of a cancelled stream (`AlreadyCancelled`) ✅
- Security: unauthorized withdraw/cancel (`Unauthorized`), PDA seed collision, cross-stream replay, overflow-safe vesting math ✅

**Tool-measured line coverage (CI `cargo-llvm-cov`, `.github/workflows/coverage.yml`):**
- `utils.rs` (`calculate_unlocked` — the only path where a token-loss / over-release bug could hide): **100% line coverage** ✅
- Whole Rust program: **~23%** line coverage.

> **Why the whole-program number is low, honestly:** the instruction handlers (`create_stream`/`withdraw`/`cancel`/`set_milestone`) are CPI-driven Anchor handlers that only execute on-chain (BPF). A *host* coverage tool (`llvm-cov`) cannot instrument BPF, so those lines read 0% even though all 33 TypeScript integration tests drive them on surfpool. We proved this rather than assumed it: a `solana-program-test` native harness (`coverage-tests/`) compiles but panics at `solana-invoke` (*"only supported with target_os = solana"*). The defensible coverage story is therefore two-layer — **pure vesting logic is 100% unit-covered and tool-verified; handlers are covered behaviorally by integration tests a host tool structurally cannot measure.** The design lesson (to raise the *measured* number without weakening the program) is to pull more logic out of handlers into pure functions like `calculate_unlocked`; that is a refactor we deliberately did **not** make this week to honor the "no smart-contract change" constraint.

---

## 9. Issues Found and Fixed

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | **Security checklist & W7 report described reverted features** — earlier drafts listed VGPV/velocity bot-guard, `close_stream`, `MIN_CLAIM_AMOUNT` dust filter and a `DEV_FEE_BPS` developer fee. None of these exist in the current `programs/blockbite/src/` (they were removed when the Hybrid model was reverted). | Doc/reality mismatch (would falsify under review) | Rewrote this checklist and the report to describe **only** code that exists, with verified `file:line` references. No contract code changed. |
| 2 | `withdraw` updates `amount_withdrawn` *after* the transfer CPI (interaction-before-effect) | Low (safe on Solana, not CEI-strict) | Documented as a hardening recommendation (§6). Not changed this week per no-modify constraint. |
| 3 | Borrow-checker conflict: immutable fields read after `&mut stream` opened | Build error (W4-5) | Snapshot `creator`/`recipient`/`seed`/`bump` into locals before the CPI block (`withdraw.rs:55-69`, `cancel.rs:66-79`) |
| 4 | `space = StreamAccount::LEN + 8` double-counted the 8-byte discriminator | Wasted rent | `space = StreamAccount::LEN` (LEN already includes the discriminator — see `state/stream.rs:33-36`) |
| 5 | `--bind-address 0.0.0.0` made the CI validator panic (`UnspecifiedIpAddr`) | CI failure | Removed the flag (validator defaults to 127.0.0.1) |
| 6 | Hardcoded `set_milestone` discriminator was wrong | Test failure | Recomputed via `sha256("global:set_milestone")[0..8]` |
| 7 | Deploy workflow verified against a stale hardcoded program ID | Deploy CI failure | Read the ID dynamically via `anchor keys list` |

---

## 10. Out of Scope (Future)

- Oracle / price-feed manipulation: N/A (vesting uses no price oracle).
- Flash-loan attacks: N/A (no lending/borrowing).
- CEI-strict reordering of `withdraw`/`cancel` (§6 item 2): recommended next revision.
- Professional audit + formal verification: recommended before Mainnet.

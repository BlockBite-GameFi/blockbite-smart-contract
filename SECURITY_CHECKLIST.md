# BlockBite Smart Contract — Security Checklist

Program: `blockbite` · Framework: Anchor 1.0.0 · Network: Solana Devnet

---

## Instruction surface (9 instructions)

| Instruction | Module | Authority |
|---|---|---|
| `create_stream` | Stream Vesting | creator (signer) |
| `withdraw` | Stream Vesting | recipient (signer) |
| `cancel` | Stream Vesting | creator (signer) |
| `set_milestone` | Stream Vesting | creator (signer) |
| `close_stream` | Stream Vesting | creator (signer) |
| `create_campaign` | Campaign & Milestone | founder (signer) |
| `create_milestone` | Campaign & Milestone | founder (signer) |
| `submit_proof` | Campaign & Milestone | recipient (signer) |
| `verify_game` | Campaign & Milestone | anyone (no signer required; only game_program key is checked) |
| `claim_milestone` | Campaign & Milestone | recipient (signer) |

---

## 1. Signer Validation

| Check | Location | Status |
|---|---|---|
| Only stream creator can call `cancel` | `_dispatch.rs:Cancel` — `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| Only stream creator can call `set_milestone` | `_dispatch.rs:SetMilestone` — `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| Only stream recipient can call `withdraw` | `_dispatch.rs:Withdraw` — `constraint = stream.recipient == recipient.key() @ Unauthorized` | ✅ |
| Only stream creator can call `close_stream` | `_dispatch.rs:CloseStream` — `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| Only campaign founder can call `create_campaign` | `_dispatch.rs:CreateCampaign` — `founder: Signer<'info>` | ✅ |
| Only campaign founder can call `create_milestone` | `_dispatch.rs:CreateMilestone` — `constraint = campaign.founder == founder.key() @ Unauthorized` | ✅ |
| Only milestone recipient can call `submit_proof` | `_dispatch.rs:SubmitProof` — `constraint = milestone.recipient == recipient.key() @ Unauthorized` | ✅ |
| Only milestone recipient can call `claim_milestone` | `_dispatch.rs:ClaimMilestone` — `constraint = milestone.recipient == recipient.key() @ Unauthorized` | ✅ |
| `verify_game` requires no signer (anyone can submit game results) | `_dispatch.rs:VerifyGame` — no `Signer` account; only `game_program.key()` is compared | ✅ |
| All required signers use Anchor's `Signer<'info>` (on-chain key check) | All instructions | ✅ |

**Test coverage:** "Withdraw by non-recipient fails" (`tests/blockbite.ts:362`), "Cancel by non-creator fails" (`tests/blockbite.ts:437`), "set_milestone by non-creator fails" (`tests/blockbite.ts:1039`)

---

## 2. PDA Seed Correctness

### Stream PDAs

| PDA | Seeds | Locations |
|---|---|---|
| `StreamAccount` | `["stream", creator, recipient, seed_le_bytes]` | `_dispatch.rs:CreateStream`, `Withdraw`, `Cancel`, `SetMilestone`, `CloseStream` |
| `EscrowTokenAccount` | `["escrow", stream_key]` | `_dispatch.rs:CreateStream`, `CloseStream` |

### Campaign PDAs

| PDA | Seeds | Locations |
|---|---|---|
| `CampaignAccount` | `["campaign", founder, seed_le_bytes]` | `_dispatch.rs:CreateCampaign`, `CreateMilestone`, `ClaimMilestone` |
| `CampaignEscrow` | `["campaign_escrow", campaign_key]` | `_dispatch.rs:CreateCampaign`, `ClaimMilestone` |
| `MilestoneAccount` | `["milestone", campaign_key, seed_le_bytes]` | `_dispatch.rs:CreateMilestone`, `SubmitProof`, `VerifyGame`, `ClaimMilestone` |

### Properties

- ✅ All PDA seeds are unique (no two PDA types share a seed prefix or a derivation path)
- ✅ `seed_le_bytes` is little-endian `u64` — prevents seed collision across different `seed` values
- ✅ `creator`/`recipient`/`founder` pubkeys are part of the seed — prevents cross-stream/cross-campaign replay
- ✅ Bump is stored in the account (`bump: u8`) and verified on every instruction via `bump = account.bump`
- ✅ Anchor's `seeds` + `bump` constraint auto-verifies the PDA on every call (raises `ConstraintSeeds` on mismatch)
- ✅ `submit_proof` and `verify_game` correctly include the `milestone` PDA's `campaign` parent account as an extra seed, preventing proofs being submitted for arbitrary accounts

---

## 3. Integer Overflow Protection

| Site | Pattern | Location |
|---|---|---|
| `calculate_unlocked` | `u128` intermediate for `total_amount × elapsed / duration` | `utils.rs:37-39` |
| `init_milestone` budget check | `checked_add(token_amount)` | `create_milestone.rs:26` |
| `compute_withdraw` | `checked_sub` (claimable) + `checked_add` (amount_withdrawn) | `withdraw.rs:19, 25` |
| `compute_cancel` | `checked_sub` × 3 (recipient_due, creator_due) | `cancel.rs:27, 31, 33` |
| `campaign.milestone_count` | `saturating_add(1)` — can never wrap on `u64` | `create_milestone.rs:65` |

No raw `+`/`-`/`*` operators in any business-logic path.

---

## 4. Account Ownership

| Check | Mechanism | Status |
|---|---|---|
| Escrow token account owned by the stream PDA | `token::authority = stream` + `seeds = [b"escrow", stream.key()]` | ✅ |
| Campaign escrow owned by the campaign PDA | `token::authority = campaign` + `seeds = [b"campaign_escrow", campaign.key()]` | ✅ |
| Mint account validated by SPL discriminator | `Box<Account<'info, Mint>>` on every instruction | ✅ |
| Token accounts validated by mint | `token::mint = mint` constraint on every TokenAccount param | ✅ |
| Stream/Campaign/Milestone state accounts | `Box<Account<'info, T>>` (Anchor's 8-byte discriminator + deserialise) | ✅ |
| `UncheckedAccount<'info>` usage | Only for `recipient` (stored as pubkey), `campaign` (PDA seed only), `game_program` (key comparison only) — all explicitly documented with `/// CHECK` | ✅ |

---

## 5. Business Logic Guards

| Guard | Error | Location |
|---|---|---|
| `total_amount > 0` | `InvalidAmount` | `create_stream.rs:75` |
| `end_time > start_time` | `InvalidTimestamp` | `create_stream.rs:76` |
| `cliff_time == 0 || cliff_time <= end_time` | `InvalidTimestamp` | `create_stream.rs:77-80` |
| `creator != recipient` | `InvalidRecipient` | `create_stream.rs:81-84` |
| `!stream.is_cancelled` (withdraw, cancel, set_milestone) | `StreamCancelled` / `AlreadyCancelled` | `withdraw.rs:43`, `cancel.rs:57`, `set_milestone` constraint |
| `current_time >= stream.start_time` (withdraw) | `StreamNotStarted` | `withdraw.rs:44` |
| `unlocked < stream.total_amount` (cancel) | `FullyVested` | `cancel.rs:60` |
| `claimable > 0` (withdraw) | `NothingToWithdraw` | `withdraw.rs:50` |
| `stream.is_cancelled \|\| amount_withdrawn == total_amount` before close | `StreamNotSettled` | `close_stream.rs:48-53` |
| `!stream.milestone_reached` (set_milestone) | `MilestoneAlreadyReached` | `set_milestone` constraint |
| `token_amount > 0` (init_milestone) | `InvalidAmount` | `create_milestone.rs:45` |
| `total_budget > 0` (init_campaign) | `InvalidAmount` | `create_campaign.rs:54` |
| `allocated + token_amount <= total_budget` | `InsufficientBudget` | `create_milestone.rs:47-51` |
| `!milestone.is_verified` (submit_proof, verify_game) | `MilestoneAlreadyVerified` | `_dispatch.rs:SubmitProof`, `VerifyGame` |
| `!milestone.proof_submitted` (submit_proof) | `AlreadySubmitted` | `_dispatch.rs:SubmitProof` |
| `milestone.game_program_id == game_program` (verify_game) | `InvalidGameProgram` | `verify_game.rs:38-40` |
| `milestone.proof_hash == session_result_hash` (verify_game) | `InvalidProof` | `verify_game.rs:42-44` |
| `milestone.is_verified` (claim_milestone) | `MilestoneNotVerified` | `_dispatch.rs:ClaimMilestone` |
| `!milestone.is_claimed` (claim_milestone) | `AlreadyClaimed` | `_dispatch.rs:ClaimMilestone` |

---

## 6. Reentrancy

Solana's execution model is single-threaded per transaction — no other instruction can observe mid-transaction state. Anchor enforces **Checks → Effects → Interactions** (CEI):

- All pure business-logic functions (`init_stream`, `compute_withdraw`, `compute_cancel`, `set_milestone_reached`, `init_campaign`, `init_milestone`, `submit_proof_impl`, `verify_game_impl`, `mark_milestone_claimed`, `validate_closeable`) update state and return a value **before** any handler performs a CPI call.
- The `is_cancelled` flag (in `compute_cancel`) and `is_claimed` flag (in `mark_milestone_claimed`) are flipped **before** the `token::transfer_checked` CPI — even if the CPI were to invoke a malicious program that re-entered the instruction (it cannot, but defense-in-depth), the state already reflects the new value.
- All `&mut` borrows of state accounts are scoped to the pure function and released before the CPI plumbing in the handler.

**Status:** ✅ Not vulnerable.

---

## 7. Frontrunning / MEV

| Concern | Mitigation | Status |
|---|---|---|
| Recipient front-runs cancel | `compute_cancel` sends the vested portion to the recipient before returning the remainder to the creator (`cancel.rs:62-70`) | ✅ |
| Concurrent withdraws on same stream | Solana serialises writes to the same account within a slot; `compute_withdraw` updates `amount_withdrawn` before CPI, so a concurrent second withdraw would observe the new total and compute `claimable = 0` (rejected with `NothingToWithdraw`) | ✅ |
| `submit_proof` griefing | `proof_submitted` guard prevents the recipient from overwriting `proof_hash` after the first submission, even if the creator hasn't yet called `verify_game` | ✅ |
| `claim_milestone` double-spend | `is_claimed` guard makes a second `claim_milestone` call fail with `AlreadyClaimed` regardless of CPI outcome | ✅ |

---

## 8. Issues Found and Fixed

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | Borrow checker conflict: immutable fields read after `&mut stream` open | Build error | Snapshot fields into local vars before the mutable block |
| 2 | `space = StreamAccount::LEN + 8` double-counted discriminator | Account too large (wastes rent) | Changed to `space = StreamAccount::LEN` (LEN already includes 8-byte prefix) |
| 3 | CI `--bind-address 0.0.0.0` caused `UnspecifiedIpAddr` panic in gossip layer | CI failure | Removed flag; validator defaults to 127.0.0.1 |
| 4 | Missing `mkdir -p .anchor` before validator start in CI | CI failure | Added `mkdir -p .anchor` step |
| 5 | Hardcoded `set_milestone` discriminator was wrong (copied from wrong hash) | Test failure (0x65) | Recomputed via `sha256("global:set_milestone")[0..8]` → `[174,213,91,82,156,42,105,3]` |
| 6 | Deployer had 0 SOL in ephemeral CI keypair | Deploy failure | Added `solana airdrop 100` before `anchor deploy` |
| 7 | `ANCHOR_PROVIDER_URL` not set for `ts-mocha` outside `anchor test` | Runtime panic | Added `ANCHOR_PROVIDER_URL` + `ANCHOR_WALLET` to CI env |
| 8 | Deploy workflow verify step used stale hardcoded program ID | Deploy CI failure | Changed verify step to read ID dynamically via `anchor keys list` |
| 9 | **`claim_milestone` had no idempotency guard** — `is_verified` stays `true` after a successful claim, so a recipient could call `claim_milestone` repeatedly to drain the campaign escrow | **Critical** | Added `is_claimed: bool` field to `MilestoneAccount` (LEN 179 → 180) + new `AlreadyClaimed` error code + constraint `!milestone.is_claimed @ AlreadyClaimed` on the `ClaimMilestone` Account struct. State flip happens **before** the CPI in `mark_milestone_claimed` (CEI). Test: `test_milestone_claim_idempotency_guard` (`tests_edge_cases.rs:73-92`) |
| 10 | **`submit_proof` had no idempotency guard** — a recipient could resubmit a new `proof_hash` right before `verify_game` runs, changing what the verifier sees | **High** | Added `proof_submitted: bool` field to `MilestoneAccount` (LEN 180) + new `AlreadySubmitted` error code + constraint `!milestone.proof_submitted @ AlreadySubmitted` on `SubmitProof`. Test: `test_milestone_proof_immutability_guard` (`tests_edge_cases.rs:107-138`) |
| 11 | **`withdraw` / `cancel` mutated state mid-handler** while performing CPIs, blurring the CEI boundary | Low | Extracted pure functions `compute_withdraw` (`withdraw.rs:42-57`) and `compute_cancel` (`cancel.rs:56-76`) that take `&mut StreamAccount` and return a value; the handler now does state mutation first, snapshot the fields needed for the CPI, then performs `token::transfer_checked`. |
| 12 | **`submit_proof` / `verify_game` had no PDA `seeds` constraint** — anyone could submit a proof for any account by passing it as the `milestone` parameter | **High** | Added `#[instruction(milestone_seed: u64)]` + a `campaign: UncheckedAccount<'info>` field to both account structs, with `seeds = [b"milestone", campaign.key().as_ref(), &milestone_seed.to_le_bytes()]` on the `milestone` field. The handler now requires the canonical campaign + seed pair, so the account must be the actual PDA. |

---

## 9. Test Coverage

Measured with `cargo-llvm-cov` (Rust 1.89 stable; `#[coverage(off)]` is nightly-only so file-level exclusion is used instead).

| Report | Line | Function | Region | Excluded |
|---|---|---|---|---|
| `make coverage` (default) | 93.05% | 91.38% | 94.66% | `instructions/_dispatch.rs` |
| `make coverage-strict` | 99.41% | 100% | 98.35% | `instructions/_dispatch.rs` + `lib.rs` |

**Why `_dispatch.rs` is excluded**: it holds the `#[derive(Accounts)]` Account structs and the `*_handler` functions that wire them into Anchor CPIs. None of that code is reachable from `cargo test` — it only runs inside the BPF VM at runtime. The pure business logic lives in the per-instruction files as `pub fn init_stream`, `compute_withdraw`, etc. and is fully unit-tested in `tests_logic.rs` / `tests_campaign.rs` / `tests_edge_cases.rs` / `tests_cancel.rs`. The 28/28 TypeScript integration tests cover the BPF dispatch end-to-end on a real validator.

| Test suite | Count |
|---|---|
| Rust unit tests (`cargo test --lib`) | 83 |
| TypeScript integration tests (`anchor test`) | 28 |
| **Total** | **111** |

---

## 10. Out of Scope (Future)

- **Oracle / price feed manipulation**: N/A — no price oracle is used.
- **Flash loan attacks**: N/A — no lending or borrowing.
- **Formal verification**: recommended before Mainnet launch.
- **Professional audit**: planned pre-Mainnet (noted in README).

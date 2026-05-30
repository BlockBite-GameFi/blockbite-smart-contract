# BlockBite Smart Contract — Security Checklist (Week 7)

> Last updated: Week 7 — Testing & Security phase. All checks cover the deployed devnet program `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`.

Program: `blockbite` · Framework: Anchor 0.32.1 · Network: Solana Devnet (targeting)

---

## 1. Signer Validation

| Check | Location | Status |
|---|---|---|
| Only the stream creator can call `cancel` | `cancel.rs:18` — `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| Only the stream creator can call `set_milestone` | `set_milestone.rs:15` — `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| Only the stream recipient can call `withdraw` | `withdraw.rs:18` — `constraint = stream.recipient == recipient.key() @ Unauthorized` | ✅ |
| Only the stream creator can call `close_stream` | `close_stream.rs:17` — `constraint = stream.creator == creator.key() @ Unauthorized` | ✅ |
| All signers use Anchor's `Signer<'info>` constraint (on-chain key check) | All instruction files | ✅ |

**Test coverage:** "Withdraw by non-recipient fails", "Cancel by non-creator fails", "set_milestone by non-creator fails", "close_stream by non-creator fails"

---

## 2. PDA Seed Correctness

| Check | Location | Status |
|---|---|---|
| Stream PDA seeds: `["stream", creator, recipient, seed_le]` | `create_stream.rs:52`, `withdraw.rs:14–16`, `cancel.rs:14–16`, `set_milestone.rs:12–14` | ✅ |
| Escrow PDA seeds: `["escrow", stream_key]` | `create_stream.rs:43` | ✅ |
| Bump stored in `StreamAccount.bump`, verified on every instruction | `withdraw.rs:17`, `cancel.rs:17` | ✅ |
| Seed includes `u64` in little-endian — prevents seed collision across different `seed` values | `create_stream.rs:52` | ✅ |
| `creator` and `recipient` are part of PDA seeds — prevents cross-stream replay | All PDA derivations | ✅ |
| Anchor's `seeds` + `bump` constraint auto-verifies the PDA on every call (ConstraintSeeds error if wrong) | All instructions | ✅ |

---

## 3. Integer Overflow Protection

| Check | Location | Status |
|---|---|---|
| `calculate_unlocked`: all arithmetic uses `u128` intermediate, then cast back to `u64` — prevents multiplication overflow | `utils.rs:17–23`, `39–44` | ✅ |
| `amount_withdrawn.checked_add(claimable)` — panics cleanly instead of wrapping | `withdraw.rs:124–129` | ✅ |
| `dev_fee = total_amount.checked_mul(DEV_FEE_BPS).unwrap().checked_div(10_000)` | `create_stream.rs:95–99` | ✅ |
| `recipient_due.checked_sub(stream.amount_withdrawn).unwrap_or(0)` — safe if already withdrawn | `cancel.rs:58` | ✅ |
| `velocity_strikes.saturating_add(1)` — can never wrap on `u8` | `withdraw.rs:88` | ✅ |
| `elapsed = current_time.checked_sub(s.last_action_ts).unwrap_or(i64::MAX)` — handles clock skew | `withdraw.rs:80–82` | ✅ |

---

## 4. Account Ownership

| Check | Location | Status |
|---|---|---|
| Escrow token account owned by the stream PDA (`token::authority = stream`) — prevents unauthorized draining | `withdraw.rs:27–29`, `create_stream.rs:46–48` | ✅ |
| Mint account validated by Anchor's `Account<'info, Mint>` wrapper — guarantees SPL Mint discriminator | All instructions | ✅ |
| Token accounts validated by `Account<'info, TokenAccount>` + `token::mint = mint` constraint — ensures correct mint | All token account params | ✅ |
| Stream account ownership verified implicitly by Anchor's discriminator check (8-byte prefix) | `StreamAccount` deserialisation | ✅ |
| Developer token account constrained to same mint as stream (`token::mint = mint`) | `create_stream.rs:60–63` | ✅ |

---

## 5. Business Logic Guards

| Guard | Error | Status |
|---|---|---|
| `total_amount > 0` | `InvalidAmount` | ✅ |
| `end_time > start_time` | `InvalidTimestamp` | ✅ |
| `cliff_time == 0 || cliff_time <= end_time` | `InvalidTimestamp` | ✅ |
| `creator != recipient` | `InvalidRecipient` | ✅ |
| `!stream.is_cancelled` (withdraw, cancel, set_milestone) | `StreamCancelled` / `AlreadyCancelled` | ✅ |
| `current_time >= stream.start_time` (withdraw) | `StreamNotStarted` | ✅ |
| `unlocked < stream.total_amount` (cancel) | `FullyVested` | ✅ |
| `claimable > 0` (withdraw) | `NothingToWithdraw` | ✅ |
| `claimable >= MIN_CLAIM_AMOUNT` (withdraw, dust filter) | `ClaimTooSmall` | ✅ |
| `cliff_time` reached before `set_milestone` | `CliffNotReached` | ✅ |
| `!stream.milestone_reached` (set_milestone) | `MilestoneAlreadyReached` | ✅ |
| `velocity_strikes < MAX_VELOCITY_STRIKES` (VGPV) | `BotDetected` | ✅ |
| `stream.is_cancelled || stream.amount_withdrawn == stream.total_amount` before close | `StreamNotCloseable` | ✅ |

---

## 6. Reentrancy

Solana's execution model is single-threaded per transaction. Anchor enforces **Checks → Effects → Interactions** (CEI) pattern:
- State updates (`stream.amount_withdrawn`, `stream.is_cancelled`, VGPV fields) happen before or simultaneously with CPI calls via Anchor's `CpiContext` — no intermediate external calls can observe stale state.
- All mutable borrows are scoped (`{ let s = &mut ctx.accounts.stream; ... }`) to prevent Rust borrow checker conflicts that could indicate CEI violations.

**Status:** ✅ Not vulnerable

---

## 7. Frontrunning / MEV

| Concern | Mitigation | Status |
|---|---|---|
| Recipient front-running cancel: if creator cancels while recipient has accrued tokens, recipient gets their vested portion | `cancel.rs:53–97` — vested amount sent to recipient before remainder to creator | ✅ |
| Double-spend across multiple concurrent withdrawals | One signer per transaction; Solana serialises writes to the same account (same `streamPda`) | ✅ |

---

## 8. Test Coverage Summary (Week 7)

| Category | Tests | Pass Rate |
|---|---|---|
| Rust unit tests | 37 | 100% |
| Integration tests (surfpool) | 33 | 100% |
| **Total** | **70** | **100%** |

**Coverage areas:**
- Happy path: create → partial withdraw → full withdraw → balance verified ✅
- Edge cases: zero amount, double withdraw, below cliff, at cliff, past end, cancelled stream ✅
- Security: unauthorized signer, PDA collision, cross-stream replay, integer overflow ✅
- Error codes: all 11 custom errors triggered and verified ✅

**Estimated line coverage: >85%** (all instruction handlers + calculate_unlocked + VGPV logic covered)

---

## 9. Issues Found and Fixed (Weeks 5–7)

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | Borrow checker conflict: immutable fields read after `&mut stream` open | Build error | Snapshot `creator`, `recipient`, `seed`, `bump` into local vars before mutable block |
| 2 | `space = StreamAccount::LEN + 8` double-counted discriminator | Account too large (wastes rent) | Changed to `space = StreamAccount::LEN` (LEN already includes 8-byte prefix) |
| 3 | `--bind-address 0.0.0.0` in CI caused `UnspecifiedIpAddr` panic in gossip layer | CI failure | Removed flag; validator defaults to 127.0.0.1 |
| 4 | Missing `mkdir -p .anchor` before validator start in CI | CI failure | Added `mkdir -p .anchor` step |
| 5 | Hardcoded `set_milestone` discriminator was wrong (copied from wrong hash) | Test failure (0x65) | Recomputed via `sha256("global:set_milestone")[0..8]` → `[174,213,91,82,156,42,105,3]` |
| 6 | Deployer had 0 SOL in ephemeral CI keypair | Deploy failure | Added `solana airdrop 100` before `anchor deploy` |
| 7 | `ANCHOR_PROVIDER_URL` not set for `ts-mocha` outside `anchor test` | Runtime panic | Added `ANCHOR_PROVIDER_URL` + `ANCHOR_WALLET` to CI env |
| 8 | Deploy workflow verify step used stale hardcoded program ID | Deploy CI failure | Changed verify step to read ID dynamically via `anchor keys list` |

---

## 9. Out of Scope (Future)

- Oracle / price feed manipulation: N/A (no price oracle used)
- Flash loan attacks: N/A (no lending/borrowing)
- Formal verification: recommended before Mainnet launch
- Professional audit: planned pre-Mainnet (noted in FAQ)

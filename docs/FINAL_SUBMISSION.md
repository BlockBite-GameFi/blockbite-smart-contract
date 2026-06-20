# BlockBite Smart Contract — Final Submission (Week 10)

**Date:** 2026-06-20  
**Team:** nayrbryanGaming  
**Program ID:** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Network:** Solana Devnet  
**Repository:** https://github.com/BlockBite-GameFi/blockbite-smart-contract  
**Framework:** Anchor 1.0.0 / Solana 2.3.0+

---

## Project Summary

BlockBite is a **token distribution platform** smart contract on Solana. It enables trustless, time-locked token distribution with linear, cliff, and milestone-based vesting — designed for team vesting, investor schedules, and DAO contributor grants.

### Core Value Proposition

| Problem | Solution |
|---|---|
| Game studios can't enforce vesting schedules without custodians | On-chain streams — non-custodial, creator-defined timelines |
| Bot farming drains reward pools instantly | MIN_CLAIM_AMOUNT dust filter + future VGPV (constants reserved) |
| Dust transactions clog reward escrows | MIN_CLAIM_AMOUNT filter prevents sub-threshold withdrawals |
| Cancelled / spent stream accounts waste on-chain rent forever | `close_stream` reclaims both stream + escrow account rent |

---

## Architecture

```
Creator ──► create_stream ──► StreamAccount (PDA)
                                   │
                              escrow_token_account (PDA)
                                   │
Recipient ◄── withdraw ◄──────────┘
Creator   ◄── cancel ◄────────────┘
Creator   ──► set_milestone ──► StreamAccount (is_milestone_reached = true)
Creator   ──► close_stream ──► (accounts closed, rent returned)
```

### PDA Derivation

| Account | Seeds |
|---|---|
| StreamAccount | `["stream", creator, recipient, seed_le_bytes]` |
| Escrow token | `["escrow", stream_pubkey]` |

### Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `DEV_FEE_BPS` | 100 (1%) | Protocol fee on `create_stream` |
| `MIN_CLAIM_AMOUNT` | 1_000 | Dust / bot filter on `withdraw` |
| `MIN_LEVEL` / `MAX_LEVEL` | 1 / 30 | Game target level range |
| `DIFFICULTY_EASY` / `MEDIUM` / `HARD` | 1 / 2 / 3 | Milestone difficulty IDs |

> **Note:** VGPV constants (`MIN_ACTION_INTERVAL`, `MAX_VELOCITY_STRIKES`, `VELOCITY_RESET_INTERVAL`) are declared in `constants.rs` but **not yet enforced** by any instruction — reserved for a future rate limiter.

---

## Instructions

### `create_stream(total_amount, start_time, end_time, cliff_time, seed, milestone_enabled, name)`
- Validates timestamps and amount
- Transfers `total_amount` tokens from creator to escrow PDA
- Collects `DEV_FEE_BPS` (1%) to a fixed protocol treasury
- Initializes `StreamAccount` with all vesting parameters (incl. `name: [u8; 32]`)

### `withdraw()`
- Computes pro-rata unlocked tokens: `unlocked = total × elapsed / duration`
- Enforces cliff gate (when `cliff_time > 0`) and milestone gate (when `milestone_enabled`)
- Checks `claimable >= MIN_CLAIM_AMOUNT` (dust guard)
- Transfers claimable tokens from escrow to recipient

### `cancel()`
- Creator-only; fails if stream is already cancelled or fully vested
- Splits escrow: vested portion → recipient, unvested → creator
- Sets `is_cancelled = true` on the stream

### `set_milestone()`
- Creator-only; sets `milestone_reached = true`
- Cannot be called again once already set
- Gating is independent of `cliff_time` (works in either combination)

### `close_stream()`
- Creator-only; requires stream to be settled (cancelled OR fully withdrawn)
- Closes escrow token account via SPL `close_account` CPI → rent lamports to creator
- Closes stream PDA via Anchor `close = creator` constraint → rent lamports to creator
- Returns ~0.002–0.003 SOL per stream pair

### `create_campaign(title_hash, total_budget, seed)`
- Founder-only; deposits `total_budget` tokens into a campaign escrow PDA
- Stores SHA-256 hash of campaign title on-chain (content lives off-chain)
- Initializes `CampaignAccount` with founder + total_budget

### `create_milestone(description_hash, campaign_seed, milestone_seed, token_amount, game_authority, recipient, target_level, difficulty)`
- Founder-only; adds a milestone to a campaign
- Validates `token_amount` fits in remaining campaign budget
- Stores `game_authority: Pubkey` — the keypair that will sign `verify_game`
- Stores `recipient: Pubkey` — the player who can claim the reward

### `verify_game(milestone_seed, achieved_level)`
- Game authority signs and submits the player's level
- Validates `game_authority == milestone.game_authority` and `achieved_level >= target_level`
- Sets `milestone.is_verified = true` (idempotency guard)

### `claim_milestone(milestone_seed, campaign_seed)`
- Recipient-only; transfers `token_amount` from campaign escrow to recipient
- Validates `is_verified` and `!is_claimed`
- Sets `is_claimed = true` before CPI (CEI)

---

## Test Coverage

| Suite | Tests | Status |
|---|---|---|
| Rust unit tests (unlock math + cancel + campaign + edge cases) | 83 | ✅ Pass |
| Integration tests (TypeScript/Mocha) | 32 | ✅ Pass |
| **Total** | **115** | **✅ All green** |

### Integration Test Scenarios

**Happy paths (12):** create with fee, partial withdraw, full withdraw, cancel mid-stream, milestone unlock flow, close_stream after cancel/withdraw, create_campaign, create_milestone, verify_game, claim_milestone, MAX_LEVEL boundary

**Error guard tests (20):**
- `InvalidAmount`, `InvalidTimestamp` (×2: end≤start, cliff>end), `InvalidRecipient`
- `Unauthorized` (withdraw, cancel, set_milestone, close_stream, claim_milestone, create_milestone)
- `StreamNotStarted`, `NothingToWithdraw` (double withdraw), `StreamCancelled`
- `AlreadyCancelled`, `FullyVested`
- `MilestoneAlreadyReached`, `MilestoneAlreadyVerified`, `MilestoneNotVerified`, `AlreadyClaimed`
- `InvalidGameAuthority`, `LevelNotReached`, `InvalidLevel`, `InvalidDifficulty`
- `InsufficientBudget`, `StreamNotSettled`

---

## Security Highlights

See [`SECURITY_CHECKLIST.md`](./SECURITY_CHECKLIST.md) for full details.

**Critical protections implemented:**
1. **Signer validation on every mutating instruction** — creator, recipient, founder, or game_authority key checked via Anchor constraints
2. **PDA ownership** — all token and state accounts are program-derived; no arbitrary accounts accepted
3. **CEI pattern** — state written before any CPI calls to prevent reentrancy
4. **Integer overflow** — all arithmetic uses `checked_*` or `u128` intermediate cast with explicit bounds
5. **MIN_CLAIM_AMOUNT** — prevents spam/dust transactions draining compute budget
6. **Fully-vested cancel guard** — prevents creator from denying recipient their earned tokens
7. **Settled-only close** — `close_stream` requires `is_cancelled || amount_withdrawn == total_amount`
8. **Milestone idempotency** — `is_verified` and `is_claimed` guards prevent double-verification and double-claim

---

## Deployment

**Devnet:** Program live at `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

[View on Solana Explorer](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet)

**CI/CD:** GitHub Actions `Blockbite CI` runs on every push — builds + 115 tests in ~9 minutes.

**Devnet re-deploy:** Actions → "Deploy to Devnet" → `workflow_dispatch` with `confirm: "deploy"`.

---

## Known Limitations

- `DEV_FEE_BPS` is hardcoded at 1% (no governance for fee adjustment yet)
- No referral tracking on-chain (off-chain only)
- Formal security audit pending before Mainnet

---

## Commit History (key milestones)

| Commit | Description |
|---|---|
| Week 5 | Core instructions: create_stream, withdraw, cancel, set_milestone |
| Week 6 | DEV_FEE, MIN_CLAIM_AMOUNT, milestone_enabled flag, dispatch pattern |
| Week 7 | Edge-case integration tests + SECURITY_CHECKLIST.md |
| Week 8 | Campaign & Milestone system (4 new instructions) + stable program ID + devnet CI/CD |
| Week 9 | `close_stream` instruction + 4 close_stream tests + `name` field on stream + 8 MAX_LEVEL boundary tests |
| Week 10 | Full docs suite (PROGRAM.md, INTEGRATION.md, STREAM_MODEL.md, ERROR_MAP.md, CLIFF_VESTING.md, SETUP.md, docs-site/) — 115 total tests |

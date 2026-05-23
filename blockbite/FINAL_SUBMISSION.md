# BlockBite Smart Contract — Final Submission (Week 10)

**Date:** 2026-05-20  
**Team:** nayrbryanGaming  
**Program ID:** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Network:** Solana Devnet  
**Repository:** https://github.com/BlockBite-GameFi/blockbite-smart-contract  
**Framework:** Anchor 0.32.1 / Solana 1.18+

---

## Project Summary

BlockBite is a **token vesting / game reward streaming** smart contract on Solana. It enables trustless, time-locked token distribution with milestone-based cliff unlocks — designed for GameFi reward payouts, team vesting, and DAO contributor grants.

### Core Value Proposition

| Problem | Solution |
|---|---|
| Game studios can't enforce vesting schedules without custodians | On-chain streams — non-custodial, creator-defined timelines |
| Bot farming drains reward pools instantly | VGPV: velocity-based strike system blocks rapid-fire claims |
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
| `MIN_ACTION_INTERVAL` | 2 | Seconds between withdrawals before VGPV fires |
| `MAX_VELOCITY_STRIKES` | 3 | Strikes before `BotDetected` error |
| `VELOCITY_RESET_INTERVAL` | 3600 | Seconds until strike counter resets |

---

## Instructions

### `create_stream(total_amount, start_time, end_time, cliff_time, seed)`
- Validates timestamps and amount
- Transfers `total_amount` tokens from creator to escrow PDA
- Collects `DEV_FEE_BPS` (1%) to a fixed protocol treasury
- Initializes `StreamAccount` with all vesting parameters

### `withdraw()`
- Computes pro-rata unlocked tokens: `unlocked = total × elapsed / duration`
- Enforces cliff (milestone path: `is_milestone_reached` must be true)
- Checks `claimable >= MIN_CLAIM_AMOUNT` (dust guard)
- Applies VGPV rate limiter: rapid successive calls accumulate strikes → `BotDetected` at 3 strikes
- Transfers claimable tokens from escrow to recipient

### `cancel()`
- Creator-only; fails if stream is already cancelled or fully vested
- Splits escrow: vested portion → recipient, unvested → creator
- Sets `is_cancelled = true` on the stream

### `set_milestone()`
- Creator-only; sets `is_milestone_reached = true`
- Requires cliff time to have passed
- Cannot be called again once already set

### `close_stream()`
- Creator-only; requires stream to be settled (cancelled OR fully withdrawn)
- Closes escrow token account via SPL `close_account` CPI → rent lamports to creator
- Closes stream PDA via Anchor `close = creator` constraint → rent lamports to creator
- Returns ~0.002–0.003 SOL per stream pair

---

## Test Coverage

| Suite | Tests | Status |
|---|---|---|
| Rust unit tests (`calculate_unlocked`) | 13 | ✅ Pass |
| Integration tests (TypeScript/Mocha) | 28 | ✅ Pass |
| **Total** | **41** | **✅ All green** |

### Integration Test Scenarios

**Happy paths (6):** create with fee, partial withdraw, full withdraw, cancel mid-stream, milestone unlock flow, close_stream after cancel/withdraw

**Error guard tests (22):**
- `InvalidAmount`, `InvalidTimestamp` (×2: end≤start, cliff>end), `InvalidRecipient`
- `Unauthorized` (withdraw, cancel, set_milestone)
- `StreamNotStarted`, `NothingToWithdraw` (double withdraw), `StreamCancelled`
- `AlreadyCancelled`, `FullyVested`, `ClaimTooSmall`
- `MilestoneAlreadyReached`, `CliffNotReached`
- `BotDetected` (VGPV rate limit)
- `StreamNotCloseable`, `Unauthorized` on close

---

## Security Highlights

See [`SECURITY_CHECKLIST.md`](./SECURITY_CHECKLIST.md) for full details.

**Critical protections implemented:**
1. **Signer validation on every mutating instruction** — creator or recipient key checked via Anchor constraints
2. **PDA ownership** — all token and state accounts are program-derived; no arbitrary accounts accepted
3. **CEI pattern** — state written before any CPI calls to prevent reentrancy
4. **Integer overflow** — all arithmetic uses `checked_*` or safe-cast with explicit bounds
5. **VGPV** — per-stream velocity limiter blocks automated farming bots
6. **MIN_CLAIM_AMOUNT** — prevents spam/dust transactions draining compute budget
7. **Fully-vested cancel guard** — prevents creator from denying recipient their earned tokens
8. **Settled-only close** — `close_stream` requires `is_cancelled || amount_withdrawn == total_amount`

---

## Deployment

**Devnet:** Program live at `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

[View on Solana Explorer](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet)

**CI/CD:** GitHub Actions `Blockbite CI` runs on every push — builds + 41 tests in ~9 minutes.

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
| Week 6 | VGPV anti-bot system, DEV_FEE, MIN_CLAIM_AMOUNT |
| Week 7 | 8 edge-case integration tests + SECURITY_CHECKLIST.md |
| Week 8 | Stable program ID, devnet CI/CD workflow, STATUS_REPORT |
| Week 9 | `close_stream` instruction + 3 tests (rent recovery) |
| Week 10 | FINAL_SUBMISSION.md, STATUS_REPORT updated to 28 tests |

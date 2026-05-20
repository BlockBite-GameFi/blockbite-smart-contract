# BlockBite

**Automated, milestone-based token vesting on Solana.**

BlockBite is the treasury shield for Solana builders — replacing high-risk manual distributions with a secure, automated "Pull" ecosystem. We eliminate the "Push" vulnerability where manual transfers invite fatal exploits and irreversible human errors. By integrating rewards to transparent performance milestones, BlockBite reclaims weeks of development time while converting passive users into a loyal, high-retention community.

## Quick Info

| Item | Value |
|---|---|
| **Program ID (Devnet)** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Framework** | Anchor 0.32.1 |
| **Network** | Solana Devnet |
| **Tests** | 41 total (28 integration + 13 Rust unit) — all green ✅ |
| **Explorer** | [View on Solana Explorer](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet) |

## Features

- **Milestone-Based Distribution** — Set unlock conditions tied to real project milestones, not just time
- **Cliff + Linear Vesting** — Configure cliff periods and linear unlock schedules enforced on-chain
- **Trustless & Automated** — Smart contract enforces all rules; no manual transfers, no oversight gaps
- **Full Transparency** — Every vesting schedule, unlock event, and claim is recorded on-chain
- **Prorated Cancellation** — Cancel streams with fair split between creator and recipient based on unlocked amount
- **VGPV Anti-Bot** — Velocity Guard Penalty Valve blocks rapid-fire bot farming (3 strikes → banned)
- **Protocol Fee** — 1% dev fee on `create_stream`, transferred to protocol treasury
- **Rent Recovery** — `close_stream` reclaims SOL rent from settled stream + escrow accounts

## Architecture

```
Creator ──► create_stream ──► StreamAccount (PDA)
                                    │
                               escrow_token_account (PDA-owned)
                                    │
Recipient ◄── withdraw ◄───────────┘
Creator   ◄── cancel ◄─────────────┘
Creator   ──► set_milestone ──► StreamAccount.milestone_reached = true
Creator   ──► close_stream ──► (accounts closed, rent → creator)
```

### PDA Seeds

| Account | Seeds |
|---|---|
| `StreamAccount` | `["stream", creator, recipient, seed_le_bytes]` |
| `EscrowTokenAccount` | `["escrow", stream_pubkey]` |

### Key Protocol Constants

| Constant | Value | Purpose |
|---|---|---|
| `DEV_FEE_BPS` | 100 (1%) | Protocol fee charged on `create_stream` |
| `MIN_CLAIM_AMOUNT` | 1_000 | Minimum token units per withdrawal (dust filter) |
| `MIN_ACTION_INTERVAL` | 2 sec | Withdraw interval below this triggers a VGPV strike |
| `MAX_VELOCITY_STRIKES` | 3 | Strikes before `BotDetected` error |
| `VELOCITY_RESET_INTERVAL` | 3_600 sec | Inactivity window to reset strike counter |

## Getting Started

### Prerequisites

- Rust 1.89.0+
- Anchor 0.32.1 (via `avm`)
- Solana CLI 2.3.0+
- Node.js 20+
- Yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/BlockBite-GameFi/blockbite-smart-contract.git
cd blockbite-smart-contract/blockbite   # ALL anchor commands run from here

# Install dependencies
yarn install

# Build the program
anchor build

# Run all tests (starts local validator automatically)
anchor test
```

### Deploy to Devnet

Via GitHub Actions (recommended):

1. Add GitHub secrets:
   - `ANCHOR_PROGRAM_KEYPAIR` — contents of `blockbite/target/deploy/blockbite-keypair.json`
   - `DEVNET_DEPLOYER_KEYPAIR` — contents of a funded devnet wallet JSON
2. Actions → "Deploy to Devnet" → Run workflow → type `deploy`

Or manually:

```bash
solana config set --url devnet
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
```

## Program Instructions

### `create_stream(total_amount, start_time, end_time, cliff_time, seed)`

Creates a new vesting stream. Transfers `total_amount` tokens to escrow PDA and collects 1% protocol fee.

| Parameter | Type | Description |
|---|---|---|
| `total_amount` | `u64` | Total tokens to vest |
| `start_time` | `i64` | Unix timestamp when vesting begins |
| `end_time` | `i64` | Unix timestamp when vesting ends |
| `cliff_time` | `i64` | Unix timestamp for cliff (0 = no cliff; requires `set_milestone` before withdraw) |
| `seed` | `u64` | Unique seed for PDA derivation (allows multiple streams per creator/recipient pair) |

**Accounts:** `creator` (signer), `recipient`, `mint`, `creator_token_account`, `escrow_token_account` (init), `stream` (init), `developer_token_account`, `token_program`, `system_program`

### `withdraw()`

Recipient claims unlocked vested tokens. Applies VGPV rate limiting and MIN_CLAIM_AMOUNT dust filter.

**Accounts:** `recipient` (signer), `stream`, `mint`, `escrow_token_account`, `recipient_token_account`, `token_program`

### `cancel()`

Creator cancels a stream. Vested portion goes to recipient; unvested portion returned to creator.

**Accounts:** `creator` (signer), `stream`, `mint`, `escrow_token_account`, `creator_token_account`, `recipient_token_account`, `token_program`

### `set_milestone()`

Creator confirms a KPI/milestone has been reached, enabling cliff-gated vesting to begin.

**Accounts:** `creator` (signer), `stream`

### `close_stream()`

Creator closes a settled stream (cancelled OR fully withdrawn), recovering rent SOL from both the stream account and escrow token account.

**Accounts:** `creator` (signer), `stream` (closed), `escrow_token_account` (closed), `mint`, `token_program`, `system_program`

## Account Structure

### `StreamAccount` (196 bytes)

| Field | Type | Bytes | Description |
|---|---|---|---|
| `creator` | `Pubkey` | 32 | Stream creator address |
| `recipient` | `Pubkey` | 32 | Token recipient address |
| `mint` | `Pubkey` | 32 | SPL token mint |
| `escrow_token_account` | `Pubkey` | 32 | Escrow PDA address |
| `total_amount` | `u64` | 8 | Total tokens in stream |
| `amount_withdrawn` | `u64` | 8 | Cumulative tokens claimed |
| `start_time` | `i64` | 8 | Vesting start (unix seconds) |
| `end_time` | `i64` | 8 | Vesting end (unix seconds) |
| `cliff_time` | `i64` | 8 | Cliff timestamp (0 = none) |
| `is_cancelled` | `bool` | 1 | Whether stream is cancelled |
| `bump` | `u8` | 1 | PDA canonical bump |
| `seed` | `u64` | 8 | Creator-supplied seed |
| `milestone_reached` | `bool` | 1 | Set by `set_milestone` |
| `velocity_strikes` | `u8` | 1 | VGPV strike counter |
| `last_action_ts` | `i64` | 8 | Timestamp of last withdrawal |

**Total:** 196 bytes (includes 8-byte Anchor discriminator)

## Unlock Calculation

```rust
// Linear unlock with optional cliff/milestone gate
pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    if current_time < stream.start_time { return 0; }
    // Cliff gate: milestone must be reached if cliff_time is set
    if stream.cliff_time > 0 && !stream.milestone_reached { return 0; }
    if stream.cliff_time > 0 && current_time < stream.cliff_time { return 0; }
    if current_time >= stream.end_time { return stream.total_amount; }

    let elapsed  = (current_time - stream.start_time) as u128;
    let duration = (stream.end_time - stream.start_time) as u128;
    ((stream.total_amount as u128) * elapsed / duration) as u64
}
```

## Error Codes

| Code | Name | Message |
|---|---|---|
| 6000 | `Unauthorized` | Signer is not authorised to perform this action |
| 6001 | `InsufficientUnlockedTokens` | Claimable amount is zero or exceeds unlocked tokens |
| 6002 | `StreamCancelled` | Stream has been cancelled |
| 6003 | `StreamAlreadyCancelled` | Stream is already cancelled |
| 6004 | `StreamNotStarted` | Stream has not started yet |
| 6005 | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end |
| 6006 | `InvalidAmount` | Amount must be greater than zero |
| 6007 | `InvalidRecipient` | Creator and recipient cannot be the same account |
| 6008 | `AlreadyCancelled` | Stream is already cancelled |
| 6009 | `FullyVested` | Stream is fully vested and cannot be cancelled |
| 6010 | `NothingToWithdraw` | No tokens available to withdraw |
| 6011 | `MilestoneAlreadyReached` | Milestone has already been reached |
| 6012 | `CliffNotReached` | Cliff period has not been reached yet |
| 6013 | `BotDetected` | Suspicious activity detected: too many rapid actions |
| 6014 | `StreamExpired` | Stream has expired and is no longer active |
| 6015 | `ClaimTooSmall` | Claim amount is below minimum threshold |
| 6016 | `StreamNotCloseable` | Stream must be cancelled or fully withdrawn before it can be closed |

## Project Structure

```
blockbite-smart-contract/
├── .github/
│   └── workflows/
│       ├── ci.yml               # Build + test on every push
│       └── deploy-devnet.yml    # Manual devnet deployment
├── blockbite/                   # ALL anchor commands run from here
│   ├── Anchor.toml              # anchor_version = "0.32.1"
│   ├── Cargo.toml               # Rust workspace
│   ├── SECURITY_CHECKLIST.md    # Security audit (Week 7)
│   ├── STATUS_REPORT.md         # Status & performance report (Week 9)
│   ├── FINAL_SUBMISSION.md      # Final bootcamp submission (Week 10)
│   ├── programs/
│   │   └── blockbite/src/
│   │       ├── lib.rs           # Program entrypoint (5 instructions)
│   │       ├── constants.rs     # VGPV + DEV_FEE constants
│   │       ├── errors.rs        # 17 error codes
│   │       ├── utils.rs         # calculate_unlocked + 13 unit tests
│   │       ├── tests_cancel.rs  # Cancel logic unit tests
│   │       ├── state/
│   │       │   └── stream.rs    # StreamAccount (196 bytes)
│   │       └── instructions/
│   │           ├── create_stream.rs
│   │           ├── withdraw.rs
│   │           ├── cancel.rs
│   │           ├── set_milestone.rs
│   │           └── close_stream.rs
│   └── tests/
│       └── blockbite.ts         # 28 integration tests
└── README.md
```

## Testing

```bash
cd blockbite

# Run all tests (unit + integration, starts local validator)
anchor test

# Rust unit tests only
cargo test --package blockbite

# TypeScript integration tests only (validator must already be running)
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

### Test Coverage

| Suite | Count | Status |
|---|---|---|
| Rust unit tests (`calculate_unlocked` + cancel logic) | 13 | ✅ Pass |
| Integration tests (TypeScript/Mocha) | 28 | ✅ Pass |
| **Total** | **41** | **✅ All green** |

**Integration test scenarios covered:**
- Happy paths: create with fee, partial/full withdraw, cancel mid-stream, milestone unlock, close after cancel/withdraw
- Error guards: `InvalidAmount`, `InvalidTimestamp` (×2), `InvalidRecipient`, `Unauthorized` (×3), `StreamNotStarted`, `NothingToWithdraw`, `StreamCancelled`, `AlreadyCancelled`, `FullyVested`, `ClaimTooSmall`, `MilestoneAlreadyReached`, `CliffNotReached`, `BotDetected` (VGPV), `StreamNotCloseable`

## CI/CD Pipeline

| Workflow | Trigger | Description |
|---|---|---|
| `Blockbite CI` | Push / PR to `main` | Build + 41 tests (~9 min) |
| `Deploy to Devnet` | Manual (`workflow_dispatch`) | Build + deploy + verify on devnet |

### Required Secrets

| Secret | Description |
|---|---|
| `ANCHOR_PROGRAM_KEYPAIR` | Program keypair JSON for stable program ID |
| `DEVNET_DEPLOYER_KEYPAIR` | Funded devnet wallet JSON for deployment |

## Security

See [`blockbite/SECURITY_CHECKLIST.md`](./blockbite/SECURITY_CHECKLIST.md) for the full audit.

| Protection | Implementation |
|---|---|
| Signer validation | Anchor `constraint = key() == expected @ Unauthorized` on all mutating instructions |
| PDA ownership | Escrow owned by stream PDA; `token::authority = stream` enforced by Anchor |
| Integer overflow | All arithmetic uses `checked_*` ops or `u128` intermediate |
| Reentrancy (CEI) | State written before all CPI calls; mutable borrows scoped with Rust blocks |
| VGPV anti-bot | 3-strike rate limiter per stream; resets after 1 hour inactivity |
| Dust filter | `MIN_CLAIM_AMOUNT = 1_000` rejects sub-threshold withdrawal probes |
| Settled-only close | `close_stream` requires `is_cancelled || amount_withdrawn == total_amount` |

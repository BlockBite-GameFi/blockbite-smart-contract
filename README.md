# BlockBite

**Automated, milestone-based token vesting on Solana.**

BlockBite is a Solana program that enables trust-minimized, on-chain token distribution with cliff periods, linear vesting schedules, and milestone-based unlock conditions

## Features

- **Milestone-Based Distribution** — Set unlock conditions tied to real project milestones, not just time
- **Cliff + Linear Vesting** — Configure cliff periods and linear unlock schedules enforced on-chain
- **Trustless & Automated** — Smart contract enforces all rules; no manual transfers, no oversight gaps
- **Full Transparency** — Every vesting schedule, unlock event, and claim is recorded on-chain
- **Prorated Cancellation** — Cancel streams with fair split between creator and recipient based on unlocked amount

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BlockBite Program                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Creator ──► create_stream ──► StreamAccount (PDA)          │
│                  │                      │                   │
│                  ▼                      ▼                   │
│            Transfer Tokens         Escrow Token Account      │
│            (SPL Token)            (PDA-owned, PDA sign)     │
│                                     │                       │
│                                     ▼                       │
│                          ┌──────────────────────┐           │
│                          │   withdraw / cancel  │           │
│                          │   (PDA signer seeds) │           │
│                          └──────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### PDA Seeds

| Account | Seeds |
|---------|-------|
| `StreamAccount` | `["stream", creator, recipient, seed]` |
| `EscrowTokenAccount` | `["escrow", stream_key]` |

## Getting Started

### Prerequisites

- Rust 1.89.0+
- Anchor 0.32.1
- Solana CLI 2.3.0+
- Node.js 20+
- Yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/your-org/blockbite.git
cd blockbite/blockbite

# Install dependencies
yarn install

# Build the program
anchor build

# Run tests
anchor test
```

### Deploy to Devnet

```bash
# Switch to devnet
solana config set --url devnet

# Deploy
anchor deploy --provider.cluster devnet
```

## Program Instructions

### `create_stream`

Creates a new vesting stream with specified parameters.

| Parameter | Type | Description |
|-----------|------|-------------|
| `total_amount` | `u64` | Total tokens to vest |
| `start_time` | `i64` | Unix timestamp when vesting begins |
| `end_time` | `i64` | Unix timestamp when vesting ends |
| `cliff_time` | `i64` | Unix timestamp for cliff (0 = no cliff) |
| `seed` | `u64` | Unique seed for PDA derivation |

**Accounts required:**
- `creator` (signer, writable)
- `recipient` (unchecked)
- `mint` (SPL token mint)
- `creator_token_account` (writable)
- `escrow_token_account` (writable, initialized)
- `stream` (writable, initialized)
- `token_program`, `system_program`

### `withdraw`

Allows recipient to claim unlocked vested tokens.

**Accounts required:**
- `recipient` (signer, writable)
- `stream` (writable, PDA)
- `mint` (SPL token mint)
- `escrow_token_account` (writable)
- `recipient_token_account` (writable)
- `token_program`

### `cancel`

Cancels a stream and distributes remaining tokens proportionally.

**Accounts required:**
- `creator` (signer, writable)
- `stream` (writable, PDA)
- `mint` (SPL token mint)
- `escrow_token_account` (writable)
- `creator_token_account` (writable)
- `recipient_token_account` (writable)
- `token_program`

## Account Structure

### `StreamAccount`

| Field | Type | Size |
|-------|------|------|
| `creator` | `Pubkey` | 32 |
| `recipient` | `Pubkey` | 32 |
| `mint` | `Pubkey` | 32 |
| `escrow_token_account` | `Pubkey` | 32 |
| `total_amount` | `u64` | 8 |
| `amount_withdrawn` | `u64` | 8 |
| `start_time` | `i64` | 8 |
| `end_time` | `i64` | 8 |
| `cliff_time` | `i64` | 8 |
| `is_cancelled` | `bool` | 1 |
| `bump` | `u8` | 1 |
| `seed` | `u64` | 8 |

**Total size:** 248 bytes (including 8-byte discriminator)

## Error Codes

| Code | Name | Message |
|------|------|---------|
| 6000 | `Unauthorized` | Signer is not authorised to perform this action |
| 6001 | `InsufficientUnlockedTokens` | Claimable amount is zero or exceeds unlocked tokens |
| 6002 | `StreamCancelled` | Stream has been cancelled |
| 6003 | `StreamAlreadyCancelled` | Stream is already cancelled |
| 6004 | `StreamNotStarted` | Stream has not started yet |
| 6005 | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end |
| 6006 | `InvalidAmount` | Amount must be greater than zero |
| 6007 | `InvalidRecipient` | Creator and recipient cannot be the same account |

## Unlock Calculation

```rust
pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    if current_time < stream.start_time { return 0; }
    if stream.cliff_time > 0 && current_time < stream.cliff_time { return 0; }
    if current_time >= stream.end_time { return stream.total_amount; }

    let elapsed = (current_time - stream.start_time) as u128;
    let duration = (stream.end_time - stream.start_time) as u128;
    ((stream.total_amount as u128) * elapsed / duration) as u64
}
```

## Project Structure

```
blockbite/
├── Anchor.toml                 # Anchor configuration
├── Cargo.toml                  # Rust workspace manifest
├── Cargo.lock                  # Dependency lock file
├── package.json                # Node.js dependencies
├── tsconfig.json               # TypeScript configuration
├── programs/
│   └── blockbite/
│       ├── Cargo.toml          # Program dependencies
│       └── src/
│           ├── lib.rs          # Program entrypoint
│           ├── errors.rs       # Error definitions
│           ├── utils.rs        # Unlock calculation + unit tests
│           ├── tests_cancel.rs # Cancel logic unit tests
│           ├── state/
│           │   ├── mod.rs
│           │   └── stream.rs   # StreamAccount definition
│           └── instructions/
│               ├── mod.rs
│               ├── create_stream.rs
│               ├── withdraw.rs
│               └── cancel.rs
├── tests/
│   └── blockbite.ts            # Integration tests
└── .github/
    └── workflows/
        └── ci.yml              # GitHub Actions pipeline
```

## CI/CD Pipeline

The project uses GitHub Actions for automated testing and deployment.

### Jobs

| Job | Description |
|-----|-------------|
| `smart-contract` | Build Rust program, run unit + integration tests |

### Required Secrets

| Secret | Description |
|--------|-------------|
| `ANCHOR_PROGRAM_KEYPAIR` | Program keypair (base58 array JSON) for deterministic program ID |

### Trigger

- Push to `master` or `main`
- Pull requests to `master` or `main`

## Security

- **CEI Pattern** — All instructions follow Checks-Effects-Interactions ordering
- **PDA Ownership** — Escrow accounts are owned by the program, not hot wallets
- **Overflow Protection** — All arithmetic uses `checked_*` operations
- **Signer Validation** — All privileged actions require proper signer checks
- **Constraint Validation** — Anchor account constraints enforce access control at the framework level

## Testing

```bash
# Run all tests (unit + integration)
anchor test

# Run only Rust unit tests
cargo test --package blockbite

# Run only TypeScript integration tests
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

### Test Coverage

| Category | Tests | Status |
|----------|-------|--------|
| Unlock math (0%, 25%, 50%, 100%, before start, before cliff, after cliff, past end) | 8 | ✅ |
| Cancel logic (0%, 25%, 50%, 100%, partial withdraw, before cliff, after cliff, sum check) | 8 | ✅ |
| Integration (create, withdraw, double withdraw, unauthorized, cancel, cancelled stream, zero amount, same creator/recipient, double cancel, cliff) | 12 | ✅ |


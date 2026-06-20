# BlockBite — Agent Instructions

## Project Structure

```
blockbite/
├── .github/workflows/
│   ├── ci.yml               # Build + 83 Rust + 32 TS tests on every push
│   └── deploy-devnet.yml    # Manual devnet deployment
├── Anchor.toml              # anchor_version = "1.0.0"
├── Cargo.toml               # workspace: programs/blockbite
├── programs/blockbite/src/
│   ├── lib.rs               # 9 instructions exposed
│   ├── constants.rs         # DEV_FEE + dust filter + level/difficulty constants
│   ├── errors.rs            # 21 error codes (6000–6020)
│   ├── utils.rs             # calculate_unlocked + 20 inline unit tests
│   ├── tests_logic.rs       # Unlock math + pure logic
│   ├── tests_cancel.rs      # Cancel logic
│   ├── tests_edge_cases.rs  # Boundary conditions
│   ├── tests_campaign.rs    # Campaign/milestone system
│   ├── state/stream.rs      # StreamAccount (220 bytes)
│   └── instructions/
│       ├── create_stream.rs
│       ├── withdraw.rs
│       ├── cancel.rs
│       ├── set_milestone.rs
│       ├── close_stream.rs
│       ├── create_campaign.rs
│       ├── create_milestone.rs
│       ├── verify_game.rs
│       └── claim_milestone.rs
├── tests/blockbite.ts       # 32 TypeScript integration tests
├── apps/web/                # Next.js 14 front-end (dark mode, English only)
├── apps/game-server/        # (Removed — web app has its own /api/game/* routes)
├── clients/ts/              # TypeScript SDK client
├── docs/                    # Architecture Decision Records, weekly reports
├── docs-site/               # VitePress documentation
└── README.md
```

## Critical: Working Directory

**All Anchor commands must run from `blockbite/` subfolder**, not repo root:

```bash
cd blockbite          # MUST do this first
anchor build          # works
anchor test           # works
```

Running `anchor build` from repo root → `Not in anchor workspace` error.

## Commands

```bash
cd blockbite

# Build
anchor build

# Test (starts local validator automatically)
anchor test

# Rust unit tests only
cargo test --package blockbite

# Deploy to devnet (prefer CI workflow)
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
```

## Toolchain

| Tool | Version |
|---|---|
| Anchor | 1.0.0 (via avm — anchor_version in `Anchor.toml`) |
| Rust | stable (1.89.0+) |
| Solana CLI | stable (2.3.0+) |
| Node.js | 20 |
| Package manager | yarn |

## Program ID

| Network | Program ID |
|---|---|
| Devnet  | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| Localnet | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |

Defined in `programs/blockbite/src/lib.rs` via `declare_id!()`.
Keypair: `target/deploy/blockbite-keypair.json` (also GitHub secret `ANCHOR_PROGRAM_KEYPAIR`).

## Architecture

### 9 Instructions

| Instruction | File | Signer | Purpose |
|---|---|---|---|
| `create_stream`   | `create_stream.rs`   | creator    | Deposit tokens into escrow PDA, set vesting schedule |
| `withdraw`        | `withdraw.rs`        | recipient  | Claim pro-rata unlocked tokens (dust guard: `MIN_CLAIM_AMOUNT`) |
| `cancel`          | `cancel.rs`          | creator    | Cancel stream, split escrow between parties |
| `set_milestone`   | `set_milestone.rs`   | creator    | Unlock cliff-gated vesting by confirming a KPI |
| `close_stream`    | `close_stream.rs`    | creator    | Close settled stream, recover rent SOL |
| `create_campaign` | `create_campaign.rs` | founder    | Initialize a CampaignAccount + escrow vault |
| `create_milestone`| `create_milestone.rs`| founder    | Add a milestone gate to a campaign |
| `verify_game`     | `verify_game.rs`     | game auth  | Sign game-level completion (anti-bot oracle) |
| `claim_milestone` | `claim_milestone.rs` | recipient  | Claim tokens unlocked by a verified milestone |

### PDA Seeds

| Account | Seeds |
|---|---|
| `StreamAccount` | `["stream", creator, recipient, seed_le_bytes]` |
| `EscrowTokenAccount` | `["escrow", stream_pubkey]` |

### Instruction Discriminators (`sha256("global:<name>")[0..8]`)

| Instruction | Discriminator |
|---|---|
| `create_stream` | `[71, 188, 111, 127, 108, 40, 229, 158]` |
| `withdraw` | `[183, 18, 70, 156, 148, 109, 161, 34]` |
| `cancel` | `[232, 219, 223, 41, 219, 236, 220, 190]` |
| `set_milestone` | `[174, 213, 91, 82, 156, 42, 105, 3]` |
| `close_stream` | `[255, 241, 196, 212, 95, 93, 160, 89]` |

### Key Constants (`constants.rs`)

| Constant | Value | Purpose |
|---|---|---|
| `DEV_FEE_BPS` | 100 | 1% protocol fee on `create_stream` |
| `MIN_CLAIM_AMOUNT` | 1_000 | Dust filter: reject withdrawals below this |
| `MIN_LEVEL` / `MAX_LEVEL` | 1 / 30 | Game target level range |
| `DIFFICULTY_EASY` / `MEDIUM` / `HARD` | 1 / 2 / 3 | Milestone difficulty IDs |

> **Note:** `MIN_ACTION_INTERVAL`, `MAX_VELOCITY_STRIKES`, and `VELOCITY_RESET_INTERVAL` are declared in `constants.rs` (VGPV stubs) but are **not currently consumed** by any instruction. Reserved for a future anti-bot rate limiter.

### Core Math (`utils.rs`)

```rust
// Linear unlock with cliff + milestone gate
unlocked = total_amount × (current_time - start_time) / (end_time - start_time)
// Returns 0 if: before start_time, cliff set but milestone not reached, before cliff_time
// Returns total_amount if >= end_time
```

### Security Pattern (CEI)

All instructions follow **Checks → Effects → Interactions**:
1. **Checks**: Anchor constraints + `require!` validations
2. **Effects**: Update state (`amount_withdrawn`, `is_cancelled`, `is_claimed`, etc.)
3. **Interactions**: CPI `token::transfer_checked` / `token::close_account` last

All arithmetic uses `checked_*` or `u128` intermediate — never raw operators.

## Test Count

| Category | Count |
|---|---|
| Rust unit tests (unlock math + cancel + campaign + edge cases + pure logic) | 83 |
| TypeScript integration tests | 32 |
| **Total** | **115** |

## Code Coverage

Measured with `cargo-llvm-cov` (Rust 1.89 stable; `#[coverage(off)]` is nightly-only so file-level exclusion is used instead).

```bash
# Strict report — excludes both BPF dispatch files (recommended for CI gate)
make coverage-strict

# Default report — keeps the `#[program]` dispatch in the denominator
make coverage
```

| Report | Line | Function | Region | Excluded |
|---|---|---|---|---|
| `make coverage-strict` | 99.4% | 100% | 98.4% | `lib.rs` (9 BPF dispatch wrappers) + `_dispatch.rs` (9 Account structs + 9 `*_handler` fns) |
| `make coverage` | 93.1% | 91.4% | 94.7% | `_dispatch.rs` only |

**Why `_dispatch.rs` is excluded**: it holds the `#[derive(Accounts)]` Account structs and the `*_handler` functions that wire them into Anchor CPIs. None of that code is reachable from `cargo test` — it only runs inside the BPF VM at runtime. The pure business logic (validation, state mutation, computation) lives in the per-instruction files (create_stream.rs, withdraw.rs, etc.) as `pub fn init_stream`, `compute_withdraw`, etc. and is fully unit-tested via `tests_logic.rs`, `tests_campaign.rs`, `tests_edge_cases.rs`, and `tests_cancel.rs`. The 32/32 TS integration tests cover the BPF dispatch end-to-end on a real validator.

## Test Quirks

### Airdrop Must Be Confirmed

```typescript
const sig = await provider.connection.requestAirdrop(pubkey, amount);
await provider.connection.confirmTransaction(sig, "confirmed");
```

### Program ID Resolution

Tests use `anchor.workspace.blockbite.programId` — never hardcoded strings.

### Error Assertion Pattern

```typescript
// AnchorError errorCode.number is the integer 6000–6020; .code is the camelCase name
assert.ok(e.message.includes("NothingToWithdraw") || e.message.includes("0x1771"));
```

### Solana Integer-Second Timestamps

`unix_timestamp` advances in whole seconds per slot. Two transactions in the same slot share the same timestamp → `claimable = 0` → `NothingToWithdraw`. Tests that depend on elapsed time use `>= 1500ms` sleeps to cross integer-second boundaries.

## CI/CD

| Workflow | Trigger | Duration |
|---|---|---|
| `Blockbite CI` (`.github/workflows/ci.yml`) | Push / PR to `main` | ~9 min |
| `Deploy to Devnet` (`.github/workflows/deploy-devnet.yml`) | Manual `workflow_dispatch` with `confirm: "deploy"` | ~25 min |

**Required secrets:** `ANCHOR_PROGRAM_KEYPAIR`, `DEVNET_DEPLOYER_KEYPAIR`

## Local Validator Issues

`solana-test-validator` may be unreliable on low-RAM Windows machines. If `anchor test` fails:

```bash
# Push to GitHub — CI runner (Ubuntu, 8-core, 32GB) handles it reliably
git push origin main
```

## Files That Should NOT Exist

| Path | Reason |
|---|---|
| `test-ledger/` | Generated by local validator; in root `.gitignore` |
| `.sixth/` | Internal tooling; in root `.gitignore` |
| `target/` | Build artifacts; in root `.gitignore` |
| `node_modules/` | Node deps; in root `.gitignore` |
| `apps/game-server/` | Removed; web app has its own `/api/game/*` routes |

# BlockBite — Agent Instructions

## Project Structure

```
blockbite-smart-contract/
├── .github/workflows/
│   ├── ci.yml               # Build + 41 tests on every push
│   └── deploy-devnet.yml    # Manual devnet deployment
├── blockbite/               ← ALL Anchor commands run from HERE
│   ├── Anchor.toml          # anchor_version = "0.32.1"
│   ├── Cargo.toml           # workspace: programs/blockbite
│   ├── programs/blockbite/src/
│   │   ├── lib.rs           # 5 instructions exposed
│   │   ├── constants.rs     # VGPV + DEV_FEE constants
│   │   ├── errors.rs        # 17 error codes
│   │   ├── utils.rs         # calculate_unlocked + 13 unit tests
│   │   ├── tests_cancel.rs  # Cancel logic unit tests
│   │   ├── state/stream.rs  # StreamAccount (196 bytes)
│   │   └── instructions/
│   │       ├── create_stream.rs
│   │       ├── withdraw.rs
│   │       ├── cancel.rs
│   │       ├── set_milestone.rs
│   │       └── close_stream.rs
│   └── tests/blockbite.ts   # 28 integration tests
└── README.md
```

**Repo root** contains only `.github/`, `AGENTS.md`, `README.md`, `.gitignore`.

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
| Anchor | 0.32.1 (via avm) |
| Rust | stable (1.89.0+) |
| Solana CLI | stable (2.3.0+) |
| Node.js | 20 |
| Package manager | yarn |

## Program ID

`Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` (devnet + localnet)

Defined in `blockbite/programs/blockbite/src/lib.rs` via `declare_id!()`.
Keypair: `blockbite/target/deploy/blockbite-keypair.json` (also GitHub secret `ANCHOR_PROGRAM_KEYPAIR`).

## Architecture

### 5 Instructions

| Instruction | File | Signer | Purpose |
|---|---|---|---|
| `create_stream` | `create_stream.rs` | creator | Deposit tokens into escrow PDA, set vesting schedule |
| `withdraw` | `withdraw.rs` | recipient | Claim pro-rata unlocked tokens (VGPV + dust guard) |
| `cancel` | `cancel.rs` | creator | Cancel stream, split escrow between parties |
| `set_milestone` | `set_milestone.rs` | creator | Unlock cliff-gated vesting by confirming a KPI |
| `close_stream` | `close_stream.rs` | creator | Close settled stream, recover rent SOL |

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
| `MIN_ACTION_INTERVAL` | 2 | Seconds; faster → VGPV strike |
| `MAX_VELOCITY_STRIKES` | 3 | Strikes before `BotDetected` |
| `VELOCITY_RESET_INTERVAL` | 3_600 | Seconds of inactivity to reset strikes |

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
2. **Effects**: Update state (`amount_withdrawn`, `is_cancelled`, VGPV fields)
3. **Interactions**: CPI `token::transfer_checked` / `token::close_account` last

All arithmetic uses `checked_*` or `u128` intermediate — never raw operators.

## Test Count

| Category | Count |
|---|---|
| Rust unit tests (unlock math + cancel logic) | 13 |
| TypeScript integration tests | 28 |
| **Total** | **41** |

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
assert.ok(e.message.includes("BotDetected") || e.message.includes("0x1776"));
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
| `blockbite/target/` | Build artifacts; in `blockbite/.gitignore` |
| `blockbite/node_modules/` | Node deps; in `blockbite/.gitignore` |

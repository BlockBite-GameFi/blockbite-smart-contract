# BlockBite — Agent Instructions

## Project Structure

```
blockbite/                    ← ALL Anchor commands run from HERE
├── Anchor.toml               ← anchor_version = "0.32.1"
├── Cargo.toml                ← workspace: programs/blockbite
├── programs/blockbite/src/   ← Rust program (627 lines, 13 files)
├── tests/blockbite.ts        ← Integration tests (12 tests, 890 lines)
└── package.json              ← yarn, @coral-xyz/anchor ^0.32.1
```

**Repo root** (`/home/raisha/blockbite/`) contains only `.github/workflows/ci.yml` and this `AGENTS.md`.

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

# Deploy to devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

## Toolchain

| Tool | Version |
|------|---------|
| Anchor | 0.32.1 (via avm) |
| Rust | 1.89.0 |
| Solana CLI | stable |
| Node.js | 20 |
| Package manager | yarn |

## Program ID

`6SK4EGRn67JcRaaTP4VT17vShhHDyKpC2EwqhharYTJo` (devnet)

Defined in `lib.rs:14` via `declare_id!()`. Must match keypair in `target/deploy/blockbite-keypair.json`.

## Architecture

### 3 Instructions

| Instruction | File | Purpose |
|-------------|------|---------|
| `create_stream` | `instructions/create_stream.rs` | Creator deposits tokens into PDA escrow |
| `withdraw` | `instructions/withdraw.rs` | Recipient claims unlocked tokens |
| `cancel` | `instructions/cancel.rs` | Creator cancels, prorated split between parties |

### PDA Seeds

| Account | Seeds |
|---------|-------|
| `StreamAccount` | `["stream", creator, recipient, seed]` |
| `EscrowTokenAccount` | `["escrow", stream_key]` |

### Core Math (`utils.rs`)

```rust
// Linear unlock with cliff
unlocked = total_amount × (current_time - start_time) / (end_time - start_time)
// Returns 0 if before start_time or before cliff_time
// Returns total_amount if >= end_time
```

### Security Pattern

All instructions follow **CEI** (Checks-Effects-Interactions):
1. **Checks**: `require!` validations first
2. **Effects**: Update state (`amount_withdrawn`, `is_cancelled`)
3. **Interactions**: CPI `token::transfer_checked` last

All arithmetic uses `checked_*` methods — never raw `+` `-` `*` `/`.

## Test Quirks

### Airdrop Must Be Confirmed

Every `requestAirdrop` in tests must be followed by `confirmTransaction`, or subsequent transactions fail with `Attempt to debit an account but found no record of a prior credit`:

```typescript
const sig = await provider.connection.requestAirdrop(pubkey, amount);
await provider.connection.confirmTransaction(sig, "confirmed");
```

### Program ID Resolution

Tests use `anchor.workspace.blockbite.programId`, **not** hardcoded strings. This auto-resolves to the deployed program ID from the IDL.

### Error Assertion Pattern

Use string matching on `e.message`, not `AnchorError.parse` (unreliable in 0.32.1):

```typescript
assert.ok(e.message.includes("InsufficientUnlockedTokens") || e.message.includes("0x"));
```

### Test Count

| Category | Count |
|----------|-------|
| Rust unit tests (unlock math) | 8 |
| Rust unit tests (cancel logic) | 8 |
| TypeScript integration tests | 12 |

## Dead Code (Safe to Remove)

| File | Reason |
|------|--------|
| `instructions/initialize.rs` | Empty handler, not exposed in `lib.rs` |
| `error.rs` | Legacy, superseded by `errors.rs` |
| `constants.rs` | Only defines unused `SEED = "anchor"` |

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):
- Triggers: push/PR to `master` or `main`
- Single job: `smart-contract` (build + test)
- Required secret: `ANCHOR_PROGRAM_KEYPAIR` (optional, falls back to ephemeral key)
- All steps use `working-directory: ./blockbite`

## Local Validator Issues

`solana-test-validator` may crash on low-RAM machines (Celeron 2-core, 8GB). If `anchor test` fails with `Internal error` on airdrop:

```bash
# Kill any stale validator
pkill solana-test-validator

# Clean ledger and restart
rm -rf test-ledger
anchor test
```

If still failing, push to GitHub — CI runner (8-core, 32GB) handles it reliably.

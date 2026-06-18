# Setup Guide — BlockBite

Complete guide to set up the BlockBite development environment, run the test suites, and deploy to devnet.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Rust** | 1.91.0+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Solana CLI** | stable (2.3.0+) | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` |
| **Anchor CLI** | 1.0.0 | `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force && avm install 1.0.0 && avm use 1.0.0` |
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org) |
| **Yarn** | 1.22+ | `npm install -g yarn` |

Verify:

```bash
rustc --version        # rustc 1.91.0 or newer
solana --version       # solana-cli 2.3.0 or newer
anchor --version       # anchor-cli 1.0.0
node --version         # v20.x or newer
```

---

## Clone & Install

```bash
git clone https://github.com/BlockBite-GameFi/blockbite-smart-contract.git
cd blockbite-smart-contract
yarn install --frozen-lockfile
```

---

## Wallet Configuration

```bash
# Generate a new keypair (skip if you already have one at ~/.config/solana/id.json)
solana-keygen new --outfile ~/.config/solana/id.json

# Point at devnet
solana config set --url devnet

# Fund for testing
solana airdrop 2

# Check balance
solana balance
```

---

## Build

```bash
anchor build
```

Produces:
- `target/deploy/blockbite.so` — compiled BPF program
- `target/idl/blockbite.json` — IDL for clients
- `target/types/blockbite.ts` — TypeScript types

---

## Run Tests

The test suite has two layers: pure-logic Rust unit tests (no validator needed) and full integration tests that spin up a local validator via **Surfpool**.

### Rust unit tests (no validator)

```bash
cargo test --package blockbite --lib
```

Expected: **79 passed; 0 failed** (covers `calculate_unlocked`, cancel, campaign, edge cases, and pure logic).

### TypeScript integration tests (with validator)

```bash
anchor test
```

This uses `anchor test --skip-local-validator` after the CI installs Surfpool — a Solidity-compatible local validator that works around the blockhash issues `solana-test-validator` has on Anchor 1.0.0.

Expected: **28 passing**.

### One-liner (CI uses this)

```bash
make test            # runs cargo test --package blockbite --lib
make test-surfpool   # spins up Surfpool, then runs anchor test
```

---

## Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

Program ID: `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

Verify:

```bash
solana program show Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq --url devnet
```

For production deploys, prefer the GitHub Actions workflow: **Actions → "Deploy to Devnet" → Run workflow → type `deploy`**. It uses a two-phase `solana program write-buffer` + atomic upgrade, with cleanup on failure to recover the ~2.6 SOL buffer rent.

---

## Program IDs

| Network | Program ID |
|---------|-----------|
| **Devnet** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Localnet** | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |

Both are declared in `Anchor.toml` and synced at build time via `anchor keys sync`.

---

## Makefile Targets

```bash
make build            # cargo build --package blockbite
make test             # alias for test-unit
make test-unit        # cargo test --package blockbite --lib
make test-surfpool    # run full anchor test suite on Surfpool
make coverage         # llvm-cov report (excludes _dispatch.rs)
make coverage-strict  # llvm-cov report (excludes _dispatch.rs + lib.rs)
make coverage-html    # HTML report → target/coverage/
make fmt              # cargo fmt --all
make fmt-check        # cargo fmt --all -- --check
make clippy           # cargo clippy --package blockbite --all-targets -- -D warnings
```

> **Deploy is not a Makefile target** — run `anchor deploy --provider.cluster devnet` directly, or use the CI workflow.

---

## CI/CD

| Workflow | Trigger | What runs |
|----------|---------|-----------|
| `ci.yml` | Push / PR to `main` | Rust build + 79 unit tests + 28 integration tests (uses Surfpool) |
| `deploy-devnet.yml` | Manual `workflow_dispatch` with `confirm: "deploy"` | Two-phase devnet deploy via Helius RPC |

Required secrets: `ANCHOR_PROGRAM_KEYPAIR`, `DEVNET_DEPLOYER_KEYPAIR`.

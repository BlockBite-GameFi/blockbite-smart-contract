# Setup Guide

This guide gets your development environment ready to build with or test BlockBite locally.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Rust** | 1.89.0+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Solana CLI** | 2.3.0+ | `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"` |
| **Anchor CLI** | 1.0.0+ | `cargo install --git https://github.com/coral-xyz/anchor anchor-cli` |
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org) |
| **Yarn** | 1.22+ | `npm install -g yarn` |

Verify installations:

```bash
rustc --version        # rustc 1.89.0 or higher
solana --version       # solana-cli 2.3.0 or higher
anchor --version       # anchor-cli 1.0.0 or higher
node --version         # v20.x or higher
```

---

## Clone & Install

```bash
git clone https://github.com/mancer-s1-team-2/token-distribution.git
cd token-distribution
yarn install
```

---

## Configure Solana Wallet

Generate a local keypair if you don't have one:

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

Set the cluster to devnet:

```bash
solana config set --url devnet
```

Fund your devnet wallet (airdrop 2 SOL):

```bash
solana airdrop 2
```

Verify balance:

```bash
solana balance
# Expected: 2 SOL
```

---

## Build the Program

```bash
anchor build
```

This compiles the Rust program and generates the IDL at `target/idl/blockbite.json`.

---

## Run Tests

### Rust Unit Tests (no validator needed)

```bash
cargo test -p blockbite
```

Expected output:
```
running 13 tests
test tests::test_init_stream_happy_path ... ok
test tests::test_linear_at_50_percent ... ok
test tests::test_cliff_25_percent_after_cliff ... ok
...
test result: ok. 13 passed; 0 failed
```

### TypeScript Integration Tests (requires local validator)

Start the validator (terminal 1):
```bash
solana-test-validator --reset
```

Run tests (terminal 2):
```bash
anchor test --skip-local-validator
```

Or run everything in one command (Anchor starts its own validator):
```bash
anchor test
```

Expected output:
```
BlockBite
  Stream Vesting
    ✓ creates a stream (1200ms)
    ✓ recipient can withdraw vested tokens (800ms)
    ✓ creator can cancel a stream (900ms)
    ...
  Campaign & Rewards
    ✓ creates a campaign (700ms)
    ✓ game server can verify achievement (600ms)
    ✓ player can claim milestone reward (500ms)
  28 passing (45s)
```

---

## Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

The program ID will be:
```
Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
```

Verify the deployment:
```bash
solana program show Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
```

---

## Environment Variables

For CI/CD deployments, set these secrets:

| Variable | Description |
|----------|-------------|
| `ANCHOR_PROGRAM_KEYPAIR` | Base64-encoded program keypair (for `anchor deploy`) |
| `DEVNET_DEPLOYER_KEYPAIR` | Base64-encoded wallet keypair for paying deployment fees |

---

## Anchor.toml Reference

```toml
[toolchain]

[features]
resolution = true
skip-lint = false

[programs.localnet]
blockbite = "9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX"

[programs.devnet]
blockbite = "Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

# Setup Guide — BlockBite

Panduan lengkap untuk setup environment development dan deploy BlockBite.

---

## Prasyarat

| Tool | Versi | Install |
|------|-------|---------|
| **Rust** | 1.89.0+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Solana CLI** | 2.3.0+ | `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"` |
| **Anchor CLI** | 1.0.0 | `cargo install --git https://github.com/coral-xyz/anchor anchor-cli` |
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org) |
| **Yarn** | 1.22+ | `npm install -g yarn` |

Verifikasi:

```bash
rustc --version      # rustc 1.89.0 atau lebih baru
solana --version     # solana-cli 2.3.0 atau lebih baru
anchor --version     # anchor-cli 1.0.0 atau lebih baru
node --version       # v20.x atau lebih baru
```

---

## Clone & Install

```bash
git clone https://github.com/BlockBite-GameFi/blockbite-smart-contract.git
cd blockbite-smart-contract
yarn install
```

---

## Konfigurasi Wallet

```bash
# Generate keypair baru (jika belum ada)
solana-keygen new --outfile ~/.config/solana/id.json

# Set cluster ke devnet
solana config set --url devnet

# Airdrop SOL untuk testing
solana airdrop 2

# Verifikasi saldo
solana balance
```

---

## Build

```bash
anchor build
```

Menghasilkan:
- `target/deploy/blockbite.so` — compiled BPF program
- `target/idl/blockbite.json` — IDL untuk client
- `target/types/blockbite.ts` — TypeScript types

---

## Jalankan Tests

### Rust Unit Tests (tanpa validator)

```bash
cargo test -p blockbite
```

Output yang diharapkan:
```
running 83 tests
test tests::test_linear_at_50_percent ... ok
test tests::test_cliff_25_percent_after_cliff ... ok
...
test result: ok. 83 passed; 0 failed
```

### TypeScript Integration Tests

```bash
anchor test
```

Output yang diharapkan:
```
BlockBite
  ✓ creates a stream (1200ms)
  ✓ recipient can withdraw vested tokens (800ms)
  ✓ creator can cancel a stream (900ms)
  ...
  32 passing (45s)
```

---

## Deploy ke Devnet

```bash
anchor deploy --provider.cluster devnet
```

Program ID devnet: `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

Verifikasi:
```bash
solana program show Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
```

---

## Program IDs

| Network | Program ID |
|---------|-----------|
| **Devnet** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Localnet** | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |

---

## Makefile Commands

```bash
make build    # anchor build
make test     # anchor test
make deploy   # anchor deploy --provider.cluster devnet
make lint     # cargo clippy
```

---

## CI/CD

| Workflow | Trigger | Apa yang Dijalankan |
|----------|---------|---------------------|
| `ci.yml` | Push/PR ke main | Build, Rust tests (83), TypeScript tests (32) |
| `deploy-devnet.yml` | Manual dispatch | `anchor deploy` ke devnet |

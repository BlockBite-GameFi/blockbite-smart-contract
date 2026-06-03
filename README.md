# BlockBite

> **Automated, milestone-based token vesting on Solana.**
> A composable Token Distribution Protocol (TDP): Cliff + Milestone + Linear streaming, oracle-agnostic.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF.svg)](https://solana.com)
[![Anchor](https://img.shields.io/badge/Anchor-0.32.1-blue.svg)](https://www.anchor-lang.com)

**Live:** https://blockbite.vercel.app · **Waitlist:** https://blockbite.vercel.app/waitlist

> 🇮🇩 **Bahasa Indonesia:** lihat [bagian bawah](#-blockbite-bahasa-indonesia).

---

## Quick Info

| Item | Value |
|------|-------|
| Program ID (Devnet) | `DvhxiL5PF8Cq3icqcjdbQvtMhJcj6LWheUgovRpaXTFf` |
| Framework | Anchor 0.32.1 |
| Network | Solana Devnet |
| Frontend | Next.js 14 — [blockbite.vercel.app](https://blockbite.vercel.app) |
| Tests | 30+ Anchor integration tests (ts-mocha + chai) |
| License | MIT |

---

## Features

- **Cliff + Linear Vesting** — tokens unlock linearly between `start_ts` and `end_ts`, with an optional cliff gate.
- **Milestone Quotas** — up to 4 milestones (allocation % summing to 100), each unlocked by `verify_milestone`.
- **Proof-of-Activity Oracle** — `required_tier` gates streams against a `ProofCache` tier written by a game CPI or admin.
- **Prorated Cancellation** — `cancel` splits vested vs. unvested with a verified conservation law.
- **VGPV Anti-Bot** — velocity-gated proof validation with a 3-strike limit.
- **Trustless & On-Chain** — beneficiaries pull their own tokens; no manual transfers.

**TDP is the product. The game is one oracle plugin.** Vesting that doesn't need a game oracle simply sets `required_tier = 0`.

---

## Architecture

3-tier unlock model — every withdrawal passes all gates that apply to the stream:

```
creator → vault (locked)
              ↓
  [Tier 1] cliff_ts passed?               NO → 0 unlocked
              ↓ YES
  [Tier 2] tier_reached >= required_tier? NO → MilestoneNotMet
              ↓ YES
  [Tier 3] linear streaming               → unlock(t) per second
              ↓
beneficiary ← vault (claimed)
```

Two independent unlock sources can be combined per stream:
- **Source A — Proof tier** (`required_tier` vs `ProofCache.tier_reached`): written by a game CPI on level complete, or by an admin.
- **Source B — Milestone quota** (`milestone_pct[]`, `milestones_verified[]`): set by the authority via `configure_milestones`, released via `verify_milestone`.

---

## Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| Rust | stable |
| Solana CLI | >= 1.18 |
| Anchor CLI | 0.32.1 |

### Frontend

```bash
npm install
cp .env.local.example .env.local   # fill in your keys
npm run dev                         # http://localhost:3000
```

### Smart contract

```bash
anchor build                                  # compile to SBPF bytecode
anchor test                                   # run all tests on localnet
anchor deploy --provider.cluster devnet       # deploy to devnet
```

---

## Program Instructions

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `create_stream` | creator | Lock tokens; set cliff, end, required tier |
| `configure_milestones` | authority | Define up to 4 milestone allocation percentages (sum = 100) |
| `verify_milestone` | authority | Mark a milestone index as released |
| `withdraw` | beneficiary | Claim linearly unlocked tokens (respects cliff + milestone) |
| `cancel` | creator | Atomically split vested/unvested; close the stream |
| `fund_vault` | anyone | Deposit revenue with a 70/15/10/5 split |
| `update_proof` | admin | Write player activity tier into the `ProofCache` PDA |

Full parameter reference: [`docs/INSTRUCTION_REFERENCE.md`](docs/INSTRUCTION_REFERENCE.md).

---

## Account Structure

**`StreamAccount`** — `LEN = 165` bytes (+ 8-byte discriminator):

| Group | Fields |
|-------|--------|
| Core identity | `authority`, `beneficiary`, `mint` (32 each), `stream_id` (u64) |
| Vesting schedule | `amount_total`, `amount_withdrawn` (u64), `start_ts`, `cliff_ts`, `end_ts` (i64) |
| State flags | `cancelled` (bool), `bump` (u8) |
| VGPV anti-bot | `velocity_strikes` (u8), `last_action_ts` (i64) |
| Proof tier | `required_tier` (u8) |
| Milestone quota | `milestone_count` (u8), `milestones_verified` (`[bool; 4]`), `milestone_pct` (`[u8; 4]`) |

**`ProofCache`** — `LEN = 76` bytes: one PDA per `(stream, player)`, tracking `tier_reached`, `last_proof_ts`, and VGPV `velocity_strikes`.

**Events:** `StreamCreated`, `MilestonesConfigured`, `MilestoneVerified`, `Withdrawn`, `Cancelled`, `VaultFunded`, `ProofUpdated`.

---

## Unlock Calculation

Implemented in `StreamAccount::unlocked_amount()` with `u128` intermediate arithmetic (overflow-safe for any token supply):

```
unlock(t):
  t < cliff_ts  → 0          (cliff gate)
  t < start_ts  → 0
  t >= end_ts   → amount_total (fully vested)
  otherwise     → amount_total * (t - start_ts) / (end_ts - start_ts)
```

**Cancel invariant:**

```
claimable + return_to_creator + amount_withdrawn = amount_total
```

Before `cliff_ts`, 100% of unvested tokens return to the creator; after partial vest, the split is linearly proportional. A fully-vested stream cannot be cancelled (`FullyVested`).

---

## Error Codes

| Error | Condition |
|-------|-----------|
| `ZeroAmount` | amount == 0 |
| `InvalidTimeRange` | `end_ts <= start_ts` |
| `InvalidCliff` | `cliff_ts` outside `[start_ts, end_ts]` (or 0) |
| `NothingToWithdraw` | nothing unlocked yet |
| `Unauthorized` | wrong signer |
| `AlreadyCancelled` | stream already cancelled |
| `FullyVested` | cannot cancel a fully-vested stream |
| `MilestoneNotMet` | `tier_reached < required_tier` |
| `MilestoneNotVerified` | milestone quota not yet unlocked |
| `InvalidMilestoneIndex` | milestone index out of range |
| `InvalidMilestonePct` | milestone percentages don't sum to 100 |
| `MilestoneAlreadyConfigured` | milestones already configured |
| `Overflow` | arithmetic overflow |
| `VelocityViolation` | VGPV velocity threshold exceeded |
| `InvalidTier` | tier not in {0, 1, 2} |
| `StreamExpired` | stream past `end_ts` |

---

## Project Structure

```
blockblast/
├── programs/
│   └── blockbite-vesting/      # Anchor program (Rust) — src/lib.rs
├── tests/                      # ts-mocha integration tests
├── app/                        # Next.js 14 App Router (game oracle, dashboard, waitlist)
├── components/                 # React UI components
├── lib/                        # Solana client, anchor helpers, game engine
├── public/                     # Static assets
├── styles/                     # Global styles
├── supabase/                   # Database schema / migrations
├── docs/                       # Architecture, integration & reference docs
│   └── archive/                # Historical sprint reports
├── Anchor.toml
├── package.json
└── LICENSE
```

---

## Testing

30+ Anchor integration tests (ts-mocha + chai) cover the full lifecycle:

- `create_stream` locks tokens atomically
- Linear unlock at 25% / 50% / 100% of duration
- Cliff gate, milestone gating (`MilestoneNotMet`), and milestone release
- `withdraw` partial + cumulative; `NothingToWithdraw`, `Unauthorized`
- `cancel` mid-stream (prorated split, conservation law verified), double-cancel (`AlreadyCancelled`), `FullyVested`
- VGPV field verification, `fund_vault` 70/15/10/5 split, `update_proof` admin write

```bash
anchor test        # runs all tests on localnet
```

---

## CI/CD Pipeline

| Workflow | File | Runs |
|----------|------|------|
| Anchor CI | `.github/workflows/ci.yml` | `anchor build` + `anchor test` on push to `main`/`master` and every PR |
| Security Audit | `.github/workflows/security.yml` | `npm audit` + `cargo audit` on push/PR to `main` |
| Deploy | `.github/workflows/deploy.yml` | Vercel production deploy on push to `main`/`master` |

---

## Security

- Checks-Effects-Interactions (CEI) pattern in `cancel()` and `withdraw()`
- PDA ownership validated on all instructions
- `u128` intermediate arithmetic in `unlocked_amount()` (overflow-safe)
- No-token-loss invariant in `fund_vault()` (floor arithmetic; dust → vault)
- VGPV bot detection: minimum interval between proof updates, 3-strike limit
- Upgrade authority will be burned before mainnet (currently upgradeable)

Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md). Do **not** open a public issue.

## Documentation

- [`docs/INSTRUCTION_REFERENCE.md`](docs/INSTRUCTION_REFERENCE.md) — full instruction reference
- [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md) — frontend integration guide
- [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) — architecture decision records
- [`docs/AUDIT_TDP_ARCHITECTURE.md`](docs/AUDIT_TDP_ARCHITECTURE.md) — 3-tier architecture audit
- [`docs/TDP_FIRST_ARCHITECTURE.md`](docs/TDP_FIRST_ARCHITECTURE.md) — TDP pivot narrative & mathematics
- [`docs/SECURITY_CHECKLIST.md`](docs/SECURITY_CHECKLIST.md) — security checklist
- [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT — see [`LICENSE`](LICENSE).

---
---

# 🇮🇩 BlockBite (Bahasa Indonesia)

> **Vesting token otomatis berbasis milestone di Solana.**
> Token Distribution Protocol (TDP) yang komposabel: streaming Cliff + Milestone + Linear, oracle-agnostic.

**Live:** https://blockbite.vercel.app · **Waitlist:** https://blockbite.vercel.app/waitlist

## Info Singkat

| Item | Nilai |
|------|-------|
| Program ID (Devnet) | `DvhxiL5PF8Cq3icqcjdbQvtMhJcj6LWheUgovRpaXTFf` |
| Framework | Anchor 0.32.1 |
| Jaringan | Solana Devnet |
| Frontend | Next.js 14 — [blockbite.vercel.app](https://blockbite.vercel.app) |
| Test | 30+ test integrasi Anchor (ts-mocha + chai) |
| Lisensi | MIT |

## Fitur

- **Cliff + Vesting Linear** — token terbuka secara linear antara `start_ts` dan `end_ts`, dengan gerbang cliff opsional.
- **Kuota Milestone** — hingga 4 milestone (alokasi % berjumlah 100), tiap milestone dibuka lewat `verify_milestone`.
- **Oracle Proof-of-Activity** — `required_tier` menggerbangi stream terhadap tier `ProofCache` yang ditulis oleh CPI game atau admin.
- **Pembatalan Proporsional** — `cancel` membagi porsi ter-vest vs belum, dengan hukum kekekalan yang terverifikasi.
- **Anti-Bot VGPV** — validasi proof bergerbang kecepatan dengan batas 3 strike.
- **Trustless & On-Chain** — penerima menarik tokennya sendiri; tanpa transfer manual.

**TDP adalah produknya. Game hanyalah salah satu plugin oracle.** Vesting yang tidak butuh oracle game cukup menyetel `required_tier = 0`.

## Arsitektur

Model unlock 3-tingkat — setiap penarikan melewati semua gerbang yang berlaku:

```
creator → vault (terkunci)
              ↓
  [Tier 1] cliff_ts terlewati?            TIDAK → 0 terbuka
              ↓ YA
  [Tier 2] tier_reached >= required_tier? TIDAK → MilestoneNotMet
              ↓ YA
  [Tier 3] streaming linear               → unlock(t) per detik
              ↓
penerima ← vault (diklaim)
```

## Mulai Cepat

### Prasyarat

Node.js >= 18, Rust stable, Solana CLI >= 1.18, Anchor CLI 0.32.1.

### Frontend

```bash
npm install
cp .env.local.example .env.local   # isi key Anda
npm run dev                         # http://localhost:3000
```

### Smart contract

```bash
anchor build                                  # kompilasi ke bytecode SBPF
anchor test                                   # jalankan semua test di localnet
anchor deploy --provider.cluster devnet       # deploy ke devnet
```

## Instruksi Program

| Instruksi | Penandatangan | Deskripsi |
|-----------|---------------|-----------|
| `create_stream` | creator | Kunci token; set cliff, end, required tier |
| `configure_milestones` | authority | Tetapkan hingga 4 persentase alokasi milestone (jumlah = 100) |
| `verify_milestone` | authority | Tandai indeks milestone sebagai dirilis |
| `withdraw` | penerima | Klaim token yang terbuka linear (menghormati cliff + milestone) |
| `cancel` | creator | Bagi vested/unvested secara atomik; tutup stream |
| `fund_vault` | siapa pun | Setor pendapatan dengan pembagian 70/15/10/5 |
| `update_proof` | admin | Tulis tier aktivitas pemain ke PDA `ProofCache` |

Referensi parameter lengkap: [`docs/INSTRUCTION_REFERENCE.md`](docs/INSTRUCTION_REFERENCE.md).

## Perhitungan Unlock

Diimplementasikan di `StreamAccount::unlocked_amount()` dengan aritmetika perantara `u128` (aman dari overflow):

```
unlock(t):
  t < cliff_ts  → 0           (gerbang cliff)
  t < start_ts  → 0
  t >= end_ts   → amount_total (vest penuh)
  selain itu    → amount_total * (t - start_ts) / (end_ts - start_ts)
```

**Invarian pembatalan:** `claimable + return_to_creator + amount_withdrawn = amount_total`. Sebelum `cliff_ts`, 100% token belum ter-vest kembali ke creator; setelah vest sebagian, pembagiannya proporsional linear. Stream yang sudah vest penuh tidak bisa dibatalkan (`FullyVested`).

## Kode Error

16 varian error didefinisikan di `VestingError` — antara lain `ZeroAmount`, `InvalidTimeRange`, `InvalidCliff`, `NothingToWithdraw`, `Unauthorized`, `AlreadyCancelled`, `FullyVested`, `MilestoneNotMet`, `MilestoneNotVerified`, `InvalidMilestoneIndex`, `InvalidMilestonePct`, `MilestoneAlreadyConfigured`, `Overflow`, `VelocityViolation`, `InvalidTier`, `StreamExpired`. Lihat tabel lengkap di [versi Inggris](#error-codes).

## Pengujian

30+ test integrasi Anchor mencakup siklus penuh: penguncian token, unlock linear (25%/50%/100%), gerbang cliff & milestone, penarikan parsial/kumulatif, pembatalan tengah-stream (pembagian proporsional dengan hukum kekekalan), serta verifikasi VGPV dan `fund_vault`.

```bash
anchor test        # jalankan semua test di localnet
```

## Keamanan

Pola CEI pada `cancel()` & `withdraw()`, validasi kepemilikan PDA, aritmetika `u128` anti-overflow, invarian tanpa kehilangan token pada `fund_vault()`, deteksi bot VGPV (batas 3 strike), dan upgrade authority yang akan dibakar sebelum mainnet.

Laporkan kerentanan secara privat — lihat [`SECURITY.md`](SECURITY.md). **Jangan** buka issue publik.

## Lisensi

MIT — lihat [`LICENSE`](LICENSE).

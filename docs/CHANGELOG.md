# Changelog — BlockBite

Ringkasan perubahan per minggu pengembangan dalam program Mancer S1.

---

## Week 9 — Dokumentasi (2026-06-15)

**Fokus:** Dokumentasi lengkap untuk developer eksternal.

- Tambah `docs/PROGRAM.md` — referensi lengkap semua 9 instruksi dengan parameter, accounts, errors, TypeScript snippets
- Tambah `docs/INTEGRATION.md` — panduan integrasi step-by-step
- Tambah `docs/STREAM_MODEL.md` — layout byte field-by-field StreamAccount, CampaignAccount, MilestoneAccount + lifecycle diagram
- Tambah `docs/ARCHITECTURE_DECISIONS.md` — 6 Architecture Decision Records
- Tambah `docs/ERROR_MAP.md` — 21 error codes dengan kondisi dan cara mengatasi
- Tambah `docs/CLIFF_VESTING.md` — penjelasan `calculate_unlocked`, 4 mode vesting, 20 edge cases
- Tambah `docs/SETUP.md` — prerequisites, build, test, deploy guide
- Tambah `docs-site/` (VitePress) — public-facing documentation site
- Tambah `docs/TESTING.md` — test suite breakdown
- Tambah `docs/SECURITY_CHECKLIST.md` — full security audit
- 83 Rust unit tests, 32 TypeScript integration tests (total 115 — all green)

---

## Week 8 — Campaign & Game Reward System

**Fokus:** Subsistem kedua — game publisher bisa bikin campaign, game server verifikasi achievement player.

- Tambah instruksi `create_campaign`, `create_milestone`, `verify_game`, `claim_milestone`
- Tambah `CampaignAccount` (PDA) + `CampaignEscrow` (vault)
- Tambah `MilestoneAccount` (PDA) dengan `is_verified` dan `is_claimed` idempotency guard
- `verify_game` requires signature dari `game_authority` keypair (server-side oracle)
- `title_hash` dan `description_hash` menggunakan SHA-256 32-byte on-chain, konten lengkap off-chain
- Error codes 6010–6020 untuk subsistem campaign
- 32 TypeScript integration tests (naik dari 17 di Week 7; +4 close_stream tests di Week 9)

---

## Week 7 — Security Audit & Hardening

**Fokus:** Audit keamanan dan perbaikan temuan kritis.

- Terapkan CEI pattern (Checks-Effects-Interactions) di semua instruksi yang melakukan CPI
- Semua arithmetic menggunakan `checked_*` ops atau `u128` intermediate untuk cegah overflow
- Tambah validasi `creator != recipient` di `create_stream`
- Tambah `is_cancelled` guard di `withdraw` dan `cancel`
- Tambah `StreamNotSettled` guard di `close_stream`
- Full security checklist tersedia di `SECURITY_CHECKLIST.md`
- 17 TypeScript integration tests (naik dari 11 di Week 6)

---

## Week 6 — Cliff Vesting & Milestone Gate

**Fokus:** Empat mode vesting selesai diimplementasi.

- Tambah `cliff_time` field di `StreamAccount` (`0` = no cliff)
- Tambah `milestone_enabled` + `milestone_reached` boolean flags
- `calculate_unlocked()` di `utils.rs` menangani 4 kombinasi: Pure Linear, Cliff, Milestone, Cliff+Milestone
- `set_milestone` instruksi untuk one-way flip `milestone_reached = true`
- 20 Rust unit tests di `utils.rs` untuk semua edge case `calculate_unlocked`
- Dispatch pattern: pisah `_dispatch.rs` (Anchor boilerplate) dari pure functions (testable tanpa BPF)

---

## Week 5 — Dual PDA Architecture & Cancel

**Fokus:** Trustless escrow dan prorated cancellation.

- Arsitektur dual PDA: `StreamAccount` (state) + `EscrowTokenAccount` (vault, authority = stream PDA)
- `cancel` instruksi dengan prorated split berdasarkan `calculate_unlocked(stream, now)`
- `close_stream` instruksi untuk recover rent setelah settled
- Token transfer via PDA-signed CPI (`token::transfer_checked` dengan signer seeds)

---

## Week 3 — Core Stream Vesting (MVP)

**Fokus:** Stream vesting fungsional pertama.

- `create_stream` + `withdraw` instruksi
- `StreamAccount` PDA dengan seeds `["stream", creator, recipient, seed_le8]`
- Pull model: recipient withdraw sendiri, bukan creator push
- Program ID devnet: `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

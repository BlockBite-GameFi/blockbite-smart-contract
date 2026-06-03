# Contributing to BlockBite

Thanks for your interest in contributing! This document explains how to set up
the project, our branch and commit conventions, and how to open a pull request.

> 🇮🇩 Versi Bahasa Indonesia ada di [bagian bawah](#-panduan-kontribusi-bahasa-indonesia).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| Rust | stable |
| Solana CLI | >= 1.18 |
| Anchor CLI | 0.32.1 |

## Local setup

```bash
# 1. Install JS dependencies
npm install

# 2. Build the Solana program
anchor build

# 3. Run the program test suite (localnet)
anchor test

# 4. Run the frontend
npm run dev        # http://localhost:3000
```

Copy `.env.local.example` to `.env.local` and fill in the required keys before
running the frontend.

## Branch naming

| Prefix | Use for |
|--------|---------|
| `feat/` | new features |
| `fix/` | bug fixes |
| `docs/` | documentation only |
| `chore/` | tooling, deps, repo hygiene |
| `test/` | tests only |

Branch off `main`. Example: `feat/milestone-release`.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

feat(program): add instant_refund instruction
fix(api): handle missing KV key in /api/score/sign
docs(readme): document devnet verification steps
```

## Pull request process

1. Fork or branch off `main`.
2. Keep changes focused — one logical change per PR.
3. Ensure `anchor test` and `npm run build` pass locally.
4. Fill in the PR template (it loads automatically).
5. Link any related issue.
6. A maintainer reviews and merges.

## Code style

- **Rust** — `cargo fmt` and `cargo clippy` clean before pushing.
- **TypeScript** — keep imports ordered; match surrounding style.
- Never commit secrets, keypairs, or `.env*` files.

## AI tooling disclosure

This project uses AI coding assistants. All AI-generated code is reviewed by a
human maintainer before merge. See [`CONTRIBUTORS.md`](CONTRIBUTORS.md) and
[`CLAUDE.md`](CLAUDE.md).

---

## 🇮🇩 Panduan Kontribusi (Bahasa Indonesia)

Terima kasih atas minat Anda untuk berkontribusi! Dokumen ini menjelaskan cara
menyiapkan proyek, konvensi branch & commit, serta cara membuka pull request.

### Prasyarat

| Alat | Versi |
|------|-------|
| Node.js | >= 18 |
| Rust | stable |
| Solana CLI | >= 1.18 |
| Anchor CLI | 0.32.1 |

### Penyiapan lokal

```bash
npm install        # pasang dependency JS
anchor build       # build program Solana
anchor test        # jalankan test program (localnet)
npm run dev        # jalankan frontend di http://localhost:3000
```

Salin `.env.local.example` menjadi `.env.local` dan isi key yang diperlukan
sebelum menjalankan frontend.

### Penamaan branch

Gunakan awalan: `feat/`, `fix/`, `docs/`, `chore/`, `test/`. Branch dibuat dari
`main`. Contoh: `feat/milestone-release`.

### Pesan commit

Mengikuti [Conventional Commits](https://www.conventionalcommits.org/), contoh:
`feat(program): tambah instruksi instant_refund`.

### Proses pull request

1. Branch dari `main`, satu perubahan logis per PR.
2. Pastikan `anchor test` dan `npm run build` lulus secara lokal.
3. Isi template PR yang muncul otomatis.
4. Tautkan issue terkait bila ada.
5. Maintainer akan mereview dan melakukan merge.

### Catatan penting

Jangan pernah commit secret, keypair, atau file `.env*`. Kode hasil bantuan AI
ditinjau oleh maintainer manusia sebelum di-merge.

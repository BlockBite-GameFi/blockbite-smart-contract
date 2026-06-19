# Architecture Decision Records — BlockBite

Catatan keputusan desain yang signifikan: apa yang diputuskan, mengapa, alternatif yang dipertimbangkan, dan konsekuensinya.

---

## ADR-001: Model "Pull" — Recipient Withdraw, Bukan Creator Push

**Status:** Accepted  
**Tanggal:** Desember 2025

### Konteks

Ada dua cara untuk mendistribusikan token yang sudah vest:
- **Push model**: Creator secara aktif mengirim token ke recipient sesuai jadwal
- **Pull model**: Recipient menarik token yang sudah unlock kapan pun mereka mau

### Keputusan

BlockBite menggunakan **Pull model**: setelah `create_stream`, creator tidak perlu melakukan apapun lagi. Recipient memanggil `withdraw` sendiri untuk klaim token.

### Alternatif yang Dipertimbangkan

| Opsi | Pro | Kontra |
|------|-----|--------|
| **Push (creator transfer)** | Creator punya kontrol penuh timing | Single point of failure; jika creator offline/curang, recipient tidak dapat token |
| **Pull (dipilih)** | Trustless; tidak perlu intervensi creator setelah stream dibuat | Recipient harus aktif memanggil withdraw |
| **Cron-bot** | Otomatis tanpa aksi user | Butuh infrastruktur off-chain; centralized; biaya operasional |

### Konsekuensi

**Positif:**
- Creator tidak bisa "tahan" token setelah stream dibuat — token terkunci di escrow PDA
- Recipient bebas klaim kapan saja (bisa batch beberapa periode sekaligus)
- Tidak ada single point of failure; protocol berjalan selama Solana hidup

**Negatif:**
- Recipient harus punya SOL untuk bayar fee transaksi saat withdraw
- Jika recipient tidak pernah withdraw, token tetap di escrow (tapi aman)

---

## ADR-002: PDA-Owned Escrow Token Account, Bukan Custodial Wallet

**Status:** Accepted  
**Tanggal:** Desember 2025

### Konteks

Token yang di-vest harus disimpan di suatu tempat yang:
1. Tidak bisa diambil creator setelah stream dibuat
2. Hanya bisa dikeluarkan oleh program melalui instruksi yang valid
3. Kompatibel dengan SPL Token standard

### Keputusan

Gunakan **dual PDA architecture**:
- `StreamAccount` (state PDA): menyimpan metadata stream
- `EscrowTokenAccount` (token PDA): vault SPL token dengan authority = StreamAccount PDA

```
Seeds StreamAccount: ["stream", creator, recipient, seed_le8]
Seeds EscrowAccount: ["escrow", stream_pda]
Authority escrow:     StreamAccount PDA (bukan keypair manusia)
```

Transfer dari escrow ke recipient dilakukan via **program-signed CPI**:
```rust
let seeds = &[b"stream", creator.as_ref(), recipient.as_ref(),
               &stream.seed.to_le_bytes(), &[stream.bump]];
let signer_seeds = &[&seeds[..]];
token::transfer_checked(CpiContext::new_with_signer(..., signer_seeds), amount, decimals)?;
```

### Alternatif yang Dipertimbangkan

| Opsi | Pro | Kontra |
|------|-----|--------|
| **Admin keypair custodial** | Sederhana | Admin bisa kabur dengan dana; bukan trustless |
| **Creator sebagai authority** | Tanpa PDA tambahan | Creator bisa drain escrow kapan saja |
| **PDA-owned escrow (dipilih)** | Trustless; hanya program yang bisa keluarkan token | Dua akun per stream (~0.004 SOL rent), recovered saat close |

### Konsekuensi

**Positif:**
- Sepenuhnya trustless — tidak ada admin key, tidak ada upgrade authority atas escrow
- Bekerja dengan SPL token apapun (USDC, BONK, token custom)
- Biaya rent recovered saat `close_stream`

**Negatif:**
- Dua akun per stream = ~0.004 SOL cost saat buat stream (dikembalikan saat close)
- Setiap instruksi harus pass kedua PDA sebagai accounts

---

## ADR-003: Prorated Cancel Berbasis `unlocked_amount`, Bukan All-or-Nothing

**Status:** Accepted  
**Tanggal:** Desember 2025

### Konteks

Saat creator membatalkan stream, ada pertanyaan: apa yang terjadi dengan token?

### Keputusan

Gunakan **prorated split berbasis `calculate_unlocked(stream, now)`**:

```
vested_to_recipient   = unlocked - amount_withdrawn
unvested_to_creator   = total_amount - unlocked
```

Bagian yang sudah "earn" oleh recipient (terlepas dari apakah sudah diclaim) **tetap milik recipient**. Hanya bagian yang belum vest yang dikembalikan ke creator.

### Alternatif yang Dipertimbangkan

| Opsi | Deskripsi | Masalah |
|------|-----------|---------|
| **All-or-nothing (creator dapat semua)** | Creator cancel → semua token kembali | Tidak adil; recipient tidak mendapat apapun meski sudah bekerja |
| **All-or-nothing (recipient dapat semua)** | Cancel → recipient dapat semua token | Creator tidak punya insentif untuk cancel jika sudah overcommit |
| **Prorated split (dipilih)** | Berdasarkan waktu yang sudah lewat | Adil untuk kedua pihak; mirror dengan kontrak kerja nyata |

### Mengapa `fully_vested` tidak bisa di-cancel?

Jika `unlocked == total_amount`, `unvested_to_creator = 0`. Cancel tidak memberikan manfaat apapun ke creator dan hanya membuang gas. Program melempar `FullyVested (6008)` untuk mencegah ini.

### Konsekuensi

**Positif:**
- Adil untuk kedua pihak — mencerminkan "earned so far" yang intuitif
- Recipient tidak kehilangan token yang sudah "earned" meski belum withdraw
- Konsisten dengan praktik industri (vesting cliff + linear adalah standar)

**Negatif:**
- Agak lebih kompleks dari all-or-nothing
- Creator perlu memahami bahwa cancel tidak berarti "ambil semua kembali"

---

## ADR-004: `cliff_time = 0` Berarti "No Cliff", Bukan `Option<i64>`

**Status:** Accepted  
**Tanggal:** Desember 2025

### Konteks

Solana account space harus ditetapkan saat init. `Option<i64>` di Anchor membutuhkan 1 byte discriminator + 8 byte value = 9 bytes, dan representasinya lebih kompleks di on-chain.

### Keputusan

Gunakan `cliff_time: i64` dengan konvensi: **nilai `0` berarti tidak ada cliff**.

```rust
// Di calculate_unlocked():
if stream.cliff_time > 0 && current_time < stream.cliff_time {
    return 0; // Cliff belum lewat
}
// cliff_time = 0 → kondisi di atas selalu false → tidak ada cliff
```

### Alternatif yang Dipertimbangkan

| Opsi | Byte | Kompleksitas |
|------|------|-------------|
| `Option<i64>` | 9 | Butuh match/if let di setiap check |
| `i64` dengan `0 = none` (dipilih) | 8 | Check sederhana `> 0` |
| Boolean flag terpisah `has_cliff: bool` + `cliff_time: i64` | 9 | Duplikasi info |

### Konsekuensi

**Positif:**
- Account size lebih kecil (8 vs 9 bytes)
- Logic check lebih sederhana dan mudah di-audit

**Negatif:**
- `0` adalah nilai timestamp Unix yang valid (1 Jan 1970). Namun dalam konteks Solana (timestamp selalu > 1.5B di era modern), `cliff_time = 0` tidak pernah ambigu

---

## ADR-005: CEI Pattern (Checks-Effects-Interactions) di Semua Instruksi

**Status:** Accepted  
**Tanggal:** Desember 2025

### Konteks

Solana program bisa memanggil program lain via CPI (Cross-Program Invocation). Jika state tidak diperbarui sebelum CPI, ada risiko reentrancy — program yang dipanggil bisa re-enter dan memanipulasi state yang masih "stale".

### Keputusan

Setiap instruksi yang melakukan CPI mengikuti urutan **CEI**:
1. **Checks** — validasi semua precondition
2. **Effects** — mutasi state on-chain
3. **Interactions** — CPI (token transfer, dll)

```rust
// Contoh di cancel:
// CHECKS
require!(!stream.is_cancelled, BlockBiteError::AlreadyCancelled);
// EFFECTS — set flag SEBELUM CPI
stream.is_cancelled = true;
// INTERACTIONS — transfer SETELAH state diupdate
token::transfer_checked(cpi_ctx_recipient, vested_amount, decimals)?;
token::transfer_checked(cpi_ctx_creator, unvested_amount, decimals)?;
```

### Konsekuensi

**Positif:**
- Semua instruksi aman dari reentrancy
- Dikonfirmasi di audit keamanan Week 7

**Negatif:**
- Borrow checker Rust memerlukan scoping yang careful (mutable borrow harus di-drop sebelum CPI)

---

## ADR-006: Dispatch Pattern — Pisah Anchor Boilerplate dari Business Logic

**Status:** Accepted  
**Tanggal:** Desember 2025

### Konteks

Anchor `#[derive(Accounts)]` struct hanya bisa dieksekusi di BPF runtime — tidak bisa di-unit test dengan `cargo test` biasa. Mencampur logic bisnis dengan Anchor boilerplate membuat testing lambat (butuh validator).

### Keputusan

Pisah setiap instruksi menjadi **dua file**:

- **`_dispatch.rs`**: Anchor `#[derive(Accounts)]` structs + thin handler wrappers. Dikecualikan dari coverage.
- **`<instruksi>.rs`**: Pure Rust functions (`init_stream`, `compute_withdraw`, dll). Unit-testable tanpa runtime.

```
instructions/
├── _dispatch.rs    ← Anchor boilerplate (exclude dari coverage)
├── create_stream.rs ← pure fn init_stream()
├── withdraw.rs      ← pure fn compute_withdraw()
└── cancel.rs        ← pure fn compute_cancel()
```

### Konsekuensi

**Positif:**
- 13+ Rust unit test berjalan < 1 detik tanpa validator
- Business logic mudah dibaca dan di-audit tanpa memahami Anchor constraints
- Integration test (28 TypeScript) fokus pada account/CPI layer, bukan re-test logic

**Negatif:**
- Dua file per instruksi; developer baru perlu orientasi singkat

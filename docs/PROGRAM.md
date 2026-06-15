# Instruction Reference — BlockBite Program

Program ID (Devnet): `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

BlockBite mengekspos **9 instruksi** yang dibagi menjadi dua subsistem: Stream Vesting dan Campaign & Game Rewards.

---

## Daftar Instruksi

| # | Instruksi | Subsistem | Pemanggil | Deskripsi singkat |
|---|-----------|-----------|-----------|-------------------|
| 1 | `create_stream` | Stream Vesting | Creator | Inisialisasi jadwal vesting, deposit token ke escrow |
| 2 | `withdraw` | Stream Vesting | Recipient | Klaim token yang sudah unlock |
| 3 | `cancel` | Stream Vesting | Creator | Batalkan stream, bagi token secara prorated |
| 4 | `set_milestone` | Stream Vesting | Creator | Buka milestone gate (one-way flip) |
| 5 | `close_stream` | Stream Vesting | Creator | Tutup stream yang sudah selesai, recover rent |
| 6 | `create_campaign` | Campaign | Founder | Buat campaign reward, deposit budget |
| 7 | `create_milestone` | Campaign | Founder | Tambah milestone dengan reward ke campaign |
| 8 | `verify_game` | Campaign | Game Server | Validasi pencapaian level player |
| 9 | `claim_milestone` | Campaign | Player | Klaim reward milestone yang sudah terverifikasi |

---

## 1. `create_stream`

**Fungsi:** Membuat vesting schedule baru antara creator dan recipient, lalu mengunci `total_amount` token ke escrow PDA.

### Parameter

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `total_amount` | `u64` | Jumlah token total yang akan di-vest (dalam unit terkecil). Harus > 0. |
| `start_time` | `i64` | Unix timestamp (detik) awal vesting. |
| `end_time` | `i64` | Unix timestamp (detik) akhir vesting. Harus > `start_time`. |
| `cliff_time` | `i64` | Unix timestamp cliff. Gunakan `0` untuk tanpa cliff. Jika diisi, harus ≤ `end_time`. |
| `seed` | `u64` | Seed unik dari creator untuk derivasi PDA. Memungkinkan banyak stream antar pasangan yang sama. |
| `milestone_enabled` | `bool` | `true` = token terkunci sampai creator panggil `set_milestone`. `false` = pure time-based. |

### Accounts

| Field | Tipe | W | S | Deskripsi |
|-------|------|---|---|-----------|
| `creator` | `Signer` | ✓ | ✓ | Pembayar rent dan sumber token |
| `recipient` | `UncheckedAccount` | — | — | Penerima token (hanya disimpan sebagai pubkey) |
| `mint` | `Mint` | — | — | SPL mint yang di-vest |
| `creator_token_account` | `TokenAccount` | ✓ | — | ATA creator, sumber `total_amount` token |
| `escrow_token_account` | `TokenAccount` | ✓ | — | **PDA vault** `["escrow", stream_pda]`, dibuat di instruksi ini |
| `stream` | `StreamAccount` | ✓ | — | **State PDA** `["stream", creator, recipient, seed_le8]`, dibuat di instruksi ini |
| `token_program` | `Program` | — | — | SPL Token Program |
| `system_program` | `Program` | — | — | System Program |

### Perilaku Step-by-Step

1. Validasi: `total_amount > 0`, `end_time > start_time`, `cliff_time ≤ end_time` (jika ≠ 0), `creator ≠ recipient`
2. Inisialisasi `StreamAccount` dengan semua parameter
3. Buat `escrow_token_account` PDA (authority = stream PDA)
4. Transfer `total_amount` dari `creator_token_account` → `escrow_token_account` via SPL `transfer_checked`

### Error yang Relevan

| Kode | Nama | Kondisi |
|------|------|---------|
| 6006 | `InvalidAmount` | `total_amount == 0` |
| 6005 | `InvalidTimestamp` | `end_time ≤ start_time` atau `cliff_time > end_time` |
| 6007 | `InvalidRecipient` | `creator == recipient` |

### Contoh TypeScript

```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");
const seed = new anchor.BN(Date.now());
const now  = Math.floor(Date.now() / 1000);

// Derive PDAs
const [streamPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("stream"), creator.toBuffer(), recipient.toBuffer(),
   seed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  PROGRAM_ID
);

await program.methods
  .createStream(
    new anchor.BN(10_000_000), // 10 token (6 desimal)
    new anchor.BN(now),
    new anchor.BN(now + 86400 * 365), // 1 tahun
    new anchor.BN(now + 86400 * 90),  // cliff 90 hari
    seed,
    false // tanpa milestone gate
  )
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    escrowTokenAccount: escrowPda,
    stream: streamPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .signers([creator])
  .rpc();
```

---

## 2. `withdraw`

**Fungsi:** Recipient mengklaim semua token yang sudah unlock. Jumlah dihitung on-chain menggunakan `calculate_unlocked()`.

### Parameter

Tidak ada parameter. Jumlah dihitung otomatis dari waktu blok saat ini.

### Accounts

| Field | Tipe | W | S | Deskripsi |
|-------|------|---|---|-----------|
| `recipient` | `Signer` | — | ✓ | Harus cocok dengan `stream.recipient` |
| `stream` | `StreamAccount` | ✓ | — | State PDA; field `amount_withdrawn` diperbarui |
| `escrow_token_account` | `TokenAccount` | ✓ | — | Sumber token |
| `recipient_token_account` | `TokenAccount` | ✓ | — | ATA recipient, tujuan token |
| `token_program` | `Program` | — | — | SPL Token Program |

### Perilaku Step-by-Step

1. Cek `signer == stream.recipient` → `Unauthorized`
2. Cek `!stream.is_cancelled` → `StreamCancelled`
3. Cek `now >= stream.start_time` → `StreamNotStarted`
4. Hitung `unlocked = calculate_unlocked(stream, now)`
5. Hitung `claimable = unlocked - stream.amount_withdrawn`
6. Cek `claimable > 0` → `NothingToWithdraw`
7. **[CEI: Effects]** Update `stream.amount_withdrawn += claimable`
8. **[CEI: Interactions]** Transfer `claimable` token escrow → recipient via CPI

### Formula Unlock

```
if cliff_time > 0 and now < cliff_time  → unlocked = 0
if milestone_enabled and !milestone_reached → unlocked = 0
if now < start_time → unlocked = 0
if now >= end_time  → unlocked = total_amount
else:
  effective_start = cliff_time > 0 ? cliff_time : start_time
  unlocked = total_amount × (now - effective_start) / (end_time - effective_start)
```

### Error yang Relevan

| Kode | Nama | Kondisi |
|------|------|---------|
| 6000 | `Unauthorized` | Signer bukan recipient |
| 6002 | `StreamCancelled` | Stream sudah dibatalkan |
| 6004 | `StreamNotStarted` | `now < start_time` |
| 6001 | `NothingToWithdraw` | Tidak ada token yang bisa diklaim (cliff belum lewat, milestone belum set, atau sudah full withdrawn) |

### Contoh TypeScript

```typescript
await program.methods
  .withdraw()
  .accounts({
    recipient: recipient.publicKey,
    stream: streamPda,
    escrowTokenAccount: escrowPda,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([recipient])
  .rpc();
```

---

## 3. `cancel`

**Fungsi:** Creator membatalkan stream. Token dibagi secara prorated: porsi yang sudah vest → recipient, porsi unvested → creator.

### Parameter

Tidak ada parameter.

### Accounts

| Field | Tipe | W | S | Deskripsi |
|-------|------|---|---|-----------|
| `creator` | `Signer` | ✓ | ✓ | Harus cocok dengan `stream.creator` |
| `recipient` | `AccountInfo` | ✓ | — | Penerima porsi vested |
| `stream` | `StreamAccount` | ✓ | — | Flag `is_cancelled` di-set di sini |
| `escrow_token_account` | `TokenAccount` | ✓ | — | Sumber semua token |
| `creator_token_account` | `TokenAccount` | ✓ | — | ATA creator, menerima porsi unvested |
| `recipient_token_account` | `TokenAccount` | ✓ | — | ATA recipient, menerima porsi vested |
| `token_program` | `Program` | — | — | SPL Token Program |

### Perilaku & Perhitungan Split

```
unlocked         = calculate_unlocked(stream, now)
vested_to_recip  = unlocked - amount_withdrawn   (yang belum diklaim recipient)
unvested_to_creat = total_amount - unlocked
```

**Contoh:**
```
Stream: 1,000,000 token, t=0→1000
Cancel di t=400 (40%), recipient sudah withdraw 100,000

  unlocked          = 400,000
  vested_to_recip   = 400,000 - 100,000 = 300,000 → recipient
  unvested_to_creat = 1,000,000 - 400,000 = 600,000 → creator
```

### Error yang Relevan

| Kode | Nama | Kondisi |
|------|------|---------|
| 6000 | `Unauthorized` | Signer bukan creator |
| 6003 | `AlreadyCancelled` | Stream sudah dibatalkan |
| 6008 | `FullyVested` | `unlocked == total_amount`; tidak ada yang bisa dikembalikan ke creator |

### Contoh TypeScript

```typescript
await program.methods
  .cancel()
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    stream: streamPda,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();
```

---

## 4. `set_milestone`

**Fungsi:** Creator membuka milestone gate (one-way flip dari `false` → `true`). Setelah ini recipient bisa withdraw.

### Parameter

Tidak ada.

### Accounts

| Field | Tipe | W | S | Deskripsi |
|-------|------|---|---|-----------|
| `creator` | `Signer` | — | ✓ | Harus cocok dengan `stream.creator` |
| `stream` | `StreamAccount` | ✓ | — | Field `milestone_reached` diubah jadi `true` |

### Error yang Relevan

| Kode | Nama | Kondisi |
|------|------|---------|
| 6000 | `Unauthorized` | Signer bukan creator |
| 6009 | `MilestoneAlreadyReached` | Gate sudah pernah dibuka |

---

## 5. `close_stream`

**Fungsi:** Tutup stream yang sudah selesai (fully withdrawn atau cancelled). Recover rent SOL (~0.004 SOL) ke creator.

### Syarat Penutupan

Stream harus dalam kondisi **settled**:
- `stream.is_cancelled == true`, **ATAU**
- `stream.amount_withdrawn == stream.total_amount` (fully withdrawn)

### Accounts

| Field | Tipe | W | S | Deskripsi |
|-------|------|---|---|-----------|
| `creator` | `Signer` | ✓ | ✓ | Menerima lamport dari akun yang ditutup |
| `stream` | `StreamAccount` | ✓ | — | Ditutup, lamport → creator |
| `escrow_token_account` | `TokenAccount` | ✓ | — | Ditutup, dust token → creator ATA |
| `creator_token_account` | `TokenAccount` | ✓ | — | ATA creator, menerima dust token |
| `token_program` | `Program` | — | — | SPL Token Program |

### Error yang Relevan

| Kode | Nama | Kondisi |
|------|------|---------|
| 6000 | `Unauthorized` | Signer bukan creator |
| 6015 | `StreamNotSettled` | Stream belum fully withdrawn dan belum cancelled |

---

## 6–9. Campaign & Game Reward Instructions

Untuk dokumentasi lengkap `create_campaign`, `create_milestone`, `verify_game`, dan `claim_milestone`, lihat [`STREAM_MODEL.md`](./STREAM_MODEL.md) bagian Campaign Model.

**Alur singkat:**
```
Founder: create_campaign → create_milestone
Game Server: verify_game (sign dengan game_authority keypair)
Player: claim_milestone
```

# Error Map — BlockBite Program

Semua 21 error code BlockBite, lengkap dengan kode numerik, pesan, kondisi pemicu, dan cara mengatasi dari sisi client.

---

## Tangkap Error di TypeScript

```typescript
import { AnchorError } from "@coral-xyz/anchor";

try {
  await program.methods.withdraw().accounts({...}).rpc();
} catch (err) {
  if (err instanceof AnchorError) {
    // err.error.errorCode.number  → angka (mis. 6001)
    // err.error.errorCode.code    → nama string (mis. "NothingToWithdraw")
    // err.error.errorMessage      → pesan lengkap
    console.error(`[${err.error.errorCode.number}] ${err.error.errorMessage}`);
  }
}
```

---

## Tabel Error — Stream Vesting

| Kode | Nama | Pesan | Kondisi Pemicu | Cara Mengatasi |
|------|------|-------|----------------|----------------|
| **6000** | `Unauthorized` | Signer is not authorised to perform this action | Signer bukan authority yang diharapkan | Pastikan keypair yang menandatangani sesuai dengan field `creator` atau `recipient` di stream |
| **6001** | `NothingToWithdraw` | No tokens available to withdraw | `claimable == 0` — cliff belum lewat, milestone belum di-set, atau sudah fully withdrawn | Hitung claimable client-side sebelum panggil `withdraw` |
| **6002** | `StreamCancelled` | Stream has been cancelled | Operasi pada stream yang sudah dibatalkan | Cek `stream.is_cancelled` sebelum withdraw |
| **6003** | `AlreadyCancelled` | Stream is already cancelled | `cancel` dipanggil dua kali | Cek `stream.is_cancelled` sebelum cancel |
| **6004** | `StreamNotStarted` | Stream has not started yet | `now < stream.start_time` | Tunggu sampai `start_time` tiba |
| **6005** | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end | `end_time ≤ start_time` ATAU `cliff_time > end_time` | Pastikan `start_time < end_time` dan `cliff_time ≤ end_time` |
| **6006** | `InvalidAmount` | Amount must be greater than zero | `total_amount == 0`, `token_amount == 0`, atau `total_budget == 0` | Semua amount harus > 0 |
| **6007** | `InvalidRecipient` | Creator and recipient cannot be the same account | `creator == recipient` saat `create_stream` | Gunakan pubkey recipient yang berbeda |
| **6008** | `FullyVested` | Stream is fully vested and cannot be cancelled | `unlocked == total_amount` saat cancel | Stream sudah 100% vest; tidak bisa cancel. Recipient tinggal withdraw sisa, lalu creator close |
| **6009** | `MilestoneAlreadyReached` | Milestone has already been reached | `set_milestone` dipanggil dua kali | Gate sudah terbuka; tidak perlu aksi lagi |
| **6015** | `StreamNotSettled` | Stream must be fully withdrawn or cancelled before closing | `close_stream` dipanggil sebelum stream selesai | Tunggu full vesting + withdraw semua token, atau cancel dulu |

---

## Tabel Error — Campaign & Game Rewards

| Kode | Nama | Pesan | Kondisi Pemicu | Cara Mengatasi |
|------|------|-------|----------------|----------------|
| **6010** | `CampaignNotFound` | Campaign not found | Derivasi PDA campaign salah | Cek urutan seed: `["campaign", founder, seed_le8]` |
| **6011** | `MilestoneNotFound` | Milestone not found | Derivasi PDA milestone salah | Cek urutan seed: `["milestone", campaign_pda, milestone_seed_le8]` |
| **6012** | `MilestoneAlreadyVerified` | Milestone has already been verified | `verify_game` dipanggil dua kali | `is_verified` sudah `true`; tidak perlu verifikasi ulang |
| **6013** | `InsufficientBudget` | Campaign budget is insufficient for this milestone | `allocated_amount + token_amount > total_budget` | Kurangi `token_amount` milestone atau tambah budget campaign |
| **6014** | `MilestoneNotVerified` | Milestone has not been verified yet | Player klaim sebelum game server verifikasi | Tunggu game server panggil `verify_game` |
| **6016** | `InvalidGameAuthority` | Provided game authority does not match the milestone's declared game authority | Signer `verify_game` ≠ `milestone.game_authority` | Pastikan game server menggunakan keypair yang sama dengan yang di-set saat `create_milestone` |
| **6017** | `AlreadyClaimed` | Milestone reward has already been claimed | `claim_milestone` dipanggil dua kali | Reward sudah diklaim; tidak ada aksi yang perlu dilakukan |
| **6018** | `InvalidLevel` | Target level must be between 1 and 30 | `target_level` atau `achieved_level` di luar range 1–30 | Gunakan nilai level antara 1 dan 30 |
| **6019** | `LevelNotReached` | Achieved level does not meet the target level requirement | `achieved_level < milestone.target_level` | Hanya panggil `verify_game` setelah player benar-benar mencapai target level |
| **6020** | `InvalidDifficulty` | Difficulty must be 1 (easy), 2 (medium), or 3 (hard) | `difficulty ∉ {1, 2, 3}` | Gunakan nilai 1 (easy), 2 (medium), atau 3 (hard) |

---

## Error Handler Utility

```typescript
const BLOCKBITE_ERRORS: Record<number, string> = {
  6000: "Anda tidak berwenang melakukan aksi ini.",
  6001: "Belum ada token yang bisa diklaim. Tunggu cliff berlalu atau milestone di-set.",
  6002: "Stream ini sudah dibatalkan.",
  6003: "Stream sudah dalam status cancelled.",
  6004: "Stream belum dimulai.",
  6005: "Timestamp tidak valid: end harus setelah start, cliff harus sebelum end.",
  6006: "Jumlah harus lebih dari nol.",
  6007: "Creator dan recipient tidak boleh akun yang sama.",
  6008: "Stream sudah fully vested; tidak bisa dibatalkan.",
  6009: "Milestone sudah pernah di-set sebelumnya.",
  6010: "Campaign tidak ditemukan. Cek derivasi PDA.",
  6011: "Milestone tidak ditemukan. Cek derivasi PDA.",
  6012: "Milestone sudah terverifikasi sebelumnya.",
  6013: "Budget campaign tidak mencukupi untuk milestone ini.",
  6014: "Milestone belum diverifikasi oleh game server.",
  6015: "Stream harus fully withdrawn atau cancelled sebelum bisa ditutup.",
  6016: "Game authority tidak cocok dengan yang dideklarasikan di milestone.",
  6017: "Reward milestone sudah diklaim sebelumnya.",
  6018: "Level harus antara 1 dan 30.",
  6019: "Achieved level belum memenuhi target level.",
  6020: "Difficulty harus 1 (easy), 2 (medium), atau 3 (hard).",
};

export function getErrorMessage(code: number): string {
  return BLOCKBITE_ERRORS[code] ?? `Error BlockBite tidak dikenal (${code})`;
}
```

# Account & State Model — BlockBite

Penjelasan lengkap semua akun on-chain BlockBite: field-by-field, lifecycle stream, dan model campaign.

---

## StreamAccount (188 bytes)

PDA state utama untuk setiap vesting stream.  
Seeds: `["stream", creator_pubkey, recipient_pubkey, seed_u64_le]`

```
┌──────────────────────────────────────────────────────┐
│  StreamAccount  (188 bytes total)                    │
├─────────────────────┬────────┬────────┬─────────────┤
│ Field               │ Offset │ Bytes  │ Deskripsi   │
├─────────────────────┼────────┼────────┼─────────────┤
│ discriminator       │      0 │    8   │ Anchor tag  │
│ creator             │      8 │   32   │ Pubkey      │
│ recipient           │     40 │   32   │ Pubkey      │
│ mint                │     72 │   32   │ SPL mint    │
│ escrow_token_account│    104 │   32   │ Vault PDA   │
│ total_amount        │    136 │    8   │ u64 raw     │
│ amount_withdrawn    │    144 │    8   │ u64 kumulatif│
│ start_time          │    152 │    8   │ i64 unix    │
│ end_time            │    160 │    8   │ i64 unix    │
│ cliff_time          │    168 │    8   │ i64 (0=none)│
│ is_cancelled        │    176 │    1   │ bool        │
│ bump                │    177 │    1   │ PDA bump    │
│ seed                │    178 │    8   │ u64 creator │
│ milestone_reached   │    186 │    1   │ bool gate   │
│ milestone_enabled   │    187 │    1   │ bool config │
└─────────────────────┴────────┴────────┴─────────────┘
```

> Untuk decode akun raw: `connection.getAccountInfo(streamPda)` → `data` buffer → baca dari offset masing-masing field.

### Penjelasan Field

| Field | Tipe | Penjelasan |
|-------|------|-----------|
| `creator` | `Pubkey` | Satu-satunya yang bisa `cancel`, `set_milestone`, `close_stream` |
| `recipient` | `Pubkey` | Satu-satunya yang bisa `withdraw` |
| `mint` | `Pubkey` | Token yang di-vest; tidak bisa diubah setelah stream dibuat |
| `escrow_token_account` | `Pubkey` | Vault PDA tempat token terkunci; authority = stream PDA |
| `total_amount` | `u64` | Jumlah token total saat buat stream. **Tidak berubah** sepanjang lifecycle |
| `amount_withdrawn` | `u64` | Bertambah setiap `withdraw`. Ketika sama dengan `total_amount`, stream fully vested |
| `start_time` | `i64` | Sebelum ini: `withdraw` return `StreamNotStarted` |
| `end_time` | `i64` | Setelah ini: `calculate_unlocked` return `total_amount` (100%) |
| `cliff_time` | `i64` | `0` = tidak ada cliff. Jika > 0: token = 0 sampai waktu ini tiba |
| `is_cancelled` | `bool` | Set ke `true` oleh `cancel`. Setelah ini tidak bisa withdraw |
| `bump` | `u8` | Canonical PDA bump, disimpan untuk efisiensi CPI signing |
| `seed` | `u64` | Memungkinkan beberapa stream antara creator+recipient yang sama |
| `milestone_reached` | `bool` | Dimulai `false`. Di-flip ke `true` oleh `set_milestone`. **One-way** |
| `milestone_enabled` | `bool` | Ditetapkan saat `create_stream`. Jika `true`, `milestone_reached` harus `true` agar unlock |

---

## Lifecycle Stream

```
                    CREATE_STREAM
                         │
                         ▼
                  ┌──────────────┐
                  │   ACTIVE     │ ← token terkunci di escrow
                  │  (vesting)   │
                  └──────────────┘
                    │          │
              WITHDRAW      CANCEL
          (berulang kali)      │
                    │          ▼
                    │   ┌──────────────┐
                    │   │  CANCELLED   │
                    │   │ is_cancelled  │
                    │   │   = true     │
                    │   └──────────────┘
                    │          │
                    ▼          ▼
              ┌──────────────────────┐
              │      SETTLED         │
              │  (fully withdrawn    │
              │   atau cancelled)    │
              └──────────────────────┘
                         │
                    CLOSE_STREAM
                         │
                         ▼
                  [akun ditutup,
                   rent recovered]
```

### State Transitions

| Dari | Via | Ke | Syarat |
|------|-----|----|----|
| Active | `withdraw` | Active (parsial) | `claimable > 0` |
| Active | `withdraw` | Settled | `amount_withdrawn == total_amount` |
| Active | `cancel` | Cancelled | `unlocked < total_amount` |
| Active | `set_milestone` | Active (gate terbuka) | `milestone_enabled && !milestone_reached` |
| Cancelled/Settled | `close_stream` | [closed] | `is_cancelled || fully_withdrawn` |

---

## EscrowTokenAccount

Akun token SPL standar (165 bytes) yang **di-init oleh BlockBite**.

- **Authority**: `StreamAccount` PDA
- **Seeds**: `["escrow", stream_pda]`
- Tidak bisa didrain oleh siapapun selain program (melalui PDA-signed CPI)
- Ditutup saat `close_stream` dipanggil

---

## CampaignAccount (82 bytes data)

PDA untuk campaign reward.  
Seeds: `["campaign", founder_pubkey, seed_u64_le]`

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `founder` | `Pubkey` | Satu-satunya yang bisa tambah milestone |
| `title_hash` | `[u8; 32]` | SHA-256 dari judul campaign (konten di off-chain) |
| `total_budget` | `u64` | Total token yang di-deposit ke escrow |
| `allocated_amount` | `u64` | Jumlah yang sudah di-assign ke milestone (tracking) |
| `milestone_count` | `u8` | Jumlah milestone yang sudah dibuat |
| `bump` | `u8` | PDA bump |

---

## MilestoneAccount (150 bytes data)

PDA per milestone dalam sebuah campaign.  
Seeds: `["milestone", campaign_pda, milestone_seed_u64_le]`

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `campaign` | `Pubkey` | Parent campaign PDA |
| `recipient` | `Pubkey` | Player yang bisa klaim |
| `description_hash` | `[u8; 32]` | SHA-256 dari deskripsi milestone (off-chain) |
| `game_authority` | `Pubkey` | Keypair game server yang berhak verifikasi |
| `token_amount` | `u64` | Reward token untuk milestone ini |
| `target_level` | `u8` | Level minimum yang harus dicapai (1–30) |
| `achieved_level` | `u8` | Level aktual yang dicapai (diisi saat `verify_game`) |
| `difficulty` | `u8` | 1=easy, 2=medium, 3=hard |
| `is_verified` | `bool` | Set `true` oleh game server via `verify_game` |
| `is_claimed` | `bool` | Set `true` saat player berhasil klaim (idempotency guard) |
| `bump` | `u8` | PDA bump |

### Lifecycle Milestone

```
create_milestone → is_verified=false, is_claimed=false
      │
      ▼
verify_game (game server sign)
      │
      ▼
is_verified=true
      │
      ▼
claim_milestone (player sign)
      │
      ▼
is_claimed=true, token → player ATA
```

---

## Hash Commitments (title_hash / description_hash)

Campaign dan milestone menyimpan **hash SHA-256 32-byte** di on-chain, bukan teks lengkap.  
Konten lengkap disimpan off-chain (IPFS, database, backend).

**Mengapa?** Biaya storage on-chain ~7 lamport/byte. String panjang akan membuat akun mahal. Hash 32-byte selalu fixed-cost dan tamper-evident.

**Cara verifikasi client:**
```typescript
import { createHash } from "crypto";

const offChainContent  = "Reach Level 10 in Dragon Dungeon";
const computedHash     = createHash("sha256").update(offChainContent).digest("hex");
const onChainHashHex   = Buffer.from(milestone.descriptionHash).toString("hex");

if (computedHash !== onChainHashHex) {
  throw new Error("Konten tidak cocok dengan hash on-chain!");
}
```

# Verification Layer — Cliff & Milestone Vesting

Penjelasan mendalam mekanisme unlock BlockBite: bagaimana cliff dan milestone bekerja, edge cases yang sudah diuji, dan proposal pengembangan ke depan.

---

## Fungsi Inti: `calculate_unlocked`

Semua keputusan tentang "berapa token yang bisa diklaim sekarang" ada di satu fungsi pure di `utils.rs`:

```rust
pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    // Gate 1: Cliff
    if stream.cliff_time > 0 && current_time < stream.cliff_time {
        return 0;
    }
    // Gate 2: Milestone
    if stream.milestone_enabled && !stream.milestone_reached {
        return 0;
    }
    // Belum mulai
    if current_time < stream.start_time {
        return 0;
    }
    // Fully vested
    if current_time >= stream.end_time {
        return stream.total_amount;
    }
    // Linear dari effective_start
    let effective_start = if stream.cliff_time > 0 { stream.cliff_time } else { stream.start_time };
    let elapsed  = (current_time - effective_start) as u128;
    let duration = (stream.end_time - effective_start) as u128;
    ((stream.total_amount as u128).checked_mul(elapsed).unwrap()
                                  .checked_div(duration).unwrap()) as u64
}
```

---

## Empat Mode Vesting

Dua boolean flag (`cliff_time > 0` dan `milestone_enabled`) menghasilkan 4 kombinasi:

| Mode | `cliff_time` | `milestone_enabled` | Perilaku Unlock |
|------|-------------|---------------------|----------------|
| **Pure Linear** | `0` | `false` | Proporsional dari `start_time` ke `end_time` |
| **Cliff** | `> 0` | `false` | 0% sebelum cliff, lalu linear dari cliff ke end |
| **Milestone** | `0` | `true` | 0% sampai `set_milestone` dipanggil, lalu linear |
| **Cliff + Milestone** | `> 0` | `true` | Kedua gate harus lewat, baru linear dari cliff |

---

## Diagram Timeline

### Mode Pure Linear
```
start_time          end_time
    │                   │
────┼───────────────────┼────
    │░░░░░░░░░░░░░░░░░░░│
    0%     linear      100%
```

### Mode Cliff
```
start_time  cliff_time     end_time
    │            │              │
────┼────────────┼──────────────┼────
    │   0%       │  linear 0→100%│
                 └── effective_start
```

### Mode Milestone (gate dibuka di T=X)
```
start_time     T=X (set_milestone)     end_time
    │               │                       │
────┼───────────────┼───────────────────────┼────
    │     0%        │ linear (dari start!)  100%
```
> Catatan: setelah milestone di-set, linear dihitung dari `start_time` (bukan dari saat milestone di-set). Jika sudah lewat separuh durasi, langsung 50% bisa diklaim.

---

## Edge Cases yang Sudah Diuji

Semua kasus ini ada di `utils.rs` unit tests (20 tests total, includes linear progression dan past-end behavior):

| Test | Skenario | Expected |
|------|----------|---------|
| `test_linear_at_0_percent` | Tepat di `start_time` | `0` |
| `test_linear_at_25_percent` | 25% durasi terlewat | `250_000` dari `1_000_000` |
| `test_linear_at_50_percent` | 50% durasi terlewat | `500_000` |
| `test_linear_at_75_percent` | 75% durasi terlewat | `750_000` |
| `test_linear_at_100_percent` | Tepat di `end_time` | `1_000_000` |
| `test_linear_past_end` | Lewat `end_time` | `1_000_000` (clamped) |
| `test_linear_before_start` | Sebelum `start_time` | `0` |
| `test_cliff_before_cliff_date` | Sebelum cliff | `0` |
| `test_cliff_at_exact_cliff_date` | Tepat di cliff | `0` (cliff belum "lewat") |
| `test_cliff_25_percent_after_cliff` | 25% setelah cliff | `250_000` |
| `test_cliff_50_percent_after_cliff` | 50% setelah cliff | `500_000` |
| `test_cliff_100_percent` | Tepat di `end_time` dengan cliff | `1_000_000` |
| `test_cliff_past_end` | Lewat `end_time` dengan cliff | `1_000_000` |
| `test_milestone_not_reached_zero` | Milestone belum di-set | `0` |
| `test_milestone_reached_linear` | Milestone di-set, 50% waktu | `500_000` |
| `test_milestone_reached_past_end` | Milestone di-set, lewat `end_time` | `1_000_000` |
| `test_cliff_and_milestone_both_block` | Cliff+milestone, keduanya belum | `0` |
| `test_cliff_passed_milestone_not_reached` | Cliff lewat, milestone belum | `0` |
| `test_cliff_passed_milestone_reached` | Cliff lewat + milestone di-set | `500_000` |
| `test_milestone_reached_before_cliff` | Milestone di-set, cliff belum | `0` |

---

## Kondisi Unlock per Fase

```
Waktu:         start    cliff    t=now    end
                │         │        │       │

Phase 1:        ├────────►│
(before cliff)             sebelum cliff → selalu 0

Phase 2:                   │────────────►│
(after cliff)              unlocked = total × (now-cliff)/(end-cliff)

Phase 3:                                  ├──────
(after end)                               selalu = total_amount
```

---

## Arithmetic Safety: `checked_mul` + `checked_div`

Perhitungan linear menggunakan `u128` untuk mencegah overflow:

```rust
let elapsed  = (current_time - effective_start) as u128;
let duration = (stream.end_time - effective_start) as u128;
((stream.total_amount as u128)
    .checked_mul(elapsed).unwrap()    // panic jika overflow (tidak mungkin dalam range valid)
    .checked_div(duration).unwrap())  // panic jika duration=0 (dicegah oleh InvalidTimestamp)
    as u64
```

`duration > 0` selalu terjamin karena `create_stream` memvalidasi `end_time > start_time` (dan `cliff_time < end_time`).

---

## Status Aktual vs. Fitur yang Direncanakan

### Yang Ada Sekarang ✅

| Fitur | Implementasi |
|-------|-------------|
| Cliff time-based | ✅ `cliff_time > 0` check di `calculate_unlocked` |
| Milestone gate (creator-controlled) | ✅ `set_milestone` instruction |
| Linear vesting post-cliff | ✅ `calculate_unlocked` |
| Game server oracle | ✅ `verify_game` dengan `game_authority` signature |

### Proposal: Milestone Verification Layer (Rekomendasi Pengembangan)

Saat ini `set_milestone` adalah **trusted creator action** — creator memutuskan sendiri kapan milestone tercapai, tanpa verifikasi on-chain.

Terinspirasi dari [Ah-Riz/velthoryn](https://github.com/Ah-Riz/velthoryn) yang mengimplementasikan `set_milestone_released` dengan **Merkle proof verification**, berikut rekomendasi untuk BlockBite v2:

#### Opsi A: Multi-signature Milestone (MVP)

Tambahkan field `milestone_approver: Pubkey` opsional di `StreamAccount`. Jika diisi, `set_milestone` membutuhkan tanda tangan dari **dua pihak** (creator + approver):

```rust
// Proposal ADR baru:
pub struct StreamAccount {
    // ... existing fields ...
    pub milestone_approver: Option<Pubkey>,  // jika Some, butuh co-signature
}
```

#### Opsi B: Time-bound Milestone (Sederhana)

Tambahkan `milestone_deadline: i64` — jika milestone tidak di-set sebelum deadline, otomatis unlock. Ini mencegah creator "menyandera" token selamanya:

```rust
pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    // Milestone auto-release setelah deadline
    let milestone_blocked = stream.milestone_enabled
        && !stream.milestone_reached
        && (stream.milestone_deadline == 0 || current_time < stream.milestone_deadline);

    if milestone_blocked { return 0; }
    // ...
}
```

#### Opsi C: Oracle Integration (Jangka Panjang)

Integrasi dengan program oracle (Switchboard/Pyth) untuk verifikasi kondisi off-chain (harga token, TVL, jumlah user) sebagai milestone trigger. Kompleks tapi fully trustless.

---

## Rekomendasi Prioritas

1. **Segera**: Dokumentasikan batasan "creator-controlled milestone" kepada user BlockBite — mereka perlu tahu bahwa creator bisa tahan gate
2. **Jangka pendek (v1.1)**: Implementasi Opsi B (time-bound milestone deadline) — satu field tambahan, minimal code change
3. **Jangka menengah (v2)**: Pertimbangkan Opsi A untuk use case B2B dengan multi-stakeholder approval

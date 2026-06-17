# Testing Guide — BlockBite

Panduan menjalankan semua test suite BlockBite dan menginterpretasi hasilnya.

---

## Gambaran Test Suite

| Suite | File | Count | Runtime |
|-------|------|-------|---------|
| Rust unit tests | `programs/blockbite/src/utils.rs` | 13 | ~0.3 detik |
| TypeScript integration | `tests/blockbite.ts` | 28 | ~45 detik |
| **Total** | | **41** | |

---

## Rust Unit Tests (Tanpa Validator)

Test ini menguji `calculate_unlocked()` secara langsung — tidak butuh Solana validator, tidak butuh jaringan.

```bash
cargo test -p blockbite
```

Output yang diharapkan:

```
running 13 tests
test tests::test_linear_at_0_percent ... ok
test tests::test_linear_at_25_percent ... ok
test tests::test_linear_at_50_percent ... ok
test tests::test_linear_at_75_percent ... ok
test tests::test_linear_at_100_percent ... ok
test tests::test_cliff_before_cliff_date ... ok
test tests::test_cliff_at_exact_cliff_date ... ok
test tests::test_cliff_25_percent_after_cliff ... ok
test tests::test_milestone_not_reached_zero ... ok
test tests::test_milestone_reached_linear ... ok
test tests::test_cliff_and_milestone_both_block ... ok
test tests::test_cliff_passed_milestone_not_reached ... ok
test tests::test_cliff_passed_milestone_reached ... ok

test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured
```

### Apa yang Diuji

| Test | Skenario |
|------|----------|
| `test_linear_at_0_percent` | Tepat di `start_time` → harusnya 0 |
| `test_linear_at_25_percent` | 25% durasi berlalu → `250_000` dari `1_000_000` |
| `test_linear_at_50_percent` | 50% durasi berlalu → `500_000` |
| `test_linear_at_75_percent` | 75% durasi berlalu → `750_000` |
| `test_linear_at_100_percent` | Di/setelah `end_time` → `1_000_000` (full) |
| `test_cliff_before_cliff_date` | Sebelum cliff → `0` |
| `test_cliff_at_exact_cliff_date` | Tepat di cliff (belum "lewat") → `0` |
| `test_cliff_25_percent_after_cliff` | 25% setelah cliff → `250_000` |
| `test_milestone_not_reached_zero` | Milestone belum di-set → `0` |
| `test_milestone_reached_linear` | Milestone di-set, 50% waktu → `500_000` |
| `test_cliff_and_milestone_both_block` | Cliff + milestone, keduanya belum → `0` |
| `test_cliff_passed_milestone_not_reached` | Cliff lewat, milestone belum → `0` |
| `test_cliff_passed_milestone_reached` | Cliff lewat + milestone di-set → `500_000` |

---

## TypeScript Integration Tests

Test ini menjalankan instruksi nyata di local validator. `anchor test` otomatis start dan stop validator.

```bash
anchor test
```

Output yang diharapkan (ringkasan):

```
BlockBite
  Stream Vesting
    ✓ creates a stream with correct state (1247ms)
    ✓ recipient can withdraw vested tokens (834ms)
    ✓ cannot withdraw before start_time (412ms)
    ✓ cliff blocks withdrawal before cliff_time (389ms)
    ✓ tokens unlock linearly after cliff (521ms)
    ✓ milestone gate blocks withdrawal (398ms)
    ✓ set_milestone enables withdrawal (763ms)
    ✓ creator can cancel a stream (prorated split) (901ms)
    ✓ cannot cancel a fully vested stream (344ms)
    ✓ cannot cancel twice (312ms)
    ✓ close_stream recovers rent after full withdrawal (1102ms)
    ✓ close_stream works after cancel (934ms)
    ✓ unauthorized signer rejected on withdraw (287ms)
    ✓ unauthorized signer rejected on cancel (291ms)
    ✓ creator and recipient cannot be same account (303ms)
    ✓ zero amount rejected (287ms)
    ✓ invalid timestamps rejected (298ms)

  Campaign & Game Rewards
    ✓ founder creates campaign (1034ms)
    ✓ founder adds milestone to campaign (891ms)
    ✓ game server verifies player achievement (743ms)
    ✓ player claims milestone reward (812ms)
    ✓ cannot claim unverified milestone (302ms)
    ✓ cannot claim twice (AlreadyClaimed) (289ms)
    ✓ invalid game authority rejected (317ms)
    ✓ level below target rejected (LevelNotReached) (298ms)
    ✓ insufficient budget rejected (314ms)
    ✓ invalid level range rejected (287ms)
    ✓ invalid difficulty rejected (293ms)

  28 passing (45s)
```

---

## Menjalankan Hanya TypeScript (Validator Sudah Berjalan)

Jika kamu sudah punya `solana-test-validator` berjalan di terminal lain:

```bash
yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

---

## Devnet Smoke Test

Setelah deploy, verifikasi program aktif:

```bash
solana program show Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq --url devnet
```

Output yang diharapkan:
```
Program Id: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: <address>
Authority: <deployer-pubkey>
Last Deployed In Slot: <slot>
Data Length: 503824 (0x7b110) bytes
Balance: 3.51292512 SOL
```

---

## CI Otomatis

Setiap push ke `main` atau PR, GitHub Actions menjalankan:

```yaml
# .github/workflows/ci.yml
- anchor build
- cargo test -p blockbite   # 13 Rust unit tests
- anchor test               # 28 TypeScript integration tests
```

Status badge CI ada di README.

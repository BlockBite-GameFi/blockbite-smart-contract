# Program Constants

All constants defined in the BlockBite program. These are declared in `programs/blockbite/src/constants.rs`.

---

## Game Level Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_LEVEL` | `1` | Minimum valid level for `target_level` and `achieved_level` |
| `MAX_LEVEL` | `30` | Maximum valid level |

Used in:
- `create_milestone` — validates `target_level`
- `verify_game` — validates `achieved_level`

```rust
// constants.rs
pub const MIN_LEVEL: u8 = 1;
pub const MAX_LEVEL: u8 = 30;
```

---

## Difficulty Values

| Value | Meaning | Used In |
|-------|---------|---------|
| `1` | Easy | `create_milestone` — `difficulty` parameter |
| `2` | Medium | `create_milestone` — `difficulty` parameter |
| `3` | Hard | `create_milestone` — `difficulty` parameter |

The difficulty value is stored on-chain in `MilestoneAccount.difficulty` and is purely informational — it does not affect reward amounts or verification logic. Game UIs can use it to display difficulty badges.

---

## Program IDs

| Cluster | Program ID |
|---------|-----------|
| **Devnet** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Localnet** | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |

---

## System Program Addresses

| Program | Address |
|---------|---------|
| **SPL Token Program** | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| **System Program** | `11111111111111111111111111111111` |
| **Rent Sysvar** | `SysvarRent111111111111111111111111111111111` |
| **Associated Token Program** | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bW8` |

---

## Account Sizes

| Account | Size | Rent Exemption (approx.) |
|---------|------|--------------------------|
| `StreamAccount` | 196 bytes | ~0.00204 SOL |
| `CampaignAccount` | 90 bytes | ~0.00156 SOL |
| `MilestoneAccount` | 158 bytes | ~0.00186 SOL |
| SPL Token Account (escrow) | 165 bytes | ~0.00204 SOL |

**Cost to create a stream:** ~0.00408 SOL (StreamAccount + EscrowTokenAccount)
**Cost recovered on `close_stream`:** ~0.00408 SOL

Use `connection.getMinimumBalanceForRentExemption(size)` for exact current values.

---

## Anchor Framework Version

| Dependency | Version |
|------------|---------|
| `anchor-lang` | `1.0.0` |
| `anchor-spl` | `1.0.0` |
| `@coral-xyz/anchor` (client) | `^0.32.1` |

---

## Vesting Formula Parameters

The unlock calculation uses these invariants:

| Invariant | Rule |
|-----------|------|
| Minimum vesting duration | `end_time > start_time` (strictly) |
| Cliff constraint | `cliff_time <= end_time` (if non-zero) |
| Level range | `1 <= level <= 30` |
| Amount minimum | `amount > 0` |
| Difficulty values | `difficulty ∈ {1, 2, 3}` |

---

## Token Decimal Conventions

BlockBite does not enforce a specific decimal count — it operates in raw token units for all amounts. Common conventions:

| Token | Decimals | 1 token = |
|-------|----------|-----------|
| USDC | 6 | `1_000_000` raw |
| SOL (wrapped) | 9 | `1_000_000_000` raw |
| Custom token | varies | Check mint's `decimals` field |

Always pass `total_amount`, `token_amount`, and `total_budget` in **raw (smallest unit)** form.

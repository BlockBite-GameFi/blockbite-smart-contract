# BlockBite Smart Contract — Week 9 Status Report

**Date:** 2026-06-20  
**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Network:** Solana Devnet  
**Framework:** Anchor 1.0.0

---

## Deployment Status

| Environment | Status | Explorer |
|---|---|---|
| Localnet (CI) | ✅ Live — 115/115 tests green | GitHub Actions |
| Devnet | ✅ Deployed | [Solana Explorer](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet) |
| Mainnet | ⏳ Pending audit | — |

### Devnet Deployment Setup (one-time)

1. Add GitHub secrets (Settings → Secrets → Actions):
   - `ANCHOR_PROGRAM_KEYPAIR` — content of `blockbite/target/deploy/blockbite-keypair.json`
   - `DEVNET_DEPLOYER_KEYPAIR` — content of your funded devnet wallet (e.g. `darurat.json`)
2. Go to Actions → "Deploy to Devnet" → Run workflow → type `deploy`

---

## Feature Completion

| Feature | Description | Status |
|---|---|---|
| `create_stream` | Linear vesting with cliff + dev fee (1%) | ✅ |
| `withdraw` | Pro-rata unlock, MIN_CLAIM_AMOUNT dust filter | ✅ |
| `cancel` | Creator reclaims unvested tokens; recipient gets vested share | ✅ |
| `set_milestone` | Creator unlocks cliff-gated vesting after milestone event | ✅ |
| `close_stream` | Reclaims rent SOL from settled streams (cancelled or fully withdrawn) | ✅ |
| Dev Fee | 1% of stream amount transferred to protocol treasury at creation | ✅ |
| Stream Name | Human-readable label (max 31 UTF-8 chars) stored on-chain | ✅ |

---

## Test Coverage

| Suite | Count | Result |
|---|---|---|
| Rust unit tests (`calculate_unlocked` + cancel/campaign/edge cases) | 83 | ✅ Pass |
| Integration tests (TypeScript/Mocha) | 32 | ✅ Pass |
| **Total** | **115** | **✅ All green** |

### Integration test breakdown

**Happy paths:**
- Stream creation with dev fee validation
- Partial withdraw (50% elapsed)
- Full withdraw (100% elapsed, after end time)
- Cancel mid-stream (creator recovers unvested, recipient gets vested)
- Milestone unlock: cliff → set_milestone → linear vest → withdraw

**Error paths / edge cases:**
- Double withdraw → NothingToWithdraw
- Withdraw by non-recipient → Unauthorized
- Cancel by non-creator → Unauthorized
- Withdraw from cancelled stream → StreamCancelled
- Double cancel → AlreadyCancelled
- Cancel after full vest → FullyVested
- Zero amount create → InvalidAmount
- Same creator/recipient → InvalidRecipient
- Invalid timestamp (end ≤ start) → InvalidTimestamp
- Invalid cliff (cliff > end) → InvalidTimestamp
- Withdraw before stream start → StreamNotStarted
- Claimable below MIN_CLAIM_AMOUNT → NothingToWithdraw
- set_milestone by non-creator → Unauthorized/ConstraintSeeds
- set_milestone already reached → MilestoneAlreadyReached
- set_milestone before cliff → blocks withdraw via calculate_unlocked

**close_stream (Week 9):**
- Close cancelled stream → rent recovered ✅
- Close fully-withdrawn stream → rent recovered ✅
- Close active stream (non-creator) → StreamNotSettled / Unauthorized ✅

---

## Bug Fixes (Weeks 5–9)

1. **Double-counted discriminator in `space`** — `StreamAccount::LEN` already includes 8 bytes; adding +8 wasted rent
2. **Borrow checker conflict in pure-function refactor** — snapshotted immutable fields before `&mut ctx.accounts.stream`
3. **Wrong `set_milestone` discriminator in tests** — recomputed to `sha256("global:set_milestone")[0..8]`
4. **CI: missing `.anchor` parent directory** — added `mkdir -p .anchor` before `solana-test-validator`
5. **CI: `--bind-address 0.0.0.0` panic** — gossip layer rejects unspecified IP in newer agave; removed flag
6. **CI: deployer had 0 SOL** — added `solana airdrop 100` before `anchor deploy`
7. **CI: `ANCHOR_PROVIDER_URL` undefined** — added env vars for `ts-mocha` outside `anchor test`
8. **Deploy workflow verify hardcoded old ID** — fixed to read program ID dynamically via `anchor keys list`
9. **`create_stream` missing `name` parameter** — added `[u8; 32]` field to `StreamAccount` (188 → 212 bytes) and `[u8; 32]` parameter to `create_stream`

---

## Performance Notes

| Metric | Observation |
|---|---|
| `create_stream` cost | ~0.012 SOL rent (StreamAccount: 220 bytes + escrow token account: 165 bytes) |
| `withdraw` cost | ~0.000005 SOL (single CPI call, no account init) |
| `cancel` cost | ~0.000005–0.00001 SOL (1–2 CPI calls depending on vested amount) |
| `set_milestone` cost | ~0.000005 SOL (state write only, no token transfers) |
| `close_stream` cost | ~0.000005 SOL tx fee; returns ~0.002–0.003 SOL rent back to creator |
| Compute budget | All instructions well within 200K CU limit; no `compute_budget` instruction needed |
| PDA derivation | O(1) — 2 PDAs per stream (stream + escrow), deterministic |

**Bottleneck:** Stream creation is the most expensive due to two account initializations (stream state + escrow token account). This is a one-time cost. Subsequent operations (withdraw, cancel) are cheap.

---

## Known Limitations / Future Work

- **Fixed STREAM_FEE_BPS:** Fee is hardcoded at 0.9%. A governance mechanism for adjusting fee is planned.
- **Game verification is free:** `create_milestone` charges no protocol fee — founders only pay the 0.9% stream-creation fee on the amount they distribute.
- **No referral tracking on-chain:** The referral system described in the FAQ is currently off-chain. On-chain referral PDA is planned.
- **Formal audit:** Scheduled before Mainnet launch (noted in SECURITY_CHECKLIST.md).

---

## Security Checklist

See [`SECURITY_CHECKLIST.md`](./SECURITY_CHECKLIST.md) for the full security audit covering:
- Signer validation ✅
- PDA seed correctness ✅  
- Integer overflow protection ✅
- Account ownership ✅
- Reentrancy (CEI pattern) ✅
- Frontrunning/MEV resistance ✅

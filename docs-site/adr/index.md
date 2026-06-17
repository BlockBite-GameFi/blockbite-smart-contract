# Architecture Decision Records

These records document every significant architectural decision made during BlockBite's development. Each ADR captures the **context**, **alternatives considered**, **decision taken**, and **consequences** — so future contributors understand not just *what* was built, but *why*.

| # | Title | Status | Date |
|---|---|---|---|
| ADR-001 | [Separate `_dispatch.rs` for Anchor Boilerplate](#adr-001-separate-_dispatchrs-for-anchor-boilerplate) | Accepted | 2026-01 Week 4 |
| ADR-002 | [CEI Pattern on Every Instruction](#adr-002-cei-checks-effects-interactions-pattern-on-every-instruction) | Accepted | 2026-01 Week 4 |
| ADR-003 | [`game_authority` as On-Chain Oracle](#adr-003-game_authority-as-on-chain-oracle-for-milestone-verification) | Accepted | 2026-02 Week 5 |
| ADR-004 | [Dual PDA Architecture](#adr-004-dual-pda-architecture-stream--escrow-as-separate-accounts) | Accepted | 2026-01 Week 4 |
| ADR-005 | [32-byte On-Chain Content Hashes](#adr-005-title_hash--description_hash-as-32-byte-on-chain-commitments) | Accepted | 2026-02 Week 5 |
| ADR-006 | [Creator-Controlled Milestone Gate](#adr-006-creator-controlled-milestone-gate-on-stream-vesting) | Accepted | 2026-02 Week 5 |

---

## ADR-001: Separate `_dispatch.rs` for Anchor Boilerplate

**Status:** Accepted · **Date:** 2026-01 (Week 4)

### Context

Anchor's `#[derive(Accounts)]` structs and public instruction handlers require a running BPF runtime to execute — they cannot be reached by `cargo test` without a live validator. But the business logic inside each instruction (timestamp math, unlock calculations, cancel splits) is pure Rust, fully testable without any on-chain infrastructure.

Mixing both in the same file makes unit testing impossible and produces noisy code coverage numbers.

### Alternatives Considered

| Option | Reason rejected |
|---|---|
| Everything in `lib.rs` | Bloats entrypoint; unit tests can't import instruction logic directly |
| One file per instruction, no separation | Anchor boilerplate and business logic remain coupled; `cargo test` fails with BPF errors |
| **Separate dispatch + pure logic files** ✅ | Chosen — clean, testable, accurate coverage |

### Decision

All Anchor boilerplate (`#[derive(Accounts)]` + thin handler wrappers) lives in `src/instructions/_dispatch.rs`. Business logic lives in per-instruction pure-function files (`init_stream`, `compute_withdraw`, `compute_cancel`, etc.). Coverage excludes `_dispatch.rs` via `--ignore-filename-regex`.

### Consequences

✅ Unit tests import pure functions directly — fast, offline, deterministic  
✅ Code coverage reflects actual business logic, not macro scaffolding  
✅ Each instruction file is small and focused  
⚠️ New instructions require changes in two files — the pure logic file and `_dispatch.rs`

---

## ADR-002: CEI (Checks-Effects-Interactions) Pattern on Every Instruction

**Status:** Accepted · **Date:** 2026-01 (Week 4)

### Context

Solana programs call other programs via CPI. If state is mutated *after* a CPI, a malicious re-entrant program could exploit the window between CPI and state update. Rust's borrow checker catches data-race bugs within a single transaction but cannot detect logical reentrancy across CPI boundaries.

BlockBite has four instructions (`withdraw`, `cancel`, `claim_milestone`, `close_stream`) that mutate state AND transfer tokens.

### Alternatives Considered

| Option | Reason rejected |
|---|---|
| No explicit ordering discipline | Acceptable only for single-CPI instructions with no shared mutable state; risky with `cancel` (two CPIs) |
| On-account reentrancy lock flag | Extra storage overhead; no native Solana mutex primitive |
| **CEI ordering enforced by pure-function architecture** ✅ | Zero runtime overhead; naturally enforced by ADR-001's design |

### Decision

Every mutating instruction follows strict CEI order:

```
1. Checks     — all require! validations (read-only, fail-fast)
2. Effects    — all state mutations (is_cancelled, amount_withdrawn, is_claimed)
3. Interactions — all CPI token transfers
```

The pure-function architecture from ADR-001 enforces this naturally: `compute_withdraw` mutates state and returns the transfer amount; the mutable borrow drops; then the handler calls the CPI.

**Concrete example — `claim_milestone`:**
```
CHECK:    is_verified == true, !is_claimed, recipient == signer
EFFECT:   milestone.is_claimed = true           ← before CPI
INTERACT: transfer token_amount → recipient ATA ← after state
```

### Consequences

✅ Eliminates reentrancy risk on all instructions  
✅ CEI order is visible and reviewable at the handler level  
✅ Passed the Week 7 security audit  
⚠️ Requires discipline on new instructions — explicit variable extraction after borrow drop adds a few lines

---

## ADR-003: `game_authority` as On-Chain Oracle for Milestone Verification

**Status:** Accepted · **Date:** 2026-02 (Week 5)

### Context

The game reward system needs an answer to: *"did this player actually reach the target level?"* Without a verifiable signal, players can self-report false achievements.

### Alternatives Considered

| Option | Reason rejected |
|---|---|
| Trust the player (self-report) | Trivially gameable — no security |
| Founder manually verifies | Founder becomes a bottleneck and single trust point; doesn't scale |
| **Designated game-server keypair** ✅ | Chosen — lightweight oracle, no third-party dependency |
| ZK proof | Ideal but requires custom circuits; not feasible in hackathon scope |
| Switchboard / Pyth oracle | General-purpose oracle; overkill for bespoke game events; adds protocol dependency |

### Decision

Each `MilestoneAccount` stores a `game_authority: Pubkey` set at creation time. Only a transaction signed by that keypair can call `verify_game`. The game server backend monitors player progress and submits `verify_game` when the target is reached.

Per-milestone authority means different game integrations or seasons can use different signing keys — blast radius of a compromised key is limited to its milestones.

### Consequences

✅ Trustless from the player's perspective — they cannot fake verification  
✅ No ZK complexity; deployed and running on Solana Devnet today  
✅ Per-milestone authority limits key-compromise blast radius  
✅ Cheap: one extra `Pubkey` (32 bytes) per `MilestoneAccount`  
⚠️ Game server is a trusted party — offline server = blocked verifications  
⚠️ No slashing if game server lies — mitigated by publisher reputation risk  
⚠️ Key rotation requires new milestone accounts (no update path)

**Future improvement:** Replace the single hot-wallet key with a Squads multisig or Switchboard oracle for production.

---

## ADR-004: Dual PDA Architecture (Stream + Escrow as Separate Accounts)

**Status:** Accepted · **Date:** 2026-01 (Week 4)

### Context

Vested tokens must be held by the program so it can transfer them autonomously. The question is where the SPL tokens should live.

### Alternatives Considered

| Option | Reason rejected |
|---|---|
| Single PDA with SOL balance | Only works for SOL, not SPL tokens |
| Creator-owned escrow (ATA) | Creator retains custody — fully gameable |
| **Dual PDA** ✅ | Chosen — `StreamAccount` holds metadata; `EscrowTokenAccount` (authority = stream PDA) holds tokens |

### Decision

`StreamAccount` (seeds: `["stream", creator, recipient, seed]`) + `EscrowTokenAccount` (seeds: `["escrow", stream_pubkey]`). The escrow's SPL token authority is set to the `StreamAccount` PDA, so only the program can move tokens via `CpiContext::new_with_signer`.

Escrow derived from stream means it is uniquely discoverable from just the stream PDA — no extra storage or lookup table needed.

### Consequences

✅ Works with any SPL token mint  
✅ Clean separation: state vs funds in separate accounts  
✅ Escrow uniquely discoverable from stream PDA  
✅ `close_stream` atomically closes both accounts, returning all rent  
✅ Anchor's `token::authority` constraint enforces escrow ownership at compile time  
⚠️ Two accounts to derive and pass per instruction (slightly higher tx overhead)  
⚠️ Higher creation cost: ~0.004 SOL rent for two `init` accounts (recovered on `close_stream`)

---

## ADR-005: `title_hash` / `description_hash` as 32-byte On-Chain Commitments

**Status:** Accepted · **Date:** 2026-02 (Week 5)

### Context

Campaign titles and milestone descriptions are arbitrary-length strings. Storing them on-chain costs lamports proportional to byte length. Storing nothing on-chain breaks tamper-evidence — a founder could silently change terms after players sign up.

### Alternatives Considered

| Option | Reason rejected |
|---|---|
| Store full strings on-chain | Expensive; hits account size limits; can't be updated |
| Store nothing | No accountability; off-chain content can be changed unilaterally |
| **32-byte SHA-256 hash** ✅ | Fixed cost, tamper-evident, IPFS-compatible |
| IPFS CID as string | 46+ bytes as base58 — same content in raw multihash fits in 32 bytes |

### Decision

Store a 32-byte SHA-256 (or IPFS CID multihash) of the content on-chain. Full text lives off-chain (IPFS/Arweave/backend DB). Any party can verify authenticity by hashing the off-chain content and comparing:

```typescript
import { createHash } from "crypto";
const hash    = Array.from(createHash("sha256").update(offChainTitle).digest());
const matches = JSON.stringify(hash) === JSON.stringify(Array.from(campaign.titleHash));
```

### Consequences

✅ Fixed 32-byte on-chain cost regardless of content length  
✅ Tamper-evident — altered off-chain content produces a different hash  
✅ Compatible with SHA-256 and IPFS CIDv1 multihashes  
⚠️ Off-chain content availability not guaranteed — mitigated by IPFS pinning  
⚠️ Hash scheme is by convention (SHA-256) — not encoded in the account structure  
⚠️ Hash cannot be updated after account creation

---

## ADR-006: Creator-Controlled Milestone Gate on Stream Vesting

**Status:** Accepted · **Date:** 2026-02 (Week 5)

### Context

Standard token vesting is purely time-based. Many real vesting agreements attach performance conditions: "team tokens unlock only after mainnet launch" or "investor tokens unlock after reaching 10 000 users." These events are binary but subjective — they can't be fed directly from an oracle.

### Alternatives Considered

| Option | Reason rejected |
|---|---|
| Time-only vesting | Already handled by `cliff_time` + `end_time`; doesn't cover event-based gates |
| On-chain oracle gate (Pyth/Switchboard) | Would need the oracle to publish exactly the right metric feed for arbitrary KPIs |
| Multisig approval | Governance overhead; overkill for a two-party vesting agreement |
| **Creator-controlled boolean gate** ✅ | Chosen — simple, flexible, covers any off-chain event parties agree on |

### Decision

`StreamAccount` has two fields: `milestone_enabled: bool` (set at creation, immutable) and `milestone_reached: bool` (creator-only, one-way flip via `set_milestone`). When `milestone_enabled` is `true`, `calculate_unlocked` returns 0 until `milestone_reached` is also `true` — regardless of elapsed time.

This gate composes with `cliff_time` — four distinct vesting modes from two boolean flags:

| `cliff_time` | `milestone_enabled` | Mode |
|---|---|---|
| `0` | `false` | Pure linear |
| `> 0` | `false` | Cliff + linear |
| `0` | `true` | Milestone gate + linear |
| `> 0` | `true` | Cliff AND milestone gate + linear |

### Consequences

✅ Zero oracle dependency — any off-chain event can trigger the gate  
✅ Single low-cost instruction (`set_milestone`) — no governance ceremony  
✅ Composable with cliff/linear vesting  
✅ Recipient is cryptographically protected — creator can only flip the gate or cancel (which pays vested portion to recipient)  
⚠️ Creator is the trusted party for the milestone decision — no on-chain dispute resolution  
⚠️ Gate is one-way — once set, it cannot be unset (intentional; protects the recipient)  
⚠️ No on-chain deadline for when creator must call `set_milestone` — include a fallback time in the off-chain agreement

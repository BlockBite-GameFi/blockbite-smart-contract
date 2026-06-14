# Architecture Decision Records (ADRs)

BlockBite — Smart Contract  
**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`  
**Last updated:** 2026-06-14

These records document significant architectural decisions made during the development of the BlockBite protocol. Each ADR captures the context, the decision, the alternatives considered, and the consequences — so future contributors understand not just *what* was built, but *why*.

---

## Index

| # | Title | Status | Date |
|---|---|---|---|
| ADR-001 | [Separate `_dispatch.rs` for Anchor Boilerplate](#adr-001-separate-_dispatchrs-for-anchor-boilerplate) | Accepted | 2026-01 (Week 4) |
| ADR-002 | [CEI (Checks-Effects-Interactions) Pattern on Every Instruction](#adr-002-cei-checks-effects-interactions-pattern-enforced-on-every-instruction) | Accepted | 2026-01 (Week 4) |
| ADR-003 | [`game_authority` as On-Chain Oracle for Milestone Verification](#adr-003-game_authority-as-on-chain-oracle-for-milestone-verification) | Accepted | 2026-02 (Week 5) |
| ADR-004 | [Dual PDA Architecture (Stream + Escrow as Separate Accounts)](#adr-004-dual-pda-architecture-stream--escrow-as-separate-accounts) | Accepted | 2026-01 (Week 4) |
| ADR-005 | [`title_hash` / `description_hash` as 32-byte On-Chain Commitments](#adr-005-title_hash--description_hash-as-32-byte-on-chain-commitments) | Accepted | 2026-02 (Week 5) |
| ADR-006 | [Creator-Controlled Milestone Gate on Stream Vesting](#adr-006-creator-controlled-milestone-gate-on-stream-vesting) | Accepted | 2026-02 (Week 5) |

---

## ADR-001: Separate `_dispatch.rs` for Anchor Boilerplate

**Date:** 2026-01 (Week 4)  
**Status:** Accepted

### Context

Anchor's `#[derive(Accounts)]` structs and the public instruction handler functions require a running BPF runtime (live validator or integration test) to execute. They cannot be reached from a plain `cargo test` unit test run. Meanwhile, the business logic inside each instruction (timestamp validation, unlock math, cancel computation) is pure Rust and fully unit-testable without any on-chain infrastructure.

Without a clear separation, the Anchor boilerplate becomes mixed with business logic, making unit tests impossible without a validator.

### Alternatives Considered

1. **Everything in `lib.rs`** — Common in tutorials, but bloats the entrypoint and makes unit testing impossible.
2. **One file per instruction, no separation** — Business logic and Anchor boilerplate remain coupled; `cargo test` reaches the Anchor macros and fails with unhelpful errors.
3. **Separate dispatch + pure logic files** *(chosen)* — Anchor boilerplate in one file, testable logic in per-instruction files.

### Decision

All Anchor-specific boilerplate (`#[derive(Accounts)]` structs + `pub fn *_handler` wrappers) is consolidated in a single file: `src/instructions/_dispatch.rs`. The actual business logic lives in per-instruction files (`create_stream.rs`, `withdraw.rs`, `cancel.rs`, etc.) as pure functions (`init_stream`, `compute_withdraw`, `compute_cancel`, etc.).

Coverage measurement excludes `_dispatch.rs` via `--ignore-filename-regex '_dispatch\.rs'`.

### Consequences

**Good:**
- Unit tests can import `init_stream`, `compute_withdraw`, etc. directly without spinning up a validator — fast, deterministic, offline
- Code coverage metrics accurately reflect business logic coverage, not Anchor scaffolding noise
- Per-instruction files are clean and focused — only contain validation + state mutation logic
- The separation makes the program logic readable without understanding Anchor macro expansion

**Bad:**
- Non-obvious two-file structure for someone unfamiliar with the codebase (mitigated by comments in `_dispatch.rs`)
- Adding a new instruction requires changes in two files (handler in `_dispatch.rs`, logic in its own file)

**How to apply when adding a new instruction:**
1. Create `src/instructions/new_instruction.rs` with a pure function that takes `&mut StreamAccount` (or similar) and returns `Result<()>`
2. Add the `#[derive(Accounts)]` struct and thin `pub fn new_instruction_handler(ctx, ...) -> Result<()>` wrapper in `_dispatch.rs`
3. Wire up in `lib.rs` following the existing pattern

---

## ADR-002: CEI (Checks-Effects-Interactions) Pattern Enforced on Every Instruction

**Date:** 2026-01 (Week 4)  
**Status:** Accepted

### Context

Solana programs can call out to other programs via CPI (Cross-Program Invocations). If state is mutated *after* a CPI, a malicious program could theoretically re-enter the original instruction before state is updated, enabling double-spend attacks. Rust's borrow checker enforces single mutable borrows, but does not catch logical reentrancy across CPI boundaries.

We handle tokens in `withdraw`, `cancel`, `claim_milestone`, and `close_stream` — all of which must be protected.

### Alternatives Considered

1. **No explicit ordering discipline** — Common in simple contracts; acceptable only if each instruction has a single CPI and no shared mutable state. Risky here because `cancel` has two CPIs.
2. **Reentrancy lock flag on accounts** — Additional storage overhead; complex to implement without native Solana mutex primitives.
3. **CEI ordering enforced by architecture** *(chosen)* — Zero runtime overhead; the pure-function architecture from ADR-001 naturally enforces this.

### Decision

Every instruction that mutates state AND performs a CPI (token transfer) follows strict CEI ordering:

1. **Checks** — all `require!` validations (fail fast, no state touched)
2. **Effects** — all state mutations (`amount_withdrawn += claimable`, `is_cancelled = true`, `is_claimed = true`, etc.)
3. **Interactions** — all CPI calls (`transfer_checked` via `anchor_spl`)

Mutable borrows of account data are explicitly scoped and dropped before CPI calls. The pure-function architecture enforces this naturally: `compute_withdraw` mutates state and returns the transfer amount; the handler then calls the CPI with that value — the borrow of `stream` has already ended.

**Concrete example (`claim_milestone`):**
```
1. CHECK: is_verified == true, !is_claimed, recipient == signer
2. EFFECT: milestone.is_claimed = true     ← BEFORE the CPI
3. INTERACT: transfer tokens from escrow → recipient
```

### Consequences

**Good:**
- Eliminates reentrancy risk on all instructions
- The pattern is visible at the handler level — any deviation from CEI order is immediately flagrant in code review
- Aligns with Solana security best practices and passed the Week 7 security audit

**Bad:**
- Slightly more code (explicit variable extraction after the mutable borrow drop) in `withdraw_handler` and `cancel_handler`
- Requires discipline when adding new instructions — developers must consciously maintain CEI order

**Review checklist for new instructions:** Before merging any new instruction, verify the handler reads as: all `require!` → all state mutations → all `invoke_signed`/CPI calls. No exceptions.

---

## ADR-003: `game_authority` as On-Chain Oracle for Milestone Verification

**Date:** 2026-02 (Week 5)  
**Status:** Accepted

### Context

The Campaign/Milestone reward system requires an external signal: "did this player actually reach the target level in-game?" Without a cryptographic oracle, either the player can lie (self-report) or the protocol must trust the founder (centralised).

### Alternatives Considered

1. **Trust the player** — Player self-reports via a parameter. Trivially gameable; no security.
2. **Founder manually verifies** — Founder calls a verify instruction after reviewing game logs. Acceptable for small-scale use but doesn't scale; founder is a bottleneck and a trust point.
3. **Designated game server keypair** *(chosen)* — A hot wallet operated by the game backend signs verification transactions on-chain.
4. **ZK proof** — Player submits a cryptographic proof of game state. Theoretically ideal; practically infeasible for a hackathon scope (requires custom ZK circuits and a proof system deployed on Solana).
5. **Switchboard / Pyth oracle** — General-purpose oracle networks. Adds dependency on a third-party protocol; overkill for a bespoke game event.

### Decision

Option 3: each `MilestoneAccount` stores a `game_authority: Pubkey` declared at creation time by the founder. Only a transaction signed by that keypair can call `verify_game`. The game server backend (a trusted off-chain process) monitors player progress and submits `verify_game` transactions when a player achieves the target level.

Per-milestone authority allows different game integrations (or game seasons) to use different game server keys, reducing blast radius if one key is compromised.

### Consequences

**Good:**
- Trustless from the player's perspective — they cannot fake verification; the game server must sign
- No ZK complexity — practical for hackathon scope and deployable on Solana today
- Per-milestone authority — different game integrations can use different game server keys
- Cheap: one additional public key (32 bytes) stored per milestone account

**Bad:**
- The game server is a trusted party — if it is compromised or goes offline, verifications cannot proceed. This is a centralisation trade-off acceptable for the MVP
- No slashing mechanism if the game server lies — a dishonest server could verify unearned milestones. Mitigated by the reputation cost to the game publisher
- Key rotation requires migrating to new milestone accounts (there is no update mechanism)

**Future improvement:** Replace the single `game_authority` keypair with a threshold signature scheme (e.g. Squads multisig) or a decentralised oracle (Switchboard) for production deployments.

---

## ADR-004: Dual PDA Architecture (Stream + Escrow as Separate Accounts)

**Date:** 2026-01 (Week 4)  
**Status:** Accepted

### Context

Vested tokens must be held in an account owned by the program (not by the creator), so the program can transfer them autonomously. The question is: where exactly should the tokens live?

### Alternatives Considered

1. **Single PDA with SOL balance** — Store value directly in the `StreamAccount` as lamports. Only works for SOL, not SPL tokens; incompatible with the SPL ecosystem.
2. **Creator-owned escrow** — Creator transfers tokens to a creator-controlled ATA and "promises" not to move them. Fully gameable; the creator retains custody.
3. **Dual PDA** *(chosen)* — `StreamAccount` holds metadata; a separate PDA `TokenAccount` (`escrow_token_account`) holds the SPL tokens, with authority set to the `StreamAccount` PDA.

### Decision

Dual PDA: `StreamAccount` (state, seeds `["stream", creator, recipient, seed]`) paired with `EscrowTokenAccount` (SPL vault, seeds `["escrow", stream_pubkey]`). The escrow PDA's authority is the `StreamAccount` PDA itself, so only the program can move tokens via `CpiContext::new_with_signer`.

**Why derive escrow from stream?** The escrow PDA is uniquely discoverable given only the stream PDA — no additional lookup needed. Clients compute both with two `findProgramAddressSync` calls.

### Consequences

**Good:**
- Works with any SPL token, not just SOL
- Clean separation of concerns: state in `StreamAccount`, funds in `EscrowTokenAccount`
- Escrow is uniquely discoverable from stream PDA
- `close_stream` atomically closes both accounts and returns all rent to the creator
- Anchor's `token::authority` constraint enforces escrow ownership at compile time

**Bad:**
- Two accounts to derive and pass in every instruction (higher account list overhead per transaction)
- Higher creation cost: two `init` accounts means more lamports locked as rent (~0.004 SOL per stream pair, recovered on `close_stream`)

---

## ADR-005: `title_hash` / `description_hash` as 32-byte On-Chain Commitments

**Date:** 2026-02 (Week 5)  
**Status:** Accepted

### Context

Campaign titles and milestone descriptions can be arbitrarily long strings. Storing them on-chain costs lamports proportional to byte length, hits Solana's 10 MB account limit, and cannot be updated after creation. However, storing nothing on-chain means there is no tamper-evident link between the on-chain reward and the off-chain description — a founder could silently change the campaign terms after players sign up.

### Alternatives Considered

1. **Store full strings on-chain** — Simple but expensive (∝ string length); hits size limits for longer descriptions; cannot be updated.
2. **Store nothing** — Maximum flexibility but no accountability; off-chain content can be changed or deleted without trace.
3. **32-byte hash as on-chain commitment** *(chosen)* — Fixed cost, tamper-evident, compatible with IPFS CIDs.
4. **IPFS CID stored as string** — IPFS CIDv1 is 46+ bytes as base58 string; storing as raw 32-byte multihash is equivalent but cheaper.

### Decision

Store a 32-byte SHA-256 (or IPFS CID multihash) of the content on-chain (`title_hash` in `CampaignAccount`, `description_hash` in `MilestoneAccount`). Full content is stored off-chain (IPFS, Arweave, or a backend database). Any third party can verify the off-chain content matches the on-chain commitment by hashing and comparing.

**Verification:**
```typescript
import { createHash } from "crypto";
const expectedHash = Array.from(createHash("sha256").update(offChainContent).digest());
const onChainHash  = campaign.titleHash; // [u8; 32] from fetchedAccount
const matches = JSON.stringify(expectedHash) === JSON.stringify(onChainHash);
```

### Consequences

**Good:**
- Fixed 32-byte on-chain storage cost regardless of content length
- Tamper-evident: if the off-chain content is altered, the hash no longer matches the on-chain commitment
- Compatible with both SHA-256 hashes and IPFS CIDv1 multihashes (both fit in 32 bytes)
- Future-proof: clients can move from SHA-256 to other algorithms without changing the account structure

**Bad:**
- Off-chain content availability is not guaranteed by the protocol — if the content host goes offline, the hash is unresolvable (mitigated by pinning to IPFS/Arweave)
- Clients must know which hashing scheme was used (SHA-256 vs IPFS CIDv1); the current implementation uses SHA-256 by convention
- There is no way to rotate or update the hash after account creation — changing a campaign title requires a new campaign

---

## ADR-006: Creator-Controlled Milestone Gate on Stream Vesting

**Date:** 2026-02 (Week 5)  
**Status:** Accepted

### Context

Standard token vesting is purely time-based. However, many real-world vesting arrangements attach conditions beyond time — e.g. "team tokens unlock only after mainnet launch" or "investor tokens unlock only after the product hits 10 000 users". These events are binary and subjective, making them difficult to put on-chain automatically.

### Alternatives Considered

1. **Time-only vesting** — Simplest; already handled by `cliff_time` + `end_time`. Does not cover performance/event-based gates.
2. **On-chain oracle gate** — Connect to Pyth/Switchboard to gate on a price or metric crossing a threshold. Powerful but complex; requires the oracle to publish exactly the right data feed for arbitrary KPIs.
3. **Multisig approval** — Require M-of-N signers to approve unlock. Adds governance overhead; overkill for a two-party vesting agreement.
4. **Creator-controlled boolean gate** *(chosen)* — The creator calls `set_milestone` to flip `milestone_reached = true`. Simple, flexible, covers any off-chain event the parties agree on.

### Decision

`StreamAccount` has two fields: `milestone_enabled: bool` (set at creation, immutable) and `milestone_reached: bool` (set by creator via `set_milestone`, one-way). When `milestone_enabled` is true, `calculate_unlocked` returns 0 until `milestone_reached` is true — regardless of time elapsed.

This gate is independent of `cliff_time`: you can combine both (cliff AND milestone) or use them individually.

### Consequences

**Good:**
- Zero oracle dependency — any off-chain event can trigger the gate
- Single-instruction flip (`set_milestone`) — minimal gas cost, no multisig ceremony
- Composable with cliff/linear vesting: four distinct vesting modes from two boolean flags
- Recipient has a cryptographic guarantee the creator cannot withdraw their tokens — only flip the gate or cancel (and even cancel pays the recipient their vested portion)

**Bad:**
- The creator is a trusted party for the milestone decision — if the relationship breaks down, there is no on-chain dispute resolution mechanism
- The gate is one-way: once `set_milestone` is called, it cannot be unset. A creator who calls it by mistake cannot undo it (this is intentional — it protects the recipient)
- No time limit on when the creator must call `set_milestone` — the recipient's tokens could be gated indefinitely if the creator goes offline. Recommended mitigation: include a fallback time in the off-chain agreement

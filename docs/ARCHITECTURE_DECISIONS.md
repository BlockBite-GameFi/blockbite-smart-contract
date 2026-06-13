# Architecture Decision Records (ADRs)

BlockBite — Smart Contract  
**Program ID (Devnet):** `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq`

---

## ADR-001: Separate `_dispatch.rs` for Anchor Boilerplate

**Date:** 2026-01 (Week 4)  
**Status:** Accepted

### Context

Anchor's `#[derive(Accounts)]` structs and the public instruction handler functions require a running BPF runtime (live validator or integration test) to execute. They cannot be reached from a plain `cargo test` unit test run. Meanwhile, the business logic inside each instruction (timestamp validation, unlock math, cancel computation) is pure Rust and fully unit-testable without any on-chain infrastructure.

### Decision

All Anchor-specific boilerplate (`#[derive(Accounts)]` structs + `pub fn *_handler` wrappers) is consolidated in a single file: `src/instructions/_dispatch.rs`. The actual business logic lives in per-instruction files (`create_stream.rs`, `withdraw.rs`, `cancel.rs`, etc.) as pure functions (`init_stream`, `compute_withdraw`, `compute_cancel`, etc.).

Coverage measurement excludes `_dispatch.rs` via `--ignore-filename-regex '_dispatch\.rs'`.

### Consequences

**Good:**
- Unit tests can import `init_stream`, `compute_withdraw`, etc. directly without spinning up a validator, making them fast and deterministic
- Code coverage metrics accurately reflect the business logic coverage, not Anchor scaffolding
- Per-instruction files are clean and focused — only contain validation + state mutation logic

**Bad:**
- Non-obvious two-file structure for someone unfamiliar with the codebase (mitigated by clear comments in `_dispatch.rs`)
- Adding a new instruction requires changes in two files (handler in `_dispatch.rs`, logic in its own file)

---

## ADR-002: CEI (Checks-Effects-Interactions) Pattern Enforced on Every Instruction

**Date:** 2026-01 (Week 4)  
**Status:** Accepted

### Context

Solana programs can call out to other programs (CPI — Cross-Program Invocations). If state is mutated *after* a CPI, a malicious program could re-enter the original instruction before state is updated, enabling double-spend attacks. Rust's borrow checker enforces single mutable borrows, but doesn't catch logical reentrancy across CPI boundaries.

### Decision

Every instruction that mutates state AND performs a CPI (token transfer) follows strict CEI ordering:

1. **Checks** — all `require!` validations
2. **Effects** — all state mutations (update `amount_withdrawn`, set `is_cancelled`, set `is_claimed`, etc.)
3. **Interactions** — all CPI calls (token transfers via `transfer_checked`)

Mutable borrows of account data are explicitly scoped and dropped before CPI calls. The pure-function architecture from ADR-001 naturally enforces this: `compute_withdraw` and `compute_cancel` mutate state and return the CPI amount, then the handler calls the CPI with that returned value.

### Consequences

**Good:**
- Eliminates reentrancy risk on all instructions (especially `claim_milestone` which marks `is_claimed = true` before the CPI)
- The pattern is visible and reviewable at the handler level — any deviation from CEI order is immediately obvious in code review
- Aligns with Solana security best practices and passes the Week 7 security audit

**Bad:**
- Slightly more code (explicit variable extraction after the mutable borrow) in `withdraw_handler` and `cancel_handler`
- Requires discipline when adding new instructions — developers must consciously maintain CEI order

---

## ADR-003: `game_authority` as On-Chain Oracle for Milestone Verification

**Date:** 2026-02 (Week 5)  
**Status:** Accepted

### Context

The Campaign/Milestone reward system requires an external signal: "did this player actually reach the target level in-game?" Options considered:

1. **Trust the player** — player self-reports, no verification
2. **Founder manually verifies** — founder calls a "verify" instruction after reviewing game logs
3. **Designated game server keypair** — a hot wallet operated by the game backend signs the verification transaction
4. **ZK proof** — player submits a cryptographic proof of game state

### Decision

Option 3: each `MilestoneAccount` stores a `game_authority: Pubkey` declared at creation time. Only the transaction signed by that keypair can call `verify_game`. The game server backend (a trusted off-chain process) monitors player progress and submits `verify_game` transactions when a player achieves the target level.

### Consequences

**Good:**
- Trustless from the player's perspective — they cannot fake verification (the game server must sign)
- No ZK complexity — practical for a hackathon scope and deployable on Solana today
- Per-milestone authority — different game integrations can use different game server keys
- Cheap: one additional public key (32 bytes) stored per milestone account

**Bad:**
- The game server is a trusted party — if it is compromised or goes offline, verifications cannot proceed. This is a centralisation trade-off acceptable for the MVP but should be replaced with a decentralised oracle (e.g. Switchboard) in production
- No slashing mechanism if the game server lies — a dishonest server could verify unearned milestones. Mitigated by the reputation cost to the game publisher

---

## ADR-004: Dual PDA Architecture (Stream + Escrow as Separate Accounts)

**Date:** 2026-01 (Week 4)  
**Status:** Accepted

### Context

Vested tokens must be held in an account owned by the program (not by the creator), so the program can transfer them autonomously. Two approaches:

1. **Single PDA** — store tokens directly in the `StreamAccount` using a native SOL balance (only works for SOL, not SPL tokens)
2. **Dual PDA** — `StreamAccount` holds metadata; a separate PDA `TokenAccount` (`escrow_token_account`) holds the SPL tokens

### Decision

Dual PDA: `StreamAccount` (state, seeds `["stream", creator, recipient, seed]`) paired with `EscrowTokenAccount` (SPL vault, seeds `["escrow", stream_pubkey]`). The escrow PDA's authority is the `StreamAccount` PDA itself, so only the program (via `CpiContext::new_with_signer`) can move tokens.

### Consequences

**Good:**
- Works with any SPL token, not just SOL
- Clean separation of concerns: state in `StreamAccount`, funds in `EscrowTokenAccount`
- The escrow account's derivation from `stream_pubkey` makes it uniquely discoverable given only the stream PDA
- `close_stream` can atomically close both accounts and return all rent to the creator

**Bad:**
- Two accounts to derive and pass in every instruction (more account list overhead)
- Higher creation cost: two `init` accounts means more lamports locked up as rent (recovered on `close_stream`)

---

## ADR-005: `title_hash` / `description_hash` as 32-byte On-Chain Commitments

**Date:** 2026-02 (Week 5)  
**Status:** Accepted

### Context

Campaign titles and milestone descriptions can be arbitrarily long strings. Storing them on-chain costs lamports proportional to byte length and hits Solana's account size limits. However, storing nothing on-chain means there is no tamper-evident link between the on-chain reward and the off-chain description.

### Decision

Store a 32-byte SHA-256 (or IPFS CID) hash of the content on-chain (`title_hash` in `CampaignAccount`, `description_hash` in `MilestoneAccount`). Full content is stored off-chain (IPFS, Arweave, or a backend database). Any third party can verify the off-chain content matches the on-chain commitment by hashing and comparing.

### Consequences

**Good:**
- Fixed 32-byte storage cost regardless of content length
- Tamper-evident: on-chain hash acts as a cryptographic commitment
- Compatible with both IPFS CIDs and plain SHA-256 hashes

**Bad:**
- Off-chain content availability is not guaranteed by the protocol — if the content host goes offline, the hash is unresolvable (mitigated by pinning to IPFS)
- Clients must know which hashing scheme was used (SHA-256 vs IPFS CIDv1)

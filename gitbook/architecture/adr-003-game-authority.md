# ADR-003: Game Authority as On-Chain Oracle

**Status:** Accepted
**Date:** 2025-12

---

## Context

The campaign milestone system needs to verify that a player actually reached a specific in-game level. This verification must be:

- **Trustless from the player's perspective** — players cannot self-report
- **Practical** — should not require expensive ZK proofs or third-party oracle networks
- **Flexible** — different campaigns may have different game servers or trust models
- **Auditable** — every verification is recorded on-chain with a signer

The core question: *who can authorize a milestone reward?*

---

## Decision

Each `MilestoneAccount` stores a `game_authority: Pubkey` at creation time. Only a transaction signed by this keypair can call `verify_game` for that milestone.

```rust
// In MilestoneAccount
pub game_authority: Pubkey,  // stored at create_milestone time

// In verify_game instruction
#[account(
    constraint = game_authority.key() == milestone.game_authority
        @ BlockBiteError::InvalidGameAuthority
)]
pub game_authority: Signer<'info>,
```

The game server (a backend process) holds the corresponding private key. When a player achieves a target level, the backend signs a `verify_game` transaction on their behalf.

---

## Alternatives Considered

**Option A: Founder as sole verifier**
- ✓ Simplest implementation
- ✗ Founder must be online and manually verify every achievement — doesn't scale
- ✗ No separation between campaign management (founder) and runtime verification (game server)

**Option B: ZK proofs (zkSNARK-based achievement verification)**
- ✓ Fully trustless — no game authority key needed
- ✗ Extremely complex to implement (circuit design, prover setup, verifier on-chain)
- ✗ Not practical for a semester project timeline
- ✗ Adds significant on-chain compute cost

**Option C: Third-party oracle (Chainlink, Pyth, etc.)**
- ✓ Decentralized verification
- ✗ Oracles don't support custom game state queries
- ✗ Adds a third-party dependency and cost
- ✗ Not real-time enough for interactive game rewards

**Option D: Per-milestone `game_authority` keypair (chosen)**
- ✓ Practical: game backend holds one keypair, signs transactions on player success
- ✓ Flexible: different milestones can have different authorities
- ✓ Auditable: every `verify_game` is a signed on-chain transaction
- ✗ Game server is a trusted party — key compromise can yield false verifications
- ✗ Per-milestone authority rotation requires creating new milestones

---

## Consequences

- **Positive:** The three-party flow (founder → game server → player) cleanly separates concerns. Founders set up campaigns, game servers handle runtime verification, players claim autonomously.
- **Positive:** Per-milestone `game_authority` limits blast radius if a key is compromised — only that milestone's game can be manipulated, not the entire campaign.
- **Positive:** Key rotation is possible by creating new milestones with a different `game_authority`.
- **Negative:** The game server is a trusted party in the system. The protocol does not verify *how* the game server determined the player's level — it only verifies the game server's signature. A compromised or malicious game server can false-verify any player.
- **Mitigation:** This is documented in the trust model. Teams using BlockBite for high-value campaigns should use HSMs or multi-sig for the game authority keypair.

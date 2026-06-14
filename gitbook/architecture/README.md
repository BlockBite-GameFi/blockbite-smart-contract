# Architecture Decision Records

An Architecture Decision Record (ADR) documents a significant design choice: what was decided, why, what alternatives were considered, and what tradeoffs were accepted.

BlockBite has **6 ADRs** covering the key structural choices made during development.

---

## Index

| ADR | Title | Status | Impact |
|-----|-------|--------|--------|
| [ADR-001](adr-001-dispatch-pattern.md) | Dispatch Pattern (separation of Anchor boilerplate) | Accepted | Testability, code organization |
| [ADR-002](adr-002-cei-pattern.md) | CEI (Checks-Effects-Interactions) Pattern | Accepted | Security, reentrancy prevention |
| [ADR-003](adr-003-game-authority.md) | Game Authority as On-Chain Oracle | Accepted | Trust model, key management |
| [ADR-004](adr-004-dual-pda.md) | Dual PDA Architecture (state + escrow) | Accepted | Fund custody, SPL compatibility |
| [ADR-005](adr-005-hash-commitments.md) | Hash Commitments for Off-Chain Content | Accepted | Storage efficiency, tamper-evidence |
| [ADR-006](adr-006-milestone-gate.md) | Creator-Controlled Milestone Gate | Accepted | Flexibility vs. trustlessness tradeoff |

---

## Why ADRs?

As BlockBite grows and new developers join, these records answer the most common questions:

- *"Why is there a `_dispatch.rs` file separating the account structs?"*
- *"Why does `is_claimed = true` happen before the token transfer?"*
- *"Why does each milestone have its own `game_authority` key?"*

ADRs make those answers self-documenting and version-controlled alongside the code.

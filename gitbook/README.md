# BlockBite Protocol Documentation

> **Automated, milestone-based token vesting on Solana** — a trustless "Pull" ecosystem where recipients claim tokens autonomously based on time and performance milestones.

---

## What is BlockBite?

BlockBite eliminates manual token distribution vulnerabilities — push attacks, human errors, and midnight multisig marathons — by replacing them with a **secure, on-chain vesting engine** that combines:

- **Time-locked linear vesting** with optional cliff dates
- **Milestone gates** — a creator-controlled one-way switch for off-chain events
- **Game achievement rewards** — a three-party claim flow (founder → game server → player) for play-to-earn mechanics

Any team that distributes tokens (employees, investors, DAOs, gamers) can use BlockBite to automate the entire lifecycle: deposit → vest → withdraw → close.

---

## Program IDs

| Network | Program ID |
|---------|-----------|
| **Devnet** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Localnet** | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |

---

## Quick Navigation

| I want to… | Go to |
|------------|-------|
| Understand the protocol at a high level | [Overview](getting-started/overview.md) |
| Set up my dev environment | [Setup Guide](getting-started/setup.md) |
| Create my first stream in 5 minutes | [Quick Start](getting-started/quick-start.md) |
| Look up a specific instruction | [Instruction Reference](instruction-reference/README.md) |
| Integrate BlockBite into my app | [Integration Guide](integration-guide/README.md) |
| Understand design decisions | [Architecture Decisions](architecture/README.md) |
| Look up error codes | [Error Codes](reference/error-codes.md) |

---

## Protocol at a Glance

```
Creator ──creates──▶ StreamAccount (state)
                          │
                          ├── EscrowTokenAccount (vault, PDA-controlled)
                          │
                          ├── cliff_time gate ──────────────────────────┐
                          ├── milestone_enabled + milestone_reached gate ┤
                          │                                             ▼
                          └── Recipient ──withdraw──▶ tokens flow out linearly
```

**Stream lifecycle:**

```
create_stream → [time passes / milestone set] → withdraw (repeat) → close_stream
                                                      ↑
                                               cancel (any time, splits)
```

**Campaign + Game Reward lifecycle:**

```
create_campaign → create_milestone → verify_game (game server) → claim_milestone (player)
```

---

## Key Stats

- **9 instructions** covering the full token lifecycle
- **21 error codes** with precise, actionable messages
- **4 vesting modes** from 2 boolean flags
- **41+ tests** (13 Rust unit + 28 TypeScript integration)
- **Devnet deployed** and audited (Week 7 security checklist)

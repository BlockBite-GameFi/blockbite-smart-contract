# Protocol Overview

## The Problem BlockBite Solves

Traditional token distribution relies on:

1. A multisig or EOA holding the treasury
2. A human manually pushing tokens to recipients on schedule
3. Trust that the human doesn't forget, make a mistake, or act maliciously

This creates a single point of failure — and a single attack surface.

**BlockBite flips the model.** Tokens are locked in a program-owned escrow at creation time. Recipients *pull* their vested tokens whenever they choose. The program enforces the schedule; no human intervention is needed after `create_stream`.

---

## Core Concepts

### Streams

A **stream** is a vesting schedule between a creator and a recipient for a specific SPL token. When a stream is created:

- `total_amount` tokens move from the creator's wallet into a PDA-controlled escrow
- The stream account records the schedule (start, end, cliff, milestone flags)
- The recipient can call `withdraw` at any time to pull their unlocked portion

### Vesting Formula

Tokens unlock linearly between `start_time` and `end_time`. The claimable amount at any moment is:

```
unlocked = total_amount × (now - effective_start) / (end_time - effective_start)
claimable = unlocked - amount_already_withdrawn
```

Where `effective_start` = `cliff_time` if a cliff is set, otherwise `start_time`.

### Four Vesting Modes

Two boolean flags (`cliff_time > 0` and `milestone_enabled`) produce four distinct behaviors:

| Mode | `cliff_time` | `milestone_enabled` | Unlock Behavior |
|------|-------------|---------------------|----------------|
| **Pure Linear** | `0` | `false` | Tokens unlock proportionally from `start_time` |
| **Cliff** | `> 0` | `false` | 0% before cliff, then linear from cliff to end |
| **Milestone-Gated** | `0` | `true` | 0% until `set_milestone()` called, then immediate linear |
| **Cliff + Milestone** | `> 0` | `true` | Both gates must clear; linear from cliff after milestone |

### Campaigns & Game Rewards

Beyond simple vesting, BlockBite supports **game achievement rewards** via a three-party trust model:

1. **Founder** creates a campaign with a budget and defines milestones (target levels, reward amounts)
2. **Game Server** (a keypair with `game_authority`) signs a `verify_game` transaction when a player reaches the target level
3. **Player** calls `claim_milestone` to receive their reward after verification

This allows play-to-earn mechanics where the game server acts as an on-chain oracle — without zk-proofs or expensive oracle networks.

---

## Trust Model

```
┌─────────────┐    creates stream    ┌──────────────────────┐
│   Creator   │ ──────────────────▶  │   Program (on-chain) │
└─────────────┘                      │                      │
                                     │  • Holds escrow      │
┌─────────────┐    withdraws         │  • Enforces schedule │
│  Recipient  │ ◀─────────────────── │  • No admin keys     │
└─────────────┘                      └──────────────────────┘
```

- The **program is the only authority** over the escrow. No admin, no upgrade key (post-freeze), no backdoor.
- The **creator** can cancel before full vesting (vested portion still goes to recipient).
- The **milestone gate** is creator-controlled and one-way — it cannot be unset once flipped.
- The **game authority** is declared per-milestone, allowing key rotation via new campaigns.

---

## Protocol Architecture

```
programs/blockbite/src/
├── lib.rs              — 9 instruction entry points
├── constants.rs        — MIN_LEVEL, MAX_LEVEL, difficulty values
├── errors.rs           — 21 error codes
├── utils.rs            — calculate_unlocked() (pure, testable)
├── state/
│   ├── stream.rs       — StreamAccount (196 bytes)
│   ├── campaign.rs     — CampaignAccount (90 bytes)
│   └── milestone.rs    — MilestoneAccount (158 bytes)
└── instructions/
    ├── _dispatch.rs    — Anchor account structs + handlers
    ├── create_stream.rs
    ├── withdraw.rs
    ├── cancel.rs
    ├── set_milestone.rs
    ├── close_stream.rs
    ├── create_campaign.rs
    ├── create_milestone.rs
    ├── verify_game.rs
    └── claim_milestone.rs
```

The key architectural pattern is the **dispatch split**: `_dispatch.rs` contains all Anchor boilerplate (`#[derive(Accounts)]` structs), while individual instruction files contain pure Rust functions that are unit-testable without a BPF runtime. See [ADR-001](../architecture/adr-001-dispatch-pattern.md) for rationale.

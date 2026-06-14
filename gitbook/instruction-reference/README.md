# Instruction Reference

BlockBite exposes **9 on-chain instructions** across two subsystems.

---

## Stream Vesting Instructions

| # | Instruction | Caller | One-line description |
|---|-------------|--------|----------------------|
| 1 | [`create_stream`](create-stream.md) | Creator | Initialize a vesting schedule and deposit tokens into escrow |
| 2 | [`withdraw`](withdraw.md) | Recipient | Claim unlocked tokens at any time |
| 3 | [`cancel`](cancel.md) | Creator | Cancel stream; split tokens between vested (recipient) and unvested (creator) |
| 4 | [`set_milestone`](set-milestone.md) | Creator | Flip the one-way milestone gate to unlock vesting |
| 5 | [`close_stream`](close-stream.md) | Creator | Recover rent from a fully settled stream |

## Campaign & Game Reward Instructions

| # | Instruction | Caller | One-line description |
|---|-------------|--------|----------------------|
| 6 | [`create_campaign`](create-campaign.md) | Founder | Initialize a reward campaign and deposit budget |
| 7 | [`create_milestone`](create-milestone.md) | Founder | Add a game achievement milestone with a reward amount |
| 8 | [`verify_game`](verify-game.md) | Game Server | Sign off that a player reached the required level |
| 9 | [`claim_milestone`](claim-milestone.md) | Player | Claim a verified milestone reward |

---

## Common Conventions

### Signers
Every mutating instruction requires the **correct signer**. Passing the wrong signer returns `Error::Unauthorized (6000)`.

### PDA Derivation
All state accounts are PDAs (Program Derived Addresses). The client must derive them before building the transaction. See [PDA Seeds](../reference/pda-seeds.md) for the full reference.

### Token Program
All token operations use the **SPL Token Program** (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`). Token-2022 is not currently supported.

### Timestamps
All time values are **Unix timestamps (seconds)** as `i64`. Use `Math.floor(Date.now() / 1000)` in TypeScript.

### Amounts
All token amounts are in **raw (smallest unit)** — e.g., `1_000_000` for 1 USDC (6 decimals).

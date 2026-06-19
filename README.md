# BlockBite

**Automated, milestone-based token vesting on Solana.**

BlockBite is the treasury shield for Solana builders — replacing high-risk manual distributions with a secure, automated "Pull" ecosystem. We eliminate the "Push" vulnerability where manual transfers invite fatal exploits and irreversible human errors. By integrating rewards to transparent performance milestones, BlockBite reclaims weeks of development time while converting passive users into a loyal, high-retention community.

## Quick Integrate (5 minutes)

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");
const idl        = await anchor.Program.fetchIdl(PROGRAM_ID, provider); // no local file needed
const program    = new anchor.Program(idl!, provider);

// Derive PDAs
const seed = new anchor.BN(Date.now());
const [streamPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("stream"), creator.toBuffer(), recipient.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
  PROGRAM_ID
);
const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()], PROGRAM_ID
);

// Create a 24-hour linear vesting stream
const now = Math.floor(Date.now() / 1000);
await program.methods
  .createStream(new anchor.BN(1_000_000), new anchor.BN(now), new anchor.BN(now + 86400), new anchor.BN(0), seed, false)
  .accounts({ creator, recipient, mint, creatorTokenAccount, escrowTokenAccount: escrowPda, stream: streamPda, tokenProgram, systemProgram })
  .rpc();
```

See [`docs/INTEGRATION_GUIDE.md`](./docs/INTEGRATION_GUIDE.md) for the full step-by-step walkthrough with a copy-paste quickstart script.

## Quick Info

| Item | Value |
|---|---|
| **Program ID (Devnet)** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Program ID (Localnet)** | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |
| **Framework** | Anchor 1.0.0 |
| **Network** | Solana Devnet |
| **Tests** | 41 total (28 integration + 13 Rust unit) — all green ✅ |
| **Frontend** | [blockbite-tdp.vercel.app](https://blockbite-tdp.vercel.app) |
| **Explorer** | [View on Solana Explorer (Devnet)](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet) |

## Features

- **Milestone-Based Distribution** — Set unlock conditions tied to real project milestones, not just time
- **Cliff + Linear Vesting** — Configure cliff periods and linear unlock schedules enforced on-chain
- **Trustless & Automated** — Smart contract enforces all rules; no manual transfers, no oversight gaps
- **Full Transparency** — Every vesting schedule, unlock event, and claim is recorded on-chain
- **Prorated Cancellation** — Cancel streams with fair split between creator and recipient based on unlocked amount
- **Campaign Reward System** — Game publishers create reward campaigns; players earn tokens by hitting in-game milestones
- **Game Server Oracle** — `verify_game` instruction validates player achievements via a trusted game authority key
- **Rent Recovery** — `close_stream` reclaims SOL rent from settled stream + escrow accounts

## Architecture

```
Stream Vesting
──────────────
Creator ──► create_stream ──► StreamAccount (PDA)
                                    │
                               escrow_token_account (PDA-owned vault)
                                    │
Recipient ◄── withdraw ◄───────────┘
Creator   ◄── cancel ◄─────────────┘
Creator   ──► set_milestone ──► StreamAccount.milestone_reached = true
Creator   ──► close_stream ──► (accounts closed, rent → creator)

Campaign & Milestone Rewards
────────────────────────────
Founder ──► create_campaign ──► CampaignAccount (PDA) + campaign_escrow (PDA vault)
Founder ──► create_milestone ──► MilestoneAccount (PDA)
GameServer ──► verify_game ──► MilestoneAccount.is_verified = true
Player ──► claim_milestone ──► tokens transferred from campaign_escrow → player
```

### PDA Seeds

| Account | Seeds |
|---|---|
| `StreamAccount` | `["stream", creator, recipient, seed_le_bytes]` |
| `EscrowTokenAccount` | `["escrow", stream_pubkey]` |
| `CampaignAccount` | `["campaign", founder, seed_le_bytes]` |
| `CampaignEscrowTokenAccount` | `["campaign_escrow", campaign_pubkey]` |
| `MilestoneAccount` | `["milestone", campaign_pubkey, milestone_seed_le_bytes]` |

### Key Protocol Constants

| Constant | Value | Purpose |
|---|---|---|
| `MIN_LEVEL` | 1 | Minimum game target level |
| `MAX_LEVEL` | 30 | Maximum game target level |
| `DIFFICULTY_EASY` | 1 | Easy difficulty ID |
| `DIFFICULTY_MEDIUM` | 2 | Medium difficulty ID |
| `DIFFICULTY_HARD` | 3 | Hard difficulty ID |

## Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Rust | 1.89.0+ |
| Anchor | 1.0.0 (via `avm`) |
| Solana CLI | 2.3.0+ |
| Node.js | 20+ |
| Yarn | latest |

### Setup

```bash
# Clone the repository
git clone https://github.com/BlockBite-GameFi/blockbite-smart-contract.git
cd blockbite-smart-contract

# Install JS dependencies
yarn install

# Build the program
anchor build

# Run all tests (starts local validator automatically)
anchor test
```

### Deploy to Devnet

Via GitHub Actions (recommended):

1. Add GitHub secrets:
   - `ANCHOR_PROGRAM_KEYPAIR` — contents of `target/deploy/blockbite-keypair.json`
   - `DEVNET_DEPLOYER_KEYPAIR` — contents of a funded devnet wallet JSON
2. Actions → "Deploy to Devnet" → Run workflow → type `deploy`

Or manually:

```bash
solana config set --url devnet
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
```

## Program Instructions

Full parameter tables, error codes, and code examples: [`docs/INSTRUCTION_REFERENCE.md`](./docs/INSTRUCTION_REFERENCE.md)

### Stream Vesting

| Instruction | Who Calls It | Description |
|---|---|---|
| `create_stream` | Creator | Creates a vesting stream and deposits tokens into escrow |
| `withdraw` | Recipient | Claims all currently unlocked tokens |
| `cancel` | Creator | Cancels stream — vested → recipient, unvested → creator |
| `set_milestone` | Creator | Marks milestone reached, unlocking milestone-gated streams |
| `close_stream` | Creator | Closes settled stream; recovers SOL rent from both PDAs |

### Campaign & Milestone Rewards

| Instruction | Who Calls It | Description |
|---|---|---|
| `create_campaign` | Founder | Creates a reward campaign and deposits budget into escrow |
| `create_milestone` | Founder | Adds a game milestone with reward amount and target level |
| `verify_game` | Game Server | Signs off on player achieving the target level |
| `claim_milestone` | Player | Claims reward tokens after verification |

## Account Structures

### `StreamAccount` (188 bytes + 8 discriminator = 196 total)

| Field | Type | Description |
|---|---|---|
| `creator` | `Pubkey` | Stream creator |
| `recipient` | `Pubkey` | Token recipient |
| `mint` | `Pubkey` | SPL token mint |
| `escrow_token_account` | `Pubkey` | Escrow vault PDA |
| `total_amount` | `u64` | Total tokens to vest |
| `amount_withdrawn` | `u64` | Cumulative tokens claimed |
| `start_time` | `i64` | Vesting start (unix seconds) |
| `end_time` | `i64` | Vesting end (unix seconds) |
| `cliff_time` | `i64` | Cliff timestamp (0 = no cliff) |
| `is_cancelled` | `bool` | Whether stream is cancelled |
| `bump` | `u8` | PDA canonical bump |
| `seed` | `u64` | Creator-supplied seed |
| `milestone_reached` | `bool` | Set by `set_milestone` |
| `milestone_enabled` | `bool` | Whether milestone gate is active |

### `CampaignAccount` (90 bytes)

| Field | Type | Description |
|---|---|---|
| `founder` | `Pubkey` | Campaign owner |
| `title_hash` | `[u8; 32]` | SHA-256/IPFS hash of campaign details |
| `total_budget` | `u64` | Total token budget |
| `allocated_amount` | `u64` | Sum of all milestone token_amounts |
| `milestone_count` | `u8` | Number of milestones created |
| `bump` | `u8` | PDA canonical bump |

### `MilestoneAccount` (150 bytes)

| Field | Type | Description |
|---|---|---|
| `campaign` | `Pubkey` | Parent campaign PDA |
| `recipient` | `Pubkey` | Player who can claim |
| `description_hash` | `[u8; 32]` | SHA-256/IPFS hash of milestone description |
| `game_authority` | `Pubkey` | Game server signing key |
| `token_amount` | `u64` | Reward tokens |
| `target_level` | `u8` | Required level (1–30) |
| `achieved_level` | `u8` | Level achieved (set by `verify_game`) |
| `difficulty` | `u8` | 1 = easy, 2 = medium, 3 = hard |
| `is_verified` | `bool` | Whether game server verified |
| `is_claimed` | `bool` | Whether reward was claimed |
| `bump` | `u8` | PDA canonical bump |

## Unlock Calculation

```rust
// Four vesting modes based on cliff_time and milestone_enabled flags:
// 1. Linear (cliff=0, milestone_enabled=false): pure time-based from start_time
// 2. Cliff  (cliff>0, milestone_enabled=false): 0% before cliff_time, then linear
// 3. Milestone (cliff=0, milestone_enabled=true): 0% until set_milestone called
// 4. Cliff + Milestone: both gates must pass

pub fn calculate_unlocked(stream: &StreamAccount, current_time: i64) -> u64 {
    if stream.cliff_time > 0 && current_time < stream.cliff_time { return 0; }
    if stream.milestone_enabled && !stream.milestone_reached { return 0; }
    if current_time < stream.start_time { return 0; }
    if current_time >= stream.end_time { return stream.total_amount; }

    let effective_start = if stream.cliff_time > 0 { stream.cliff_time } else { stream.start_time };
    let elapsed  = (current_time - effective_start) as u128;
    let duration = (stream.end_time - effective_start) as u128;
    ((stream.total_amount as u128) * elapsed / duration) as u64
}
```

## Error Codes

| Code | Name | Message |
|---|---|---|
| 6000 | `Unauthorized` | Signer is not authorised to perform this action |
| 6001 | `NothingToWithdraw` | No tokens available to withdraw |
| 6002 | `StreamCancelled` | Stream has been cancelled |
| 6003 | `AlreadyCancelled` | Stream is already cancelled |
| 6004 | `StreamNotStarted` | Stream has not started yet |
| 6005 | `InvalidTimestamp` | Invalid timestamps: end must be after start, cliff must be before end |
| 6006 | `InvalidAmount` | Amount must be greater than zero |
| 6007 | `InvalidRecipient` | Creator and recipient cannot be the same account |
| 6008 | `FullyVested` | Stream is fully vested and cannot be cancelled |
| 6009 | `MilestoneAlreadyReached` | Milestone has already been reached |
| 6010 | `CampaignNotFound` | Campaign not found |
| 6011 | `MilestoneNotFound` | Milestone not found |
| 6012 | `MilestoneAlreadyVerified` | Milestone has already been verified |
| 6013 | `InsufficientBudget` | Campaign budget is insufficient for this milestone |
| 6014 | `MilestoneNotVerified` | Milestone has not been verified yet |
| 6015 | `StreamNotSettled` | Stream must be fully withdrawn or cancelled before closing |
| 6016 | `InvalidGameAuthority` | Provided game authority does not match the milestone's declared game authority |
| 6017 | `AlreadyClaimed` | Milestone reward has already been claimed |
| 6018 | `InvalidLevel` | Target level must be between 1 and 30 |
| 6019 | `LevelNotReached` | Achieved level does not meet the target level requirement |
| 6020 | `InvalidDifficulty` | Difficulty must be 1 (easy), 2 (medium), or 3 (hard) |

## Project Structure

```
blockbite-smart-contract/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Build + test on every push/PR
│       └── deploy-devnet.yml         # Manual devnet deployment
├── apps/
│   └── web/                          # Next.js 14 front-end (dark mode, English)
├── clients/                          # Client SDK
├── frontend/                         # Next.js frontend (blockbite-tdp.vercel.app)
├── docs/
│   ├── INSTRUCTION_REFERENCE.md      # Full instruction docs with parameters & examples
│   ├── INTEGRATION_GUIDE.md          # Step-by-step integration tutorial
│   └── ARCHITECTURE_DECISIONS.md     # 5 ADRs explaining key design choices
├── programs/
│   └── blockbite/src/
│       ├── lib.rs                    # Program entrypoint (9 instructions)
│       ├── constants.rs              # Game level + difficulty constants
│       ├── errors.rs                 # 21 error codes
│       ├── utils.rs                  # calculate_unlocked + Rust unit tests
│       ├── state/
│       │   ├── stream.rs             # StreamAccount (188 bytes)
│       │   ├── campaign.rs           # CampaignAccount (90 bytes)
│       │   └── milestone.rs          # MilestoneAccount (150 bytes)
│       └── instructions/
│           ├── _dispatch.rs          # Anchor boilerplate (Accounts structs + handlers)
│           ├── create_stream.rs      # init_stream pure function
│           ├── withdraw.rs           # compute_withdraw pure function
│           ├── cancel.rs             # compute_cancel pure function
│           ├── set_milestone.rs      # set_milestone_reached pure function
│           ├── close_stream.rs       # validate_closeable + compute_close_dust
│           ├── create_campaign.rs    # init_campaign pure function
│           ├── create_milestone.rs   # init_milestone pure function
│           ├── verify_game.rs        # verify_game_impl pure function
│           └── claim_milestone.rs    # mark_milestone_claimed pure function
├── tests/
│   └── blockbite.ts                  # 28 TypeScript integration tests
├── trident-tests/                    # Fuzz tests (Trident)
├── Anchor.toml
├── Cargo.toml
├── AGENTS.md
├── FINAL_SUBMISSION.md
├── SECURITY_CHECKLIST.md
└── STATUS_REPORT_WEEK8.md
```

## Testing

```bash
# Run all tests (unit + integration, starts local validator)
anchor test

# Rust unit tests only (fast, no validator)
cargo test --package blockbite

# TypeScript integration tests only (validator must already be running)
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

### Test Coverage

| Suite | Count | Status |
|---|---|---|
| Rust unit tests (`calculate_unlocked` + cancel/campaign logic) | 13+ | ✅ Pass |
| Integration tests (TypeScript/Mocha) | 28 | ✅ Pass |
| **Total** | **41+** | **✅ All green** |

## CI/CD Pipeline

| Workflow | Trigger | Description |
|---|---|---|
| `Blockbite CI` | Push / PR to `main` | Build + 41 tests |
| `Deploy to Devnet` | Manual (`workflow_dispatch`) | Build + deploy + verify on devnet |

### Required Secrets

| Secret | Description |
|---|---|
| `ANCHOR_PROGRAM_KEYPAIR` | Program keypair JSON for stable program ID |
| `DEVNET_DEPLOYER_KEYPAIR` | Funded devnet wallet JSON for deployment |

## Documentation

| Document | Description |
|---|---|
| [`docs/INSTRUCTION_REFERENCE.md`](./docs/INSTRUCTION_REFERENCE.md) | Complete reference for all 9 instructions with parameters, accounts, error codes, and TypeScript examples |
| [`docs/INTEGRATION_GUIDE.md`](./docs/INTEGRATION_GUIDE.md) | Step-by-step guide to integrate with BlockBite from scratch |
| [`docs/ARCHITECTURE_DECISIONS.md`](./docs/ARCHITECTURE_DECISIONS.md) | 5 ADRs explaining key design decisions |
| [`SECURITY_CHECKLIST.md`](./SECURITY_CHECKLIST.md) | Full security audit from Week 7 |

## Security

See [`SECURITY_CHECKLIST.md`](./SECURITY_CHECKLIST.md) for the full audit.

| Protection | Implementation |
|---|---|
| Signer validation | Anchor `constraint = key() == expected @ Unauthorized` on all mutating instructions |
| PDA ownership | Escrow owned by stream/campaign PDA; `token::authority` enforced by Anchor |
| Integer overflow | All arithmetic uses `checked_*` ops or `u128` intermediate |
| Reentrancy (CEI) | State written before all CPI calls (see ADR-002) |
| Settled-only close | `close_stream` requires `is_cancelled || amount_withdrawn == total_amount` |
| Game oracle isolation | `verify_game` requires matching `game_authority` keypair signature (see ADR-003) |
| Idempotency guard | `is_claimed` flag prevents double-claiming milestone rewards |

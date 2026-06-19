# Getting Started

BlockBite is a Solana program (smart contract) built with Anchor 1.0.0. It provides two core systems:

1. **Stream Vesting** — Create trustless token vesting schedules with cliff, linear unlock, and milestone gates
2. **Campaign & Milestone Rewards** — Game publishers fund campaigns; players earn tokens by hitting in-game targets verified on-chain

---

## How It Works

```
Stream Vesting
──────────────
Creator ──► create_stream ──► StreamAccount PDA
                                    │
                               escrow_token_account (PDA-owned vault)
                                    │
Recipient ◄── withdraw ◄───────────┘   (linear unlock over time)
Creator   ◄── cancel  ◄────────────┘   (vested → recipient, unvested → creator)
Creator   ──► set_milestone ──► unlocks milestone-gated streams
Creator   ──► close_stream  ──► accounts closed, ~0.004 SOL rent returned

Campaign & Milestone Rewards
────────────────────────────
Founder    ──► create_campaign  ──► CampaignAccount PDA + campaign_escrow vault
Founder    ──► create_milestone ──► MilestoneAccount PDA
GameServer ──► verify_game      ──► MilestoneAccount.is_verified = true
Player     ──► claim_milestone  ──► tokens: campaign_escrow → player wallet
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Solana CLI | 2.3.0+ | `sh -c "$(curl -sSfL https://release.solana.com/v2.3.0/install)"` |
| Anchor CLI | 1.0.0 | `avm install 1.0.0 && avm use 1.0.0` |
| Rust | 1.89.0+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Yarn | latest | `npm i -g yarn` |

---

## Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/BlockBite-GameFi/blockbite-smart-contract.git
cd blockbite-smart-contract

# 2. Install JavaScript dependencies
yarn install

# 3. Build the program
anchor build

# 4. Run all tests (starts local validator automatically)
anchor test
```

Expected output:

```
BlockBite
  Stream Vesting
    ✔ creates a stream (1234ms)
    ✔ withdraws vested tokens (843ms)
    ✔ cancels mid-stream (721ms)
    ...
  Campaign & Milestone
    ✔ creates campaign (953ms)
    ✔ verifies game achievement (612ms)
    ✔ claims milestone reward (734ms)
  Error Guards
    ✔ rejects zero amount (432ms)
    ...

  41 passing (28s)
```

---

## Run Rust Unit Tests (Fast, No Validator)

```bash
cargo test --package blockbite
```

These test the pure `calculate_unlocked` function and cancel/campaign logic without spinning up a Solana validator. 13+ tests, runs in under 2 seconds.

---

## Deploy to Devnet

### Via GitHub Actions (recommended)

1. Add secrets to your GitHub repo:
   - `ANCHOR_PROGRAM_KEYPAIR` — contents of `target/deploy/blockbite-keypair.json`
   - `DEVNET_DEPLOYER_KEYPAIR` — contents of a funded devnet wallet JSON
2. Go to **Actions → Deploy to Devnet → Run workflow → type `deploy`**

### Manually

```bash
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
```

---

## Project Structure

```
blockbite-smart-contract/
├── programs/blockbite/src/
│   ├── lib.rs                    # Program entrypoint — 9 instructions declared
│   ├── constants.rs              # Game level + difficulty constants
│   ├── errors.rs                 # 21 error codes
│   ├── utils.rs                  # calculate_unlocked() + 13 Rust unit tests
│   ├── state/
│   │   ├── stream.rs             # StreamAccount (196 bytes)
│   │   ├── campaign.rs           # CampaignAccount (90 bytes)
│   │   └── milestone.rs          # MilestoneAccount (150 bytes)
│   └── instructions/
│       ├── _dispatch.rs          # Anchor #[derive(Accounts)] structs + handlers
│       ├── create_stream.rs      # init_stream pure function
│       ├── withdraw.rs           # compute_withdraw pure function
│       ├── cancel.rs             # compute_cancel pure function
│       ├── set_milestone.rs      # set_milestone_reached pure function
│       ├── close_stream.rs       # validate_closeable + compute_close_dust
│       ├── create_campaign.rs    # init_campaign pure function
│       ├── create_milestone.rs   # init_milestone pure function
│       ├── verify_game.rs        # verify_game_impl pure function
│       └── claim_milestone.rs    # mark_milestone_claimed pure function
├── tests/blockbite.ts            # 28 integration tests (TypeScript/Mocha)
├── clients/ts/                   # TypeScript client SDK
├── frontend/                     # Next.js frontend
├── apps/game-server/             # Game server backend
└── docs/                         # Markdown source docs
```

---

## Next Steps

- [5-Minute Quickstart](/guide/quickstart) — copy-paste script to create your first stream
- [Integration Guide](/guide/integration) — full step-by-step walkthrough
- [Instruction Reference](/reference/instructions) — every parameter, account, and error code

# BlockBite Developer Documentation

**Automated, milestone-based token vesting on Solana.**

> BlockBite eliminates the "Push" vulnerability — replacing manual distributions with a trustless, on-chain "Pull" ecosystem where tokens are released automatically based on time, cliff, and milestone conditions.

---

## At a Glance

| | |
|---|---|
| **Program ID (Devnet)** | `Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq` |
| **Program ID (Localnet)** | `9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX` |
| **Framework** | Anchor 1.0.0 |
| **Network** | Solana Devnet |
| **Instructions** | 9 on-chain instructions |
| **Tests** | 41 total — all green ✅ |
| **Frontend** | [blockbite-tdp.vercel.app](https://blockbite-tdp.vercel.app) |
| **Explorer** | [View on Solana Explorer](https://explorer.solana.com/address/Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq?cluster=devnet) |

---

## 5-Minute Quickstart

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

→ See the **[Integration Guide](INTEGRATION_GUIDE.md)** for the full walkthrough with a copy-paste quickstart script.

---

## What BlockBite Does

### Stream Vesting

Creator deposits tokens into a PDA-owned escrow. Tokens unlock linearly over time, with optional cliff and milestone gates. Recipient calls `withdraw` at any time to claim unlocked tokens.

```
Creator ──► create_stream ──► StreamAccount (PDA)
                                    │
                               EscrowTokenAccount (PDA vault)
                                    │
Recipient ◄── withdraw ◄───────────┘  (claims unlocked tokens)
Creator   ◄── cancel   ◄───────────┘  (vested → recipient, unvested → creator)
```

**Four vesting modes:**

| Mode | cliff_time | milestone_enabled | Behaviour |
|---|---|---|---|
| Pure linear | `0` | `false` | Unlocks from `start_time` to `end_time` |
| Cliff | `> 0` | `false` | 0% before cliff date, then linear |
| Milestone gate | `0` | `true` | 0% until creator calls `set_milestone` |
| Cliff + Milestone | `> 0` | `true` | Both gates must pass |

### Campaign & Milestone Rewards

Game publishers create reward campaigns. Players earn tokens by hitting in-game milestones, verified by a trusted game server oracle.

```
Founder    ──► create_campaign  ──► CampaignAccount + escrow vault
Founder    ──► create_milestone ──► MilestoneAccount (target level + reward)
GameServer ──► verify_game      ──► MilestoneAccount.is_verified = true
Player     ──► claim_milestone  ──► tokens transferred to player wallet
```

---

## Instruction Summary

### Stream Vesting

| Instruction | Caller | What it does |
|---|---|---|
| [`create_stream`](INSTRUCTION_REFERENCE.md#create_stream) | Creator | Deposits tokens into escrow, sets vesting schedule |
| [`withdraw`](INSTRUCTION_REFERENCE.md#withdraw) | Recipient | Claims all currently unlocked tokens |
| [`cancel`](INSTRUCTION_REFERENCE.md#cancel) | Creator | Splits remaining escrow: vested→recipient, unvested→creator |
| [`set_milestone`](INSTRUCTION_REFERENCE.md#set_milestone) | Creator | Unlocks milestone-gated stream |
| [`close_stream`](INSTRUCTION_REFERENCE.md#close_stream) | Creator | Closes settled stream, recovers rent |

### Campaign & Milestone Rewards

| Instruction | Caller | What it does |
|---|---|---|
| [`create_campaign`](INSTRUCTION_REFERENCE.md#create_campaign) | Founder | Creates reward campaign with token budget |
| [`create_milestone`](INSTRUCTION_REFERENCE.md#create_milestone) | Founder | Adds game milestone with reward + target level |
| [`verify_game`](INSTRUCTION_REFERENCE.md#verify_game) | Game Server | Confirms player achieved target level |
| [`claim_milestone`](INSTRUCTION_REFERENCE.md#claim_milestone) | Player | Claims reward after verification |

---

## Account Structures

### StreamAccount — 220 bytes

Stores the full vesting schedule on-chain.

| Field | Type | Description |
|---|---|---|
| `creator` | `Pubkey` | Stream creator |
| `recipient` | `Pubkey` | Token recipient |
| `mint` | `Pubkey` | SPL token mint |
| `total_amount` | `u64` | Total tokens to vest |
| `amount_withdrawn` | `u64` | Cumulative tokens claimed |
| `start_time` | `i64` | Vesting start (unix) |
| `end_time` | `i64` | Vesting end (unix) |
| `cliff_time` | `i64` | Cliff timestamp (0 = none) |
| `is_cancelled` | `bool` | Whether cancelled |
| `milestone_enabled` | `bool` | Whether milestone gate is active |
| `milestone_reached` | `bool` | Whether milestone was confirmed |

### CampaignAccount — 90 bytes

| Field | Type | Description |
|---|---|---|
| `founder` | `Pubkey` | Campaign owner |
| `title_hash` | `[u8; 32]` | SHA-256 hash of campaign details |
| `total_budget` | `u64` | Total token budget |
| `allocated_amount` | `u64` | Reserved for milestones |
| `milestone_count` | `u8` | Number of milestones |

### MilestoneAccount — 150 bytes

| Field | Type | Description |
|---|---|---|
| `campaign` | `Pubkey` | Parent campaign |
| `recipient` | `Pubkey` | Player wallet |
| `game_authority` | `Pubkey` | Game server signing key |
| `token_amount` | `u64` | Reward tokens |
| `target_level` | `u8` | Required level (1–30) |
| `difficulty` | `u8` | 1=easy, 2=medium, 3=hard |
| `is_verified` | `bool` | Verified by game server |
| `is_claimed` | `bool` | Claimed by player |

---

## PDA Derivation

```typescript
// Stream state
PublicKey.findProgramAddressSync(
  [Buffer.from("stream"), creator.toBuffer(), recipient.toBuffer(), seed_le8],
  PROGRAM_ID
)

// Escrow vault  
PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  PROGRAM_ID
)

// Campaign
PublicKey.findProgramAddressSync(
  [Buffer.from("campaign"), founder.toBuffer(), campaignSeed_le8],
  PROGRAM_ID
)

// Campaign escrow
PublicKey.findProgramAddressSync(
  [Buffer.from("campaign_escrow"), campaignPda.toBuffer()],
  PROGRAM_ID
)

// Milestone
PublicKey.findProgramAddressSync(
  [Buffer.from("milestone"), campaignPda.toBuffer(), milestoneSeed_le8],
  PROGRAM_ID
)
```

---

## Documentation

| Document | Description |
|---|---|
| [Integration Guide](INTEGRATION_GUIDE.md) | Step-by-step tutorial with working TypeScript code |
| [Instruction Reference](INSTRUCTION_REFERENCE.md) | Full parameter + account tables, error codes |
| [Architecture Decisions](ARCHITECTURE_DECISIONS.md) | Why we built it this way (6 ADRs) |

---

## Local Setup

```bash
git clone https://github.com/BlockBite-GameFi/blockbite-smart-contract.git
cd blockbite-smart-contract
yarn install
anchor build
anchor test     # runs all 41 tests
```

**Prerequisites:** Rust 1.89+, Anchor 1.0.0 (via `avm`), Solana CLI 2.3.0+, Node.js 20+

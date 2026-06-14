# Account Structures

All on-chain accounts with their exact field layouts, byte sizes, and discriminators.

---

## StreamAccount

**PDA:** `["stream", creator, recipient, seed_le8]`
**Total size:** 196 bytes (8 discriminator + 188 data)

| Field | Type | Offset | Size (bytes) | Description |
|-------|------|--------|-------------|-------------|
| discriminator | `[u8; 8]` | 0 | 8 | Anchor account tag (auto) |
| `creator` | `Pubkey` | 8 | 32 | Stream creator's public key |
| `recipient` | `Pubkey` | 40 | 32 | Token recipient's public key |
| `mint` | `Pubkey` | 72 | 32 | SPL token mint |
| `escrow_token_account` | `Pubkey` | 104 | 32 | Escrow PDA address (stored for CPI) |
| `total_amount` | `u64` | 136 | 8 | Total tokens to vest (raw) |
| `amount_withdrawn` | `u64` | 144 | 8 | Cumulative tokens claimed |
| `start_time` | `i64` | 152 | 8 | Vesting start (Unix seconds) |
| `end_time` | `i64` | 160 | 8 | Vesting end (Unix seconds) |
| `cliff_time` | `i64` | 168 | 8 | Cliff date (0 = no cliff) |
| `is_cancelled` | `bool` | 176 | 1 | Cancellation flag |
| `bump` | `u8` | 177 | 1 | PDA canonical bump |
| `seed` | `u64` | 178 | 8 | Creator-supplied seed |
| `milestone_reached` | `bool` | 186 | 1 | One-way milestone gate state |
| `milestone_enabled` | `bool` | 187 | 1 | Whether milestone gate is active |
| *(padding)* | | 188 | 8 | Rust alignment |
| **Total** | | | **196** | |

### Rust Definition

```rust
#[account]
pub struct StreamAccount {
    pub creator:               Pubkey,   // 32
    pub recipient:             Pubkey,   // 32
    pub mint:                  Pubkey,   // 32
    pub escrow_token_account:  Pubkey,   // 32
    pub total_amount:          u64,      //  8
    pub amount_withdrawn:      u64,      //  8
    pub start_time:            i64,      //  8
    pub end_time:              i64,      //  8
    pub cliff_time:            i64,      //  8
    pub is_cancelled:          bool,     //  1
    pub bump:                  u8,       //  1
    pub seed:                  u64,      //  8
    pub milestone_reached:     bool,     //  1
    pub milestone_enabled:     bool,     //  1
}

impl StreamAccount {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 1 + 1;
    // = 196 bytes
}
```

### TypeScript Fetch

```typescript
const stream = await program.account.streamAccount.fetch(streamPda);
// stream.creator          → PublicKey
// stream.recipient        → PublicKey
// stream.mint             → PublicKey
// stream.totalAmount      → BN
// stream.amountWithdrawn  → BN
// stream.startTime        → BN (unix seconds)
// stream.endTime          → BN (unix seconds)
// stream.cliffTime        → BN (0 if no cliff)
// stream.isCancelled      → boolean
// stream.milestoneEnabled → boolean
// stream.milestoneReached → boolean
// stream.seed             → BN
// stream.bump             → number
```

### memcmp Filters for Account Queries

| Field | Offset | Use |
|-------|--------|-----|
| `creator` | 8 | Find all streams created by an address |
| `recipient` | 40 | Find all streams for a recipient |
| `mint` | 72 | Find all streams for a specific token |

---

## CampaignAccount

**PDA:** `["campaign", founder, seed_le8]`
**Total size:** 90 bytes (8 discriminator + 82 data)

| Field | Type | Offset | Size (bytes) | Description |
|-------|------|--------|-------------|-------------|
| discriminator | `[u8; 8]` | 0 | 8 | Anchor account tag |
| `founder` | `Pubkey` | 8 | 32 | Campaign creator's public key |
| `title_hash` | `[u8; 32]` | 40 | 32 | SHA-256 hash of campaign title |
| `total_budget` | `u64` | 72 | 8 | Total token budget |
| `allocated_amount` | `u64` | 80 | 8 | Sum of all milestone token amounts |
| `milestone_count` | `u8` | 88 | 1 | Number of milestones created |
| `bump` | `u8` | 89 | 1 | PDA canonical bump |
| **Total** | | | **90** | |

### Rust Definition

```rust
#[account]
pub struct CampaignAccount {
    pub founder:          Pubkey,
    pub title_hash:       [u8; 32],
    pub total_budget:     u64,
    pub allocated_amount: u64,
    pub milestone_count:  u8,
    pub bump:             u8,
}

impl CampaignAccount {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1; // = 90 bytes
}
```

### TypeScript Fetch

```typescript
const campaign = await program.account.campaignAccount.fetch(campaignPda);
// campaign.founder          → PublicKey
// campaign.titleHash        → number[] (32 bytes)
// campaign.totalBudget      → BN
// campaign.allocatedAmount  → BN
// campaign.milestoneCount   → number
// campaign.bump             → number
```

---

## MilestoneAccount

**PDA:** `["milestone", campaign_pda, milestone_seed_le8]`
**Total size:** 158 bytes (8 discriminator + 150 data)

| Field | Type | Offset | Size (bytes) | Description |
|-------|------|--------|-------------|-------------|
| discriminator | `[u8; 8]` | 0 | 8 | Anchor account tag |
| `campaign` | `Pubkey` | 8 | 32 | Parent campaign PDA |
| `recipient` | `Pubkey` | 40 | 32 | Player who can claim |
| `description_hash` | `[u8; 32]` | 72 | 32 | SHA-256 of milestone description |
| `game_authority` | `Pubkey` | 104 | 32 | Game server public key |
| `token_amount` | `u64` | 136 | 8 | Reward tokens |
| `target_level` | `u8` | 144 | 1 | Required level (1–30) |
| `achieved_level` | `u8` | 145 | 1 | Level achieved (set by `verify_game`) |
| `difficulty` | `u8` | 146 | 1 | 1=easy, 2=medium, 3=hard |
| `is_verified` | `bool` | 147 | 1 | Game server verification flag |
| `is_claimed` | `bool` | 148 | 1 | Claim idempotency guard |
| `bump` | `u8` | 149 | 1 | PDA canonical bump |
| *(padding)* | | 150 | 8 | Rust alignment |
| **Total** | | | **158** | |

### Rust Definition

```rust
#[account]
pub struct MilestoneAccount {
    pub campaign:         Pubkey,
    pub recipient:        Pubkey,
    pub description_hash: [u8; 32],
    pub game_authority:   Pubkey,
    pub token_amount:     u64,
    pub target_level:     u8,
    pub achieved_level:   u8,
    pub difficulty:       u8,
    pub is_verified:      bool,
    pub is_claimed:       bool,
    pub bump:             u8,
}

impl MilestoneAccount {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 1 + 1 + 1; // = 158 bytes
}
```

### TypeScript Fetch

```typescript
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
// milestone.campaign         → PublicKey (parent campaign PDA)
// milestone.recipient        → PublicKey (player)
// milestone.descriptionHash  → number[] (32 bytes)
// milestone.gameAuthority    → PublicKey
// milestone.tokenAmount      → BN
// milestone.targetLevel      → number (1–30)
// milestone.achievedLevel    → number (set after verify_game)
// milestone.difficulty       → number (1=easy, 2=med, 3=hard)
// milestone.isVerified       → boolean
// milestone.isClaimed        → boolean
// milestone.bump             → number
```

---

## EscrowTokenAccount / CampaignEscrowTokenAccount

These are standard **SPL Token accounts** (165 bytes). Their authority is the corresponding state PDA. Fields follow the SPL Token account layout:

| Field | Offset | Size | Description |
|-------|--------|------|-------------|
| `mint` | 0 | 32 | Token mint |
| `owner` (authority) | 32 | 32 | The StreamAccount or CampaignAccount PDA |
| `amount` | 64 | 8 | Token balance |
| `delegate` | 72 | 36 | Unused (COption) |
| `state` | 108 | 1 | Initialized = 1 |
| `is_native` | 109 | 12 | Unused |
| `delegated_amount` | 121 | 8 | Unused |
| `close_authority` | 129 | 36 | Unused |
| **Total** | | **165** | |

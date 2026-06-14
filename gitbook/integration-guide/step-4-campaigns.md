# Step 4 — Campaigns & Game Rewards

This step implements the full three-party play-to-earn flow: founder creates a campaign with milestones, the game server verifies achievements, and players claim rewards.

---

## Overview

```
[Founder] create_campaign
[Founder] create_milestone (one per level/achievement)
    ↓
[Game Server] verify_game  (when player reaches target level)
    ↓
[Player] claim_milestone   (withdraws tokens from campaign escrow)
```

---

## Part A: Create a Campaign (Founder)

```typescript
import { createHash } from "crypto";
import {
  deriveCampaignPda,
  deriveCampaignEscrowPda,
  createBlockBiteClient,
} from "./blockbite-client";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

const program = createBlockBiteClient(connection, new anchor.Wallet(founder));

// Campaign seed — must be unique per founder
const campaignSeed = new anchor.BN(1);

// Derive PDAs
const [campaignPda] = deriveCampaignPda(founder.publicKey, campaignSeed);
const [campaignEscrowPda] = deriveCampaignEscrowPda(campaignPda);

// Hash the title (full content stored off-chain)
const titleHash = createHash("sha256").update("Season 1 Rewards").digest();

// Founder's token account (source of budget)
const founderAta = await getOrCreateAssociatedTokenAccount(
  connection, founder, mint, founder.publicKey
);

// Create campaign with 100-token budget
const campaignTx = await program.methods
  .createCampaign(
    [...titleHash],              // title_hash [u8; 32]
    new anchor.BN(100_000_000), // 100 tokens (6 decimals)
    campaignSeed
  )
  .accounts({
    founder: founder.publicKey,
    mint,
    founderTokenAccount: founderAta.address,
    campaignAccount: campaignPda,
    campaignEscrowTokenAccount: campaignEscrowPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .signers([founder])
  .rpc();

console.log("✓ Campaign created! TX:", campaignTx);
console.log("  Campaign PDA:", campaignPda.toBase58());
```

---

## Part B: Add Milestones (Founder)

```typescript
import { deriveMilestonePda } from "./blockbite-client";

const gameAuthority = Keypair.generate(); // your game server's keypair
const player = Keypair.generate();        // the player's wallet

// Create a milestone: reach level 10 → earn 5 tokens
const milestoneSeed = new anchor.BN(1);
const [milestonePda] = deriveMilestonePda(campaignPda, milestoneSeed);

const descHash = createHash("sha256")
  .update("Complete the Dragon Dungeon at Level 10")
  .digest();

const milestoneTx = await program.methods
  .createMilestone(
    [...descHash],              // description_hash [u8; 32]
    campaignSeed,               // campaign_seed (to find parent campaign PDA)
    milestoneSeed,              // milestone_seed (unique within campaign)
    new anchor.BN(5_000_000),   // 5 tokens reward
    gameAuthority.publicKey,    // game server keypair's pubkey
    player.publicKey,           // player who can claim
    10,                         // target level: 10
    2                           // difficulty: medium
  )
  .accounts({
    founder: founder.publicKey,
    campaignAccount: campaignPda,
    milestoneAccount: milestonePda,
    systemProgram: SystemProgram.programId,
  })
  .signers([founder])
  .rpc();

console.log("✓ Milestone created! TX:", milestoneTx);
```

---

## Part C: Verify Achievement (Game Server)

This runs on your **game backend** — the game authority keypair signs the transaction.

```typescript
// Simulated game server endpoint
const serverProgram = createBlockBiteClient(
  connection,
  new anchor.Wallet(gameAuthority) // game server wallet
);

const verifyTx = await serverProgram.methods
  .verifyGame(
    milestoneSeed,
    12           // achieved_level: player reached level 12 (target was 10 ✓)
  )
  .accounts({
    gameAuthority: gameAuthority.publicKey,
    campaignAccount: campaignPda,
    milestoneAccount: milestonePda,
  })
  .signers([gameAuthority])
  .rpc();

console.log("✓ Achievement verified! TX:", verifyTx);

// Confirm state
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
console.log("isVerified:", milestone.isVerified);     // true
console.log("achievedLevel:", milestone.achievedLevel); // 12
```

---

## Part D: Claim Reward (Player)

The player calls this from their wallet (browser/mobile):

```typescript
const playerProgram = createBlockBiteClient(
  connection,
  new anchor.Wallet(player)
);

// Player needs an ATA for the campaign's token
const playerAta = await getOrCreateAssociatedTokenAccount(
  connection, player, mint, player.publicKey
);

const claimTx = await playerProgram.methods
  .claimMilestone(
    milestoneSeed,
    campaignSeed
  )
  .accounts({
    player: player.publicKey,
    campaignAccount: campaignPda,
    milestoneAccount: milestonePda,
    campaignEscrowTokenAccount: campaignEscrowPda,
    playerTokenAccount: playerAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([player])
  .rpc();

console.log("✓ Reward claimed! TX:", claimTx);

// Verify claim
const balance = await connection.getTokenAccountBalance(playerAta.address);
console.log("Player balance:", balance.value.uiAmount, "tokens"); // ~5.0
```

---

## Read Campaign State

```typescript
const campaign = await program.account.campaignAccount.fetch(campaignPda);
console.log({
  founder:          campaign.founder.toBase58(),
  totalBudget:      campaign.totalBudget.toString(),
  allocatedAmount:  campaign.allocatedAmount.toString(),
  milestoneCount:   campaign.milestoneCount,
});

// Available budget remaining
const remaining = BigInt(campaign.totalBudget.toString()) -
                  BigInt(campaign.allocatedAmount.toString());
console.log("Budget remaining:", remaining.toString());
```

## Read Milestone State

```typescript
const milestone = await program.account.milestoneAccount.fetch(milestonePda);
console.log({
  recipient:       milestone.recipient.toBase58(),
  gameAuthority:   milestone.gameAuthority.toBase58(),
  tokenAmount:     milestone.tokenAmount.toString(),
  targetLevel:     milestone.targetLevel,
  achievedLevel:   milestone.achievedLevel,
  difficulty:      milestone.difficulty,
  isVerified:      milestone.isVerified,
  isClaimed:       milestone.isClaimed,
});
```

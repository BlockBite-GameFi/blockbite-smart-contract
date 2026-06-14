# Step 2 — Create a Stream

This step walks through the full stream creation flow: deriving PDAs, building the transaction, and reading back state.

---

## Prerequisites

Make sure the recipient already has an ATA for the token mint. If you skip this, `withdraw` and `cancel` will fail.

```typescript
import {
  getOrCreateAssociatedTokenAccount,
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SystemProgram, SYSVAR_RENT_PUBKEY, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  deriveStreamPda,
  deriveEscrowPda,
  createBlockBiteClient,
} from "./blockbite-client";

// Setup
const connection = /* your connection */;
const creator = /* your payer keypair */;
const recipient = Keypair.generate(); // or a real user's pubkey

// Create or use an existing SPL mint
const mint = await createMint(connection, creator, creator.publicKey, null, 6);

// Creator's token account (source of vested tokens)
const creatorAta = await getOrCreateAssociatedTokenAccount(
  connection, creator, mint, creator.publicKey
);

// Recipient's token account — MUST exist before stream can pay out
const recipientAta = await getOrCreateAssociatedTokenAccount(
  connection, creator, mint, recipient.publicKey
);

// Mint some tokens to the creator
await mintTo(connection, creator, mint, creatorAta.address, creator, 10_000_000);
```

---

## Create a Linear Vesting Stream

```typescript
const program = createBlockBiteClient(connection, new anchor.Wallet(creator));

const seed = new anchor.BN(Date.now()); // unique per stream pair
const now = Math.floor(Date.now() / 1000);

// Derive PDAs (deterministic — no network call needed)
const [streamPda] = deriveStreamPda(creator.publicKey, recipient.publicKey, seed);
const [escrowPda] = deriveEscrowPda(streamPda);

const txSig = await program.methods
  .createStream(
    new anchor.BN(10_000_000),       // 10 tokens (6 decimals)
    new anchor.BN(now),               // start immediately
    new anchor.BN(now + 86400 * 365), // 1 year vest
    new anchor.BN(0),                 // no cliff
    seed,
    false                             // no milestone gate
  )
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .signers([creator])
  .rpc();

console.log("✓ Stream created:", txSig);
console.log("  Stream PDA:", streamPda.toBase58());
console.log("  Escrow PDA:", escrowPda.toBase58());
```

---

## Create a Stream With a Cliff

```typescript
const NINETY_DAYS = 86400 * 90;
const ONE_YEAR   = 86400 * 365;

const txSig = await program.methods
  .createStream(
    new anchor.BN(5_000_000),
    new anchor.BN(now),
    new anchor.BN(now + ONE_YEAR),
    new anchor.BN(now + NINETY_DAYS), // tokens locked until 90-day cliff
    seed,
    false
  )
  .accounts({ /* same as above */ })
  .rpc();
```

With this config, `withdraw` returns `NothingToWithdraw (6001)` until the 90-day cliff passes. After the cliff, linear vesting from the cliff date begins immediately.

---

## Create a Milestone-Gated Stream

```typescript
const txSig = await program.methods
  .createStream(
    new anchor.BN(2_000_000),
    new anchor.BN(now),
    new anchor.BN(now + 86400 * 180), // 6-month vest window
    new anchor.BN(0),                  // no cliff
    seed,
    true                               // milestone gate ENABLED
  )
  .accounts({ /* same as above */ })
  .rpc();

// At this point: recipient calls withdraw → NothingToWithdraw (milestone not set)
// Creator calls set_milestone to unlock:
await program.methods
  .setMilestone()
  .accounts({
    creator: creator.publicKey,
    streamAccount: streamPda,
  })
  .signers([creator])
  .rpc();

// Now recipient can withdraw tokens vested since start_time
```

---

## Read Stream State

```typescript
const stream = await program.account.streamAccount.fetch(streamPda);

console.log({
  creator:          stream.creator.toBase58(),
  recipient:        stream.recipient.toBase58(),
  mint:             stream.mint.toBase58(),
  totalAmount:      stream.totalAmount.toString(),
  amountWithdrawn:  stream.amountWithdrawn.toString(),
  startTime:        new Date(stream.startTime.toNumber() * 1000).toISOString(),
  endTime:          new Date(stream.endTime.toNumber() * 1000).toISOString(),
  cliffTime:        stream.cliffTime.toNumber(),
  isCancelled:      stream.isCancelled,
  milestoneEnabled: stream.milestoneEnabled,
  milestoneReached: stream.milestoneReached,
  seed:             stream.seed.toString(),
});
```

---

## List All Streams for a Recipient

```typescript
// Fetch all StreamAccount PDAs where recipient = somePublicKey
const streams = await program.account.streamAccount.all([
  {
    memcmp: {
      offset: 8 + 32, // discriminator (8) + creator (32) = recipient field
      bytes: recipient.publicKey.toBase58(),
    },
  },
]);

console.log(`Found ${streams.length} streams for this recipient`);
streams.forEach((s) => {
  console.log(s.publicKey.toBase58(), "—", s.account.totalAmount.toString(), "tokens");
});
```

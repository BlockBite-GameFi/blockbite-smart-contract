# Quick Start (5 minutes)

This walkthrough creates a real stream on devnet and withdraws from it. You'll need ~0.01 SOL.

---

## Install the Client Library

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

Download the IDL:

```bash
# From the repo
cp target/idl/blockbite.json ./blockbite.json
```

---

## Connect & Setup

```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import idl from "./blockbite.json";

const PROGRAM_ID = new PublicKey("Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq");

// Connect to devnet
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const wallet = anchor.Wallet.local(); // uses ~/.config/solana/id.json
const provider = new anchor.AnchorProvider(connection, wallet, {});
anchor.setProvider(provider);

const program = new anchor.Program(idl as anchor.Idl, provider);
```

---

## Create a Test Token

```typescript
// Creator and recipient keypairs
const creator = wallet.payer;
const recipient = Keypair.generate();

// Create a token mint (decimals = 6, like USDC)
const mint = await createMint(
  connection,
  creator,
  creator.publicKey,  // mint authority
  null,               // freeze authority
  6
);

// Creator's token account
const creatorAta = await getOrCreateAssociatedTokenAccount(
  connection, creator, mint, creator.publicKey
);

// Recipient's token account (must exist before stream can pay out)
const recipientAta = await getOrCreateAssociatedTokenAccount(
  connection, creator, mint, recipient.publicKey
);

// Mint 1,000,000 tokens (1 token with 6 decimals = 1_000_000 raw)
await mintTo(connection, creator, mint, creatorAta.address, creator, 1_000_000);

console.log("Mint:", mint.toBase58());
console.log("Creator ATA:", creatorAta.address.toBase58());
```

---

## Create a Stream

```typescript
const seed = new anchor.BN(Date.now()); // unique seed
const now = Math.floor(Date.now() / 1000);

// Derive PDAs
const [streamPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("stream"),
    creator.publicKey.toBuffer(),
    recipient.publicKey.toBuffer(),
    seed.toArrayLike(Buffer, "le", 8),
  ],
  PROGRAM_ID
);

const [escrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), streamPda.toBuffer()],
  PROGRAM_ID
);

// Create a 30-second stream (useful for quick testing)
const tx = await program.methods
  .createStream(
    new anchor.BN(1_000_000),  // total_amount: 1,000,000 raw tokens
    new anchor.BN(now),         // start_time: now
    new anchor.BN(now + 30),    // end_time: 30 seconds from now
    new anchor.BN(0),           // cliff_time: no cliff
    seed,                       // seed: unique identifier
    false                       // milestone_enabled: no milestone gate
  )
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    mint,
    creatorTokenAccount: creatorAta.address,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .signers([creator])
  .rpc();

console.log("Stream created! TX:", tx);
console.log("Stream PDA:", streamPda.toBase58());
```

---

## Withdraw Vested Tokens

```typescript
// Wait 15 seconds — 50% of the stream should now be unlocked
await new Promise((r) => setTimeout(r, 15_000));

const withdrawTx = await program.methods
  .withdraw()
  .accounts({
    recipient: recipient.publicKey,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
  })
  .signers([recipient])
  .rpc();

console.log("Withdrew tokens! TX:", withdrawTx);

// Check recipient balance
const balance = await connection.getTokenAccountBalance(recipientAta.address);
console.log("Recipient balance:", balance.value.uiAmount);
// Expected: ~500,000 raw (0.5 tokens) ±small delta
```

---

## Read Stream State

```typescript
const stream = await program.account.streamAccount.fetch(streamPda);

console.log({
  creator: stream.creator.toBase58(),
  recipient: stream.recipient.toBase58(),
  totalAmount: stream.totalAmount.toString(),
  amountWithdrawn: stream.amountWithdrawn.toString(),
  startTime: new Date(stream.startTime.toNumber() * 1000).toISOString(),
  endTime: new Date(stream.endTime.toNumber() * 1000).toISOString(),
  isCancelled: stream.isCancelled,
  milestoneEnabled: stream.milestoneEnabled,
  milestoneReached: stream.milestoneReached,
});
```

---

## Next Steps

- [Full Integration Guide](../integration-guide/README.md) — campaigns, milestone gates, error handling
- [Instruction Reference](../instruction-reference/README.md) — every parameter documented
- [Error Codes](../reference/error-codes.md) — handle every failure case

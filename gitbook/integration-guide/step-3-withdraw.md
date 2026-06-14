# Step 3 — Withdraw, Cancel, and Close

This step covers the recipient's lifecycle: withdrawing vested tokens, handling cancellations, and closing settled streams.

---

## Withdraw Vested Tokens

The recipient can call `withdraw` at any time. The program calculates the unlocked amount on-chain and transfers only what's available.

```typescript
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getClaimable } from "./blockbite-client";

// Optional: check claimable amount before sending tx (saves fees if 0)
const stream = await program.account.streamAccount.fetch(streamPda);
const nowSecs = Math.floor(Date.now() / 1000);
const claimable = getClaimable(stream, nowSecs);

if (claimable === 0n) {
  console.log("Nothing to withdraw yet");
} else {
  console.log(`Withdrawing ${claimable.toString()} raw tokens`);

  const txSig = await program.methods
    .withdraw()
    .accounts({
      recipient: recipient.publicKey,
      streamAccount: streamPda,
      escrowTokenAccount: escrowPda,
      recipientTokenAccount: recipientAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([recipient])
    .rpc();

  console.log("✓ Withdrawn! TX:", txSig);
}
```

### Check Balance After Withdrawal

```typescript
const balance = await connection.getTokenAccountBalance(recipientAta.address);
console.log("Recipient balance:", balance.value.uiAmount, "tokens");
```

---

## Cancel a Stream (Creator)

The creator can cancel at any time before full vesting. Tokens are split:
- Vested portion → recipient
- Unvested portion → creator

```typescript
const cancelTx = await program.methods
  .cancel()
  .accounts({
    creator: creator.publicKey,
    recipient: recipient.publicKey,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    recipientTokenAccount: recipientAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("✓ Stream cancelled! TX:", cancelTx);

// Verify state
const stream = await program.account.streamAccount.fetch(streamPda);
console.log("isCancelled:", stream.isCancelled); // true
```

After cancellation, `withdraw` returns `StreamCancelled (6002)`. Call `close_stream` to recover rent.

---

## Close Stream (Recover Rent)

After a stream is either **fully withdrawn** (`amount_withdrawn == total_amount`) or **cancelled**, the creator can close both accounts and recover ~0.004 SOL in rent.

```typescript
const closeTx = await program.methods
  .closeStream()
  .accounts({
    creator: creator.publicKey,
    streamAccount: streamPda,
    escrowTokenAccount: escrowPda,
    creatorTokenAccount: creatorAta.address,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([creator])
  .rpc();

console.log("✓ Stream closed! Rent recovered. TX:", closeTx);

// The PDAs no longer exist — fetching them will throw
try {
  await program.account.streamAccount.fetch(streamPda);
} catch {
  console.log("Stream account closed (expected)");
}
```

---

## Complete Stream Lifecycle Example

```typescript
async function fullStreamLifecycle() {
  const seed = new anchor.BN(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const [streamPda] = deriveStreamPda(creator.publicKey, recipient.publicKey, seed);
  const [escrowPda] = deriveEscrowPda(streamPda);

  // 1. Create a 60-second stream (good for testing)
  await program.methods
    .createStream(
      new anchor.BN(1_000_000),
      new anchor.BN(now),
      new anchor.BN(now + 60),
      new anchor.BN(0),
      seed,
      false
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
  console.log("1. Stream created");

  // 2. Wait 30 seconds (50% vested)
  await new Promise((r) => setTimeout(r, 30_000));

  // 3. Withdraw (should get ~500,000 tokens)
  await program.methods
    .withdraw()
    .accounts({
      recipient: recipient.publicKey,
      streamAccount: streamPda,
      escrowTokenAccount: escrowPda,
      recipientTokenAccount: recipientAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([recipient])
    .rpc();
  console.log("2. Withdrew 50%");

  // 4. Wait 30 more seconds (100% vested)
  await new Promise((r) => setTimeout(r, 30_000));

  // 5. Withdraw remainder
  await program.methods
    .withdraw()
    .accounts({
      recipient: recipient.publicKey,
      streamAccount: streamPda,
      escrowTokenAccount: escrowPda,
      recipientTokenAccount: recipientAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([recipient])
    .rpc();
  console.log("3. Withdrew remaining 50%");

  // 6. Close stream (recover rent)
  await program.methods
    .closeStream()
    .accounts({
      creator: creator.publicKey,
      streamAccount: streamPda,
      escrowTokenAccount: escrowPda,
      creatorTokenAccount: creatorAta.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([creator])
    .rpc();
  console.log("4. Stream closed, rent recovered");
}
```

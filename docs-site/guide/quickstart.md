# 5-Minute Quickstart

Create your first vesting stream on Solana Devnet in 5 minutes. Copy-paste ready.

---

## Install

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

---

## Full Script

Save as `blockbite-quickstart.ts` and run with `npx ts-node blockbite-quickstart.ts`.

```typescript
/**
 * BlockBite — Complete Quickstart (Devnet)
 * Creates a stream, waits 2s, withdraws, then reads state.
 * Run: npx ts-node blockbite-quickstart.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const PROGRAM_ID = new PublicKey(
  "Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq"
);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  // ── 1. Connect & fund wallets ──────────────────────────────────────────────
  console.log("Connecting to devnet…");
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const creator   = Keypair.generate();
  const recipient = Keypair.generate();

  await connection.requestAirdrop(creator.publicKey,   2 * LAMPORTS_PER_SOL);
  await connection.requestAirdrop(recipient.publicKey, LAMPORTS_PER_SOL);
  await sleep(4000); // wait for airdrop confirmation

  // ── 2. Load program ────────────────────────────────────────────────────────
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(creator),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const idl    = await Program.fetchIdl(PROGRAM_ID, provider);
  const program = new Program(idl!, provider);
  console.log("Program loaded:", PROGRAM_ID.toBase58());

  // ── 3. Create a token mint ─────────────────────────────────────────────────
  const mint = await createMint(
    connection, creator, creator.publicKey, null, 6
  );
  const creatorAta = await getOrCreateAssociatedTokenAccount(
    connection, creator, mint, creator.publicKey
  );
  await mintTo(
    connection, creator, mint, creatorAta.address, creator, 10_000_000
  );
  console.log("Mint funded:", mint.toBase58());

  // ── 4. Derive PDAs ─────────────────────────────────────────────────────────
  const seed = new BN(Date.now());
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
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection, creator, mint, recipient.publicKey
  );
  console.log("Stream PDA:", streamPda.toBase58());

  // ── 5. Create stream (1 hour linear vesting) ───────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const createTx = await program.methods
    .createStream(
      new BN(1_000_000),      // total_amount: 1 000 000 token units
      new BN(now),             // start_time: now
      new BN(now + 3_600),     // end_time: 1 hour from now
      new BN(0),               // cliff_time: none
      seed,
      false                    // milestone_enabled: false (pure linear)
    )
    .accounts({
      creator:             creator.publicKey,
      recipient:           recipient.publicKey,
      mint,
      creatorTokenAccount: creatorAta.address,
      escrowTokenAccount:  escrowPda,
      stream:              streamPda,
      tokenProgram:        TOKEN_PROGRAM_ID,
      systemProgram:       anchor.web3.SystemProgram.programId,
    })
    .rpc();
  console.log("✅ Stream created:", createTx);

  // ── 6. Wait 2 seconds, then withdraw as recipient ──────────────────────────
  await sleep(2000);

  const recipientProvider = new AnchorProvider(
    connection,
    new anchor.Wallet(recipient),
    { commitment: "confirmed" }
  );
  const recipientProgram = new Program(idl!, recipientProvider);

  const withdrawTx = await recipientProgram.methods
    .withdraw()
    .accounts({
      recipient:             recipient.publicKey,
      stream:                streamPda,
      mint,
      escrowTokenAccount:    escrowPda,
      recipientTokenAccount: recipientAta.address,
      tokenProgram:          TOKEN_PROGRAM_ID,
    })
    .signers([recipient])
    .rpc();
  console.log("✅ Withdrawal:", withdrawTx);

  // ── 7. Read on-chain state ─────────────────────────────────────────────────
  const state = await program.account.streamAccount.fetch(streamPda);
  console.log("\n─── Stream State ───────────────────────────────────────────");
  console.log("Creator:         ", state.creator.toBase58());
  console.log("Recipient:       ", state.recipient.toBase58());
  console.log("Total Amount:    ", state.totalAmount.toString(), "units");
  console.log("Withdrawn:       ", state.amountWithdrawn.toString(), "units");
  console.log("Start Time:      ", new Date(state.startTime.toNumber() * 1000).toISOString());
  console.log("End Time:        ", new Date(state.endTime.toNumber() * 1000).toISOString());
  console.log("Is Cancelled:    ", state.isCancelled);
  console.log("Milestone Enabled:", state.milestoneEnabled);
  console.log("────────────────────────────────────────────────────────────\n");

  console.log("Done! View your stream on Solana Explorer:");
  console.log(
    `https://explorer.solana.com/address/${streamPda.toBase58()}?cluster=devnet`
  );
})();
```

---

## What This Script Does

| Step | Action | Result |
|---|---|---|
| 1 | Airdrop SOL to creator + recipient | Both wallets funded on devnet |
| 2 | Fetch IDL from chain | `Program` object ready — no local file needed |
| 3 | Create SPL mint + fund creator | 10 tokens in creator's ATA |
| 4 | Derive stream + escrow PDAs | Deterministic addresses, computed locally |
| 5 | `create_stream` | 1M units locked in escrow for 1 hour |
| 6 | `withdraw` (2s later) | Small fraction transferred to recipient |
| 7 | Fetch `streamAccount` state | Full on-chain account logged |

---

## Expected Output

```
Connecting to devnet…
Program loaded: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
Mint funded: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
Stream PDA: 3JZPzx...
✅ Stream created: 5FfQWx...
✅ Withdrawal: 9dKmT3...

─── Stream State ───────────────────────────────────────────
Creator:          GjFvZ...
Recipient:        9kHQp...
Total Amount:     1000000 units
Withdrawn:        555 units
Start Time:       2026-06-14T10:00:00.000Z
End Time:         2026-06-14T11:00:00.000Z
Is Cancelled:     false
Milestone Enabled: false
────────────────────────────────────────────────────────────

Done! View your stream on Solana Explorer:
https://explorer.solana.com/address/3JZPzx...?cluster=devnet
```

---

## Next Steps

- [Full Integration Guide](/guide/integration) — covers every instruction including cancel, close, campaigns, and milestones
- [Instruction Reference](/reference/instructions) — parameter tables, error codes, TypeScript examples for all 9 instructions

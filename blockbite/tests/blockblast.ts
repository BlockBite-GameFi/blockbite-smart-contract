import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  SystemProgram,
  Transaction,
  Keypair,
  PublicKey,
} from "@solana/web3.js";

describe("blockblast", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey(
    "BHq8DC4EH5jzSs971YARefcAA5BF57oTQHRtqSX5pFRc"
  );

  const creator = Keypair.generate();
  const recipient = Keypair.generate();

  let mint: PublicKey;
  let creatorTokenAccount: PublicKey;
  let recipientTokenAccount: PublicKey;
  let streamPda: PublicKey;
  let escrowTokenAccount: PublicKey;

  const TOTAL_AMOUNT = 1_000_000;
  const SEED = 1;
  let startTime: number;
  let endTime: number;

  before(async () => {
    await provider.connection.requestAirdrop(
      creator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      recipient.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    mint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6
    );

    creatorTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        mint,
        creator.publicKey
      )
    ).address;

    recipientTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        recipient,
        mint,
        recipient.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      creator,
      mint,
      creatorTokenAccount,
      creator,
      10_000_000
    );

    startTime = Math.floor(Date.now() / 1000) - 2;
    endTime = startTime + 30;

    [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(SEED)]).buffer)),
      ],
      programId
    );

    [escrowTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), streamPda.toBuffer()],
      programId
    );

    await createStream(
      programId,
      creator,
      recipient.publicKey,
      mint,
      creatorTokenAccount,
      escrowTokenAccount,
      streamPda,
      startTime,
      endTime,
      TOTAL_AMOUNT,
      SEED,
      provider
    );
  });

  it("Creates a stream", async () => {
    const streamAccount = await provider.connection.getAccountInfo(streamPda);
    assert.ok(streamAccount !== null, "Stream account should exist");
    assert.ok(streamAccount.owner.equals(programId), "Stream account should be owned by program");
  });

  it("Withdraw at ~50 percent elapsed", async () => {
    const ix = createWithdrawIx(
      programId,
      recipient.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      recipientTokenAccount
    );
    const tx = new Transaction().add(ix);

    await provider.sendAndConfirm(tx, [recipient]);

    const recipientBal = await getAccount(provider.connection, recipientTokenAccount);
    const amount = Number(recipientBal.amount);
    assert.ok(amount > 0 && amount < TOTAL_AMOUNT, `Expected partial withdraw, got ${amount}`);
    console.log(`Partial withdraw amount: ${amount}`);
  });

  it("Withdraw at 100 percent (after end time)", async () => {
    const waitTime = (endTime - Math.floor(Date.now() / 1000) + 2) * 1000;
    if (waitTime > 0) {
      console.log(`Waiting ${waitTime}ms for stream to end...`);
      await new Promise((r) => setTimeout(r, waitTime));
    }

    const ix = createWithdrawIx(
      programId,
      recipient.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      recipientTokenAccount
    );
    const tx = new Transaction().add(ix);

    await provider.sendAndConfirm(tx, [recipient]);

    const recipientBal = await getAccount(provider.connection, recipientTokenAccount);
    const amount = Number(recipientBal.amount);
    assert.ok(amount >= 990_000, `Expected ~1000000, got ${amount}`);
  });

  it("Double withdraw fails", async () => {
    const ix = createWithdrawIx(
      programId,
      recipient.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      recipientTokenAccount
    );
    const tx = new Transaction().add(ix);

    try {
      await provider.sendAndConfirm(tx, [recipient]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "InsufficientUnlockedTokens");
    }
  });

  it("Withdraw by non-recipient fails", async () => {
    const nonRecipient = Keypair.generate();
    await provider.connection.requestAirdrop(
      nonRecipient.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    const ix = createWithdrawIx(
      programId,
      nonRecipient.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      recipientTokenAccount
    );
    const tx = new Transaction().add(ix);

    try {
      await provider.sendAndConfirm(tx, [nonRecipient]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "Unauthorized");
    }
  });

  it("Cancel mid-stream", async () => {
    const cancelCreator = Keypair.generate();
    const cancelRecipient = Keypair.generate();
    await provider.connection.requestAirdrop(
      cancelCreator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      cancelRecipient.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    const cancelMint = await createMint(
      provider.connection,
      cancelCreator,
      cancelCreator.publicKey,
      null,
      6
    );

    const cancelCreatorTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cancelCreator,
        cancelMint,
        cancelCreator.publicKey
      )
    ).address;

    const cancelRecipientTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cancelRecipient,
        cancelMint,
        cancelRecipient.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      cancelCreator,
      cancelMint,
      cancelCreatorTA,
      cancelCreator,
      10_000_000
    );

    const cancelStartTime = Math.floor(Date.now() / 1000);
    const cancelEndTime = cancelStartTime + 100;

    const [cancelStreamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        cancelCreator.publicKey.toBuffer(),
        cancelRecipient.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(2)]).buffer)),
      ],
      programId
    );

    const [cancelEscrowTA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cancelStreamPda.toBuffer()],
      programId
    );

    await createStream(
      programId,
      cancelCreator,
      cancelRecipient.publicKey,
      cancelMint,
      cancelCreatorTA,
      cancelEscrowTA,
      cancelStreamPda,
      cancelStartTime,
      cancelEndTime,
      TOTAL_AMOUNT,
      2,
      provider
    );

    const ix = createCancelIx(
      programId,
      cancelCreator.publicKey,
      cancelStreamPda,
      cancelMint,
      cancelEscrowTA,
      cancelCreatorTA,
      cancelRecipientTA
    );
    const tx = new Transaction().add(ix);

    await provider.sendAndConfirm(tx, [cancelCreator]);

    const creatorBal = await getAccount(provider.connection, cancelCreatorTA);
    const recipientBal = await getAccount(provider.connection, cancelRecipientTA);
    console.log(`Creator received: ${Number(creatorBal.amount)}`);
    console.log(`Recipient received: ${Number(recipientBal.amount)}`);

    assert.ok(Number(recipientBal.amount) === 0, "Recipient should get 0 before cliff");
    assert.ok(Number(creatorBal.amount) > 900_000, "Creator should get most tokens back");
  });

  it("Cancel by non-creator fails", async () => {
    const nonCreator = Keypair.generate();
    await provider.connection.requestAirdrop(
      nonCreator.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    const ix = createCancelIx(
      programId,
      nonCreator.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      creatorTokenAccount,
      recipientTokenAccount
    );
    const tx = new Transaction().add(ix);

    try {
      await provider.sendAndConfirm(tx, [nonCreator]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "Unauthorized");
    }
  });

  it("Withdraw from cancelled stream fails", async () => {
    const cancelCreator = Keypair.generate();
    const cancelRecipient = Keypair.generate();
    await provider.connection.requestAirdrop(
      cancelCreator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      cancelRecipient.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    const cancelMint = await createMint(
      provider.connection,
      cancelCreator,
      cancelCreator.publicKey,
      null,
      6
    );

    const cancelCreatorTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cancelCreator,
        cancelMint,
        cancelCreator.publicKey
      )
    ).address;

    const cancelRecipientTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cancelRecipient,
        cancelMint,
        cancelRecipient.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      cancelCreator,
      cancelMint,
      cancelCreatorTA,
      cancelCreator,
      10_000_000
    );

    const cancelStartTime = Math.floor(Date.now() / 1000) - 20;
    const cancelEndTime = cancelStartTime + 100;

    const [cancelStreamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        cancelCreator.publicKey.toBuffer(),
        cancelRecipient.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(3)]).buffer)),
      ],
      programId
    );

    const [cancelEscrowTA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cancelStreamPda.toBuffer()],
      programId
    );

    await createStream(
      programId,
      cancelCreator,
      cancelRecipient.publicKey,
      cancelMint,
      cancelCreatorTA,
      cancelEscrowTA,
      cancelStreamPda,
      cancelStartTime,
      cancelEndTime,
      TOTAL_AMOUNT,
      3,
      provider
    );

    const cancelIx = createCancelIx(
      programId,
      cancelCreator.publicKey,
      cancelStreamPda,
      cancelMint,
      cancelEscrowTA,
      cancelCreatorTA,
      cancelRecipientTA
    );
    await provider.sendAndConfirm(new Transaction().add(cancelIx), [cancelCreator]);

    const withdrawIx = createWithdrawIx(
      programId,
      cancelRecipient.publicKey,
      cancelStreamPda,
      cancelMint,
      cancelEscrowTA,
      cancelRecipientTA
    );
    const tx = new Transaction().add(withdrawIx);

    try {
      await provider.sendAndConfirm(tx, [cancelRecipient]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "StreamCancelled");
    }
  });

  it("Zero amount create fails", async () => {
    const zeroCreator = Keypair.generate();
    const zeroRecipient = Keypair.generate();
    await provider.connection.requestAirdrop(
      zeroCreator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );

    const zeroMint = await createMint(
      provider.connection,
      zeroCreator,
      zeroCreator.publicKey,
      null,
      6
    );

    const zeroCreatorTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        zeroCreator,
        zeroMint,
        zeroCreator.publicKey
      )
    ).address;

    const [zeroStreamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        zeroCreator.publicKey.toBuffer(),
        zeroRecipient.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(4)]).buffer)),
      ],
      programId
    );

    const [zeroEscrowTA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), zeroStreamPda.toBuffer()],
      programId
    );

    const ix = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: zeroCreator.publicKey, isSigner: true, isWritable: true },
        { pubkey: zeroRecipient.publicKey, isSigner: false, isWritable: false },
        { pubkey: zeroMint, isSigner: false, isWritable: false },
        { pubkey: zeroCreatorTA, isSigner: false, isWritable: true },
        { pubkey: zeroEscrowTA, isSigner: false, isWritable: true },
        { pubkey: zeroStreamPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(0, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 100, 0, 4),
    });

    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [zeroCreator]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "InvalidAmount");
    }
  });

  it("Same creator and recipient fails", async () => {
    const sameCreator = Keypair.generate();
    await provider.connection.requestAirdrop(
      sameCreator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );

    const sameMint = await createMint(
      provider.connection,
      sameCreator,
      sameCreator.publicKey,
      null,
      6
    );

    const sameCreatorTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        sameCreator,
        sameMint,
        sameCreator.publicKey
      )
    ).address;

    const [sameStreamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        sameCreator.publicKey.toBuffer(),
        sameCreator.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(5)]).buffer)),
      ],
      programId
    );

    const [sameEscrowTA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), sameStreamPda.toBuffer()],
      programId
    );

    const ix = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: sameCreator.publicKey, isSigner: true, isWritable: true },
        { pubkey: sameCreator.publicKey, isSigner: false, isWritable: false },
        { pubkey: sameMint, isSigner: false, isWritable: false },
        { pubkey: sameCreatorTA, isSigner: false, isWritable: true },
        { pubkey: sameEscrowTA, isSigner: false, isWritable: true },
        { pubkey: sameStreamPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(1_000_000, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 100, 0, 5),
    });

    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [sameCreator]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "InvalidRecipient");
    }
  });

  it("Cancel already cancelled fails", async () => {
    const cancelCreator = Keypair.generate();
    const cancelRecipient = Keypair.generate();
    await provider.connection.requestAirdrop(
      cancelCreator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      cancelRecipient.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    const cancelMint = await createMint(
      provider.connection,
      cancelCreator,
      cancelCreator.publicKey,
      null,
      6
    );

    const cancelCreatorTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cancelCreator,
        cancelMint,
        cancelCreator.publicKey
      )
    ).address;

    const cancelRecipientTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cancelRecipient,
        cancelMint,
        cancelRecipient.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      cancelCreator,
      cancelMint,
      cancelCreatorTA,
      cancelCreator,
      10_000_000
    );

    const cancelStartTime = Math.floor(Date.now() / 1000);
    const cancelEndTime = cancelStartTime + 100;

    const [cancelStreamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        cancelCreator.publicKey.toBuffer(),
        cancelRecipient.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(6)]).buffer)),
      ],
      programId
    );

    const [cancelEscrowTA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cancelStreamPda.toBuffer()],
      programId
    );

    await createStream(
      programId,
      cancelCreator,
      cancelRecipient.publicKey,
      cancelMint,
      cancelCreatorTA,
      cancelEscrowTA,
      cancelStreamPda,
      cancelStartTime,
      cancelEndTime,
      TOTAL_AMOUNT,
      6,
      provider
    );

    const cancelIx = createCancelIx(
      programId,
      cancelCreator.publicKey,
      cancelStreamPda,
      cancelMint,
      cancelEscrowTA,
      cancelCreatorTA,
      cancelRecipientTA
    );
    await provider.sendAndConfirm(new Transaction().add(cancelIx), [cancelCreator]);

    const cancelIx2 = createCancelIx(
      programId,
      cancelCreator.publicKey,
      cancelStreamPda,
      cancelMint,
      cancelEscrowTA,
      cancelCreatorTA,
      cancelRecipientTA
    );
    try {
      await provider.sendAndConfirm(new Transaction().add(cancelIx2), [cancelCreator]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "StreamAlreadyCancelled");
    }
  });

  it("Withdraw before cliff returns 0", async () => {
    const cliffCreator = Keypair.generate();
    const cliffRecipient = Keypair.generate();
    await provider.connection.requestAirdrop(
      cliffCreator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.requestAirdrop(
      cliffRecipient.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );

    const cliffMint = await createMint(
      provider.connection,
      cliffCreator,
      cliffCreator.publicKey,
      null,
      6
    );

    const cliffCreatorTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cliffCreator,
        cliffMint,
        cliffCreator.publicKey
      )
    ).address;

    const cliffRecipientTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        cliffRecipient,
        cliffMint,
        cliffRecipient.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      cliffCreator,
      cliffMint,
      cliffCreatorTA,
      cliffCreator,
      10_000_000
    );

    const cliffStartTime = Math.floor(Date.now() / 1000);
    const cliffEndTime = cliffStartTime + 100;
    const cliffTime = cliffStartTime + 50;

    const [cliffStreamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        cliffCreator.publicKey.toBuffer(),
        cliffRecipient.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(7)]).buffer)),
      ],
      programId
    );

    const [cliffEscrowTA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cliffStreamPda.toBuffer()],
      programId
    );

    await createStream(
      programId,
      cliffCreator,
      cliffRecipient.publicKey,
      cliffMint,
      cliffCreatorTA,
      cliffEscrowTA,
      cliffStreamPda,
      cliffStartTime,
      cliffEndTime,
      TOTAL_AMOUNT,
      7,
      provider
    );

    const withdrawIx = createWithdrawIx(
      programId,
      cliffRecipient.publicKey,
      cliffStreamPda,
      cliffMint,
      cliffEscrowTA,
      cliffRecipientTA
    );
    try {
      await provider.sendAndConfirm(new Transaction().add(withdrawIx), [cliffRecipient]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "InsufficientUnlockedTokens");
    }
  });
});

function createStreamData(
  totalAmount: number,
  startTime: number,
  endTime: number,
  cliffTime: number,
  seed: number
): Buffer {
  const discriminator = [71, 188, 111, 127, 108, 40, 229, 158];
  const data = Buffer.alloc(8 + 8 + 8 + 8 + 8 + 8);
  discriminator.forEach((b, i) => data[i] = b);
  data.writeBigUInt64LE(BigInt(totalAmount), 8);
  data.writeBigInt64LE(BigInt(startTime), 16);
  data.writeBigInt64LE(BigInt(endTime), 24);
  data.writeBigInt64LE(BigInt(cliffTime), 32);
  data.writeBigUInt64LE(BigInt(seed), 40);
  return data;
}

function createWithdrawIx(
  programId: PublicKey,
  recipient: PublicKey,
  streamPda: PublicKey,
  mint: PublicKey,
  escrowTokenAccount: PublicKey,
  recipientTokenAccount: PublicKey
): anchor.web3.TransactionInstruction {
  return new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: recipient, isSigner: true, isWritable: true },
      { pubkey: streamPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]),
  });
}

function createCancelIx(
  programId: PublicKey,
  creator: PublicKey,
  streamPda: PublicKey,
  mint: PublicKey,
  escrowTokenAccount: PublicKey,
  creatorTokenAccount: PublicKey,
  recipientTokenAccount: PublicKey
): anchor.web3.TransactionInstruction {
  return new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: streamPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: creatorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.from([232, 219, 223, 41, 219, 236, 220, 190]),
  });
}

async function createStream(
  programId: PublicKey,
  creator: Keypair,
  recipient: PublicKey,
  mint: PublicKey,
  creatorTokenAccount: PublicKey,
  escrowTokenAccount: PublicKey,
  streamPda: PublicKey,
  startTime: number,
  endTime: number,
  totalAmount: number,
  seed: number,
  provider: anchor.AnchorProvider
) {
  const cliffTime = 0;

  const ix = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: creator.publicKey, isSigner: true, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: creatorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
      { pubkey: streamPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: createStreamData(totalAmount, startTime, endTime, cliffTime, seed),
  });

  const tx = new Transaction().add(ix);
  await provider.sendAndConfirm(tx, [creator]);
}

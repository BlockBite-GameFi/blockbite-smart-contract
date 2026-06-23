import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Protocol treasury wallet. Module-level so the instruction builders below
// can derive the per-mint treasury ATA without it being passed through every
// function signature.
const treasury = Keypair.generate();

async function airdropAndConfirm(
  pubkey: PublicKey,
  amount: number,
  provider: anchor.AnchorProvider,
) {
  const sig = await provider.connection.requestAirdrop(pubkey, amount);
  await provider.connection.confirmTransaction(sig, "confirmed");
}

function encodeStreamName(name: string): Buffer {
  const buf = Buffer.alloc(32);
  Buffer.from(name.slice(0, 31), "utf8").copy(buf, 0);
  return buf;
}

function createStreamData(
  totalAmount: number,
  startTime: number,
  endTime: number,
  cliffTime: number,
  seed: number,
  milestoneEnabled: boolean = false,
  name: string = "",
): Buffer {
  const discriminator = [71, 188, 111, 127, 108, 40, 229, 158];
  const data = Buffer.alloc(8 + 8 + 8 + 8 + 8 + 8 + 1 + 32);
  discriminator.forEach((b, i) => (data[i] = b));
  data.writeBigUInt64LE(BigInt(totalAmount), 8);
  data.writeBigInt64LE(BigInt(startTime), 16);
  data.writeBigInt64LE(BigInt(endTime), 24);
  data.writeBigInt64LE(BigInt(cliffTime), 32);
  data.writeBigUInt64LE(BigInt(seed), 40);
  data[48] = milestoneEnabled ? 1 : 0;
  encodeStreamName(name).copy(data, 49);
  return data;
}

function mkInitProtocolConfigData(treasury: PublicKey): Buffer {
  // sha256("global:init_protocol_config")[0..8]
  const discriminator = [91, 97, 211, 137, 96, 222, 139, 40];
  const data = Buffer.alloc(8 + 32);
  discriminator.forEach((b, i) => (data[i] = b));
  treasury.toBuffer().copy(data, 8);
  return data;
}

function getProtocolConfigPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    programId,
  );
  return pda;
}

function getTreasuryAta(treasury: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      treasury.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

// Module-level on-chain treasury pubkey, set in before() to the value stored
// in ProtocolConfig.treasury (which may differ from the local `treasury`
// keypair if a previous test run already initialised the protocol config).
// Used by all ATA derivations so the on-chain constraint matches.
let ONCHAIN_TREASURY: PublicKey | null = null;

function createWithdrawIx(
  programId: PublicKey,
  recipient: PublicKey,
  streamPda: PublicKey,
  mint: PublicKey,
  escrowTokenAccount: PublicKey,
  recipientTokenAccount: PublicKey,
): anchor.web3.TransactionInstruction {
  return new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: recipient,            isSigner: true,  isWritable: true  },
      { pubkey: streamPda,            isSigner: false, isWritable: true  },
      { pubkey: mint,                 isSigner: false, isWritable: false },
      { pubkey: escrowTokenAccount,   isSigner: false, isWritable: true  },
      { pubkey: recipientTokenAccount,isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
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
  recipientTokenAccount: PublicKey,
): anchor.web3.TransactionInstruction {
  return new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: creator,              isSigner: true,  isWritable: true  },
      { pubkey: streamPda,            isSigner: false, isWritable: true  },
      { pubkey: mint,                 isSigner: false, isWritable: false },
      { pubkey: escrowTokenAccount,   isSigner: false, isWritable: true  },
      { pubkey: creatorTokenAccount,  isSigner: false, isWritable: true  },
      { pubkey: recipientTokenAccount,isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.from([232, 219, 223, 41, 219, 236, 220, 190]),
  });
}

function createCloseIx(
  programId: PublicKey,
  creator: PublicKey,
  streamPda: PublicKey,
  recipient: PublicKey,
  mint: PublicKey,
  escrowTokenAccount: PublicKey,
  creatorTokenAccount: PublicKey,
): anchor.web3.TransactionInstruction {
  // Account order matches CloseStream in _dispatch.rs:
  //   creator (signer, mut), stream (mut), recipient (CHECK),
  //   mint, escrow_token_account (mut), creator_token_account (mut), token_program
  return new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: creator,             isSigner: true,  isWritable: true  },
      { pubkey: streamPda,           isSigner: false, isWritable: true  },
      { pubkey: recipient,           isSigner: false, isWritable: false },
      { pubkey: mint,                isSigner: false, isWritable: false },
      { pubkey: escrowTokenAccount,  isSigner: false, isWritable: true  },
      { pubkey: creatorTokenAccount, isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false },
    ],
    programId,
    data: Buffer.from([255, 241, 196, 212, 95, 93, 160, 89]),
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
  provider: anchor.AnchorProvider,
  cliffTime = 0,
  milestoneEnabled = false,
  name: string = "",
): Promise<void> {
  const protocolConfig      = getProtocolConfigPda(programId);
  const treasuryTokenAccount = getTreasuryAta(ONCHAIN_TREASURY!, mint);
  // Debug: verify protocol_config exists and is owned by the program
  const pcInfo = await provider.connection.getAccountInfo(protocolConfig);
  if (!pcInfo) {
    throw new Error(`protocol_config PDA ${protocolConfig.toBase58()} does not exist; init_protocol_config was not run`);
  }
  if (!pcInfo.owner.equals(programId)) {
    throw new Error(
      `protocol_config PDA ${protocolConfig.toBase58()} is owned by ${pcInfo.owner.toBase58()}, ` +
      `not by the program ${programId.toBase58()} — surfpool ledger is stale, please reset.`,
    );
  }
  const ix = new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: creator.publicKey,       isSigner: true,  isWritable: true  },
      { pubkey: recipient,               isSigner: false, isWritable: false },
      { pubkey: mint,                    isSigner: false, isWritable: false },
      { pubkey: creatorTokenAccount,     isSigner: false, isWritable: true  },
      { pubkey: escrowTokenAccount,      isSigner: false, isWritable: true  },
      { pubkey: streamPda,               isSigner: false, isWritable: true  },
      { pubkey: protocolConfig,          isSigner: false, isWritable: false },
      { pubkey: treasuryTokenAccount,    isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: createStreamData(totalAmount, startTime, endTime, cliffTime, seed, milestoneEnabled, name),
  });
  await provider.sendAndConfirm(new Transaction().add(ix), [creator]);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Campaign & Milestone instruction-data builders
//  Discriminators verified against sha256("global:<name>")[0..8].
// ─────────────────────────────────────────────────────────────────────────────

function mkCreateCampaignData(titleHash: Buffer, totalBudget: bigint, seed: bigint): Buffer {
  const data = Buffer.alloc(56);
  Buffer.from([111, 131, 187, 98, 160, 193, 114, 244]).copy(data, 0); // DISC_CREATE_CAMPAIGN
  titleHash.copy(data, 8);
  data.writeBigUInt64LE(totalBudget, 40);
  data.writeBigUInt64LE(seed, 48);
  return data;
}

function mkCreateMilestoneData(
  descHash: Buffer, campaignSeed: bigint, milestoneSeed: bigint,
  tokenAmount: bigint, gameAuthority: PublicKey, recipient: PublicKey,
  targetLevel: number, difficulty: number,
): Buffer {
  const data = Buffer.alloc(130);
  Buffer.from([239, 58, 201, 28, 40, 186, 173, 48]).copy(data, 0); // DISC_CREATE_MILESTONE
  descHash.copy(data, 8);
  data.writeBigUInt64LE(campaignSeed, 40);
  data.writeBigUInt64LE(milestoneSeed, 48);
  data.writeBigUInt64LE(tokenAmount, 56);
  gameAuthority.toBuffer().copy(data, 64);
  recipient.toBuffer().copy(data, 96);
  data[128] = targetLevel;
  data[129] = difficulty;
  return data;
}

/**
 * Build a `create_milestone` instruction.
 *
 * Account order (matches CreateMilestone in _dispatch.rs):
 *   0  founder                – signer, payer
 *   1  campaign               – mut
 *   2  milestone              – mut, init
 *   3  mint                   – readable
 *   4  campaign_escrow        – mut, holds the campaign's full budget
 *   5  token_program
 *   6  system_program
 *
 * Note: no protocol fee is charged on `create_milestone` (game verification is
 * free). No `protocol_config` or `treasury_token_account` account is needed.
 */
function createMilestoneIx(
  programId: PublicKey,
  founder: PublicKey,
  campaignPda: PublicKey,
  milestonePda: PublicKey,
  mint: PublicKey,
  campaignEscrow: PublicKey,
  descHash: Buffer,
  campaignSeed: bigint,
  milestoneSeed: bigint,
  tokenAmount: bigint,
  gameAuthority: PublicKey,
  recipient: PublicKey,
  targetLevel: number,
  difficulty: number,
): anchor.web3.TransactionInstruction {
  return new anchor.web3.TransactionInstruction({
    keys: [
      { pubkey: founder,              isSigner: true,  isWritable: true  },
      { pubkey: campaignPda,          isSigner: false, isWritable: true  },
      { pubkey: milestonePda,         isSigner: false, isWritable: true  },
      { pubkey: mint,                 isSigner: false, isWritable: false },
      { pubkey: campaignEscrow,       isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data: mkCreateMilestoneData(
      descHash, campaignSeed, milestoneSeed, tokenAmount,
      gameAuthority, recipient, targetLevel, difficulty,
    ),
  });
}

function mkVerifyGameData(milestoneSeed: bigint, achievedLevel: number): Buffer {
  const data = Buffer.alloc(17);
  Buffer.from([81, 26, 37, 190, 207, 209, 205, 211]).copy(data, 0); // DISC_VERIFY_GAME
  data.writeBigUInt64LE(milestoneSeed, 8);
  data[16] = achievedLevel;
  return data;
}

function mkClaimMilestoneData(milestoneSeed: bigint, campaignSeed: bigint): Buffer {
  const data = Buffer.alloc(24);
  Buffer.from([211, 134, 152, 37, 3, 82, 214, 189]).copy(data, 0); // DISC_CLAIM_MILESTONE
  data.writeBigUInt64LE(milestoneSeed, 8);
  data.writeBigUInt64LE(campaignSeed, 16);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("blockbite", () => {
  async function getValidatorTime(): Promise<number> {
    const slot = await provider.connection.getSlot();
    return await provider.connection.getBlockTime(slot);
  }


  const provider  = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program   = anchor.workspace.blockbite;
  const programId = program.programId;

  // ── Shared keypairs ────────────────────────────────────────────────────────
  const creator   = Keypair.generate();
  const recipient = Keypair.generate();

  let mint: PublicKey;
  let creatorTokenAccount: PublicKey;
  let recipientTokenAccount: PublicKey;
  let streamPda: PublicKey;
  let escrowTokenAccount: PublicKey;

  const TOTAL_AMOUNT = 1_000_000;
  // 0.9% protocol fee on every create_stream. Creator must mint enough to
  // cover BOTH the escrow deposit AND the fee.
  const STREAM_FEE = Math.floor(TOTAL_AMOUNT * 90 / 10_000);
  const SEED         = 1;
  let startTime: number;
  let endTime: number;

  // ── Global setup ───────────────────────────────────────────────────────────
  before(async () => {
    for (const kp of [creator, recipient, treasury]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
    await sleep(10000);

    // Default to the local keypair. If the protocol config already exists
    // on-chain (from a previous test run), the on-chain treasury is the
    // source of truth and overrides this below.
    ONCHAIN_TREASURY = treasury.publicKey;

    // Initialise ProtocolConfig (admin = provider wallet, treasury = `treasury`).
    // Idempotent: skip the init if the PDA is already occupied (e.g. the
    // surfpool ledger has the account from a previous run). In that case,
    // the on-chain treasury is the source of truth — use it to derive the
    // per-mint treasury ATAs so they match the on-chain constraint.
    const protocolConfigPda = getProtocolConfigPda(programId);
    const protocolConfigInfo = await provider.connection.getAccountInfo(protocolConfigPda);
    let onchainTreasury: PublicKey = ONCHAIN_TREASURY!;
    if (protocolConfigInfo === null) {
      const ix = new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: provider.wallet.publicKey, isSigner: true,  isWritable: true  },
          { pubkey: protocolConfigPda,         isSigner: false, isWritable: true  },
          { pubkey: SystemProgram.programId,   isSigner: false, isWritable: false },
        ],
        programId,
        data: mkInitProtocolConfigData(ONCHAIN_TREASURY!),
      });
      await provider.sendAndConfirm(new Transaction().add(ix), []);
    } else {
      // Sanity check: the program must own the PDA, otherwise the on-chain
      // constraint `seeds = [b"protocol_config"], bump = protocol_config.bump`
      // in CreateStream / CreateMilestone will reject every stream/milestone.
      if (!protocolConfigInfo.owner.equals(programId)) {
        throw new Error(
          `ProtocolConfig PDA ${protocolConfigPda.toBase58()} is owned by ` +
          `${protocolConfigInfo.owner.toBase58()}, not by the program (${programId.toBase58()}). ` +
          `The ledger is stale; please reset the surfpool validator.`,
        );
      }
      // The ProtocolConfig account is `[disc][admin(32)][treasury(32)][bump(1)]`.
      // Skip the 8-byte Anchor discriminator to read the treasury pubkey at
      // offset 8+32 = 40. (We can't use Anchor's auto-deserialisation here
      // because we want this to work even on stale ledgers that predate the
      // current TypeScript IDL.)
      onchainTreasury = new PublicKey(protocolConfigInfo.data.subarray(40, 72));
    }
    ONCHAIN_TREASURY = onchainTreasury;

    mint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6,
    );

    creatorTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        mint,
        creator.publicKey,
      )
    ).address;

    recipientTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        recipient,
        mint,
        recipient.publicKey,
      )
    ).address;

    // Pre-create the protocol treasury's ATA so the create_stream CPI has
    // somewhere to land the 0.9% fee. getOrCreate pays for ATA rent from
    // the connected wallet.
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      ONCHAIN_TREASURY!,
    );

    // Mint enough to cover the stream amount PLUS the 0.9% fee.
    await mintTo(
      provider.connection,
      creator,
      mint,
      creatorTokenAccount,
      creator,
      TOTAL_AMOUNT + STREAM_FEE,
    );

    startTime = await getValidatorTime() - 60;
    endTime   = startTime + 300;

    [streamPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stream"),
        creator.publicKey.toBuffer(),
        recipient.publicKey.toBuffer(),
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(SEED)]).buffer)),
      ],
      programId,
    );

    [escrowTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), streamPda.toBuffer()],
      programId,
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
      provider,
    );
  });

  // ── Basic stream creation ──────────────────────────────────────────────────

  it("Creates a stream", async () => {
    const info = await provider.connection.getAccountInfo(streamPda);
    assert.ok(info !== null, "Stream account should exist");
    assert.ok(info!.owner.equals(programId), "Owned by program");
  });

  it("Tokens are locked in PDA — creator balance decreased by total_amount + stream fee", async () => {
    const creatorBal = await getAccount(provider.connection, creatorTokenAccount);
    // Creator minted (TOTAL_AMOUNT + STREAM_FEE) and paid it all: STREAM_FEE
    // to the protocol treasury, TOTAL_AMOUNT into the escrow. Remainder = 0.
    assert.strictEqual(
      Number(creatorBal.amount),
      0,
      `Creator should have 0 tokens left after paying fee + deposit`,
    );
  });

  it("Treasury received the 0.9% stream fee", async () => {
    const treasuryAta = getTreasuryAta(ONCHAIN_TREASURY!, mint);
    const treasuryBal = await getAccount(provider.connection, treasuryAta);
    assert.strictEqual(
      Number(treasuryBal.amount),
      STREAM_FEE,
      `Treasury should hold STREAM_FEE (${STREAM_FEE}) after create_stream`,
    );
  });

  // ── Withdraw flow ──────────────────────────────────────────────────────────

  it("Withdraw at ~50 percent elapsed (partial)", async () => {
    const ix = createWithdrawIx(
      programId,
      recipient.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      recipientTokenAccount,
    );
    await provider.sendAndConfirm(new Transaction().add(ix), [recipient]);

    const bal = await getAccount(provider.connection, recipientTokenAccount);
    const amount = Number(bal.amount);
    assert.ok(amount > 0 && amount < TOTAL_AMOUNT, `Expected partial, got ${amount}`);
    console.log(`Partial withdraw: ${amount}`);
  });

   it("Withdraw at 100 percent (fully vested stream)", async () => {
    // Use a fresh stream that is already fully vested — no timing-dependent waits
    const fwC = Keypair.generate();
    const fwR = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(fwC.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(fwR.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const fwMint = await createMint(provider.connection, fwC, fwC.publicKey, null, 6);
    const fwCTA = (await getOrCreateAssociatedTokenAccount(provider.connection, fwC, fwMint, fwC.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, fwMint, ONCHAIN_TREASURY!);
    const fwRTA = (await getOrCreateAssociatedTokenAccount(provider.connection, fwR, fwMint, fwR.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, fwMint, ONCHAIN_TREASURY!);
    await mintTo(provider.connection, fwC, fwMint, fwCTA, fwC, 1_010_000);

    const now     = await getValidatorTime();
    const fwStart = now - 200;
    const fwEnd   = now - 50;

    const [fwStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), fwC.publicKey.toBuffer(), fwR.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(21)]).buffer))],
      programId,
    );
    const [fwEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), fwStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, fwC, fwR.publicKey, fwMint, fwCTA, fwEscrow, fwStream,
      fwStart, fwEnd, TOTAL_AMOUNT, 21, provider,
    );

    const ix = createWithdrawIx(programId, fwR.publicKey, fwStream, fwMint, fwEscrow, fwRTA);
    await provider.sendAndConfirm(new Transaction().add(ix), [fwR]);

    const bal = await getAccount(provider.connection, fwRTA);
    assert.strictEqual(Number(bal.amount), TOTAL_AMOUNT, `Expected full amount, got ${bal.amount}`);
  });

  it("Double withdraw fails (NothingToWithdraw)", async () => {
    // Use a fresh stream so we control exactly how much is withdrawn first
    const dwC = Keypair.generate();
    const dwR = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(dwC.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(dwR.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const dwMint = await createMint(provider.connection, dwC, dwC.publicKey, null, 6);
    const dwCTA = (await getOrCreateAssociatedTokenAccount(provider.connection, dwC, dwMint, dwC.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, dwMint, ONCHAIN_TREASURY!);
    const dwRTA = (await getOrCreateAssociatedTokenAccount(provider.connection, dwR, dwMint, dwR.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, dwMint, ONCHAIN_TREASURY!);
    await mintTo(provider.connection, dwC, dwMint, dwCTA, dwC, 1_010_000);

    const dwStart = await getValidatorTime() - 200; // already fully vested
    const dwEnd   = await getValidatorTime() - 50;

    const [dwStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), dwC.publicKey.toBuffer(), dwR.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(20)]).buffer))],
      programId,
    );
    const [dwEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), dwStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, dwC, dwR.publicKey, dwMint, dwCTA, dwEscrow, dwStream,
      dwStart, dwEnd, TOTAL_AMOUNT, 20, provider,
    );

    // First withdraw — should succeed and claim everything (stream is fully vested)
    const wIx1 = createWithdrawIx(programId, dwR.publicKey, dwStream, dwMint, dwEscrow, dwRTA);
    await provider.sendAndConfirm(new Transaction().add(wIx1), [dwR]);

    // Second withdraw — nothing left
    const wIx2 = createWithdrawIx(programId, dwR.publicKey, dwStream, dwMint, dwEscrow, dwRTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(wIx2), [dwR]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("NothingToWithdraw") ||
        e.message.includes("0x"),
        `Expected withdraw-failure error, got: ${e.message}`,
      );
    }
  });

  it("Withdraw by non-recipient fails (Unauthorized)", async () => {
    const nonRecipient = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      nonRecipient.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const ix = createWithdrawIx(
      programId,
      nonRecipient.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      recipientTokenAccount,
    );
    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [nonRecipient]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("Unauthorized") || e.message.includes("0x"),
        `Expected Unauthorized, got: ${e.message}`,
      );
    }
  });

  // ── Cancel flow ────────────────────────────────────────────────────────────

  it("Cancel mid-stream (seed 2)", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    await mintTo(provider.connection, cc, cMint, ccTA, cc, 1_010_000);

    const cStart = await getValidatorTime() + 60; // future start — stream hasn't begun
    const cEnd   = cStart + 100;

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(2)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, TOTAL_AMOUNT, 2, provider,
    );

    const cancelIx = createCancelIx(programId, cc.publicKey, cStream, cMint, cEscrow, ccTA, crTA);
    await provider.sendAndConfirm(new Transaction().add(cancelIx), [cc]);

    const creatorBal    = await getAccount(provider.connection, ccTA);
    const recipientBal  = await getAccount(provider.connection, crTA);
    console.log(`Creator received: ${creatorBal.amount}  Recipient: ${recipientBal.amount}`);
    assert.ok(Number(recipientBal.amount) === 0, "Recipient should get 0 before stream starts");
    assert.ok(Number(creatorBal.amount) > 900_000, "Creator should get most tokens back");
  });

  it("Cancel by non-creator fails (Unauthorized)", async () => {
    const nonCreator = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      nonCreator.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const ix = createCancelIx(
      programId,
      nonCreator.publicKey,
      streamPda,
      mint,
      escrowTokenAccount,
      creatorTokenAccount,
      recipientTokenAccount,
    );
    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [nonCreator]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("Unauthorized") || e.message.includes("0x"),
        `Expected Unauthorized, got: ${e.message}`,
      );
    }
  });

  it("Withdraw from cancelled stream fails (StreamCancelled)", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    await mintTo(provider.connection, cc, cMint, ccTA, cc, 1_010_000);

    const cStart = await getValidatorTime() - 20;
    const cEnd   = cStart + 100;

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(3)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, TOTAL_AMOUNT, 3, provider,
    );

    await provider.sendAndConfirm(
      new Transaction().add(createCancelIx(programId, cc.publicKey, cStream, cMint, cEscrow, ccTA, crTA)),
      [cc],
    );

    const wIx = createWithdrawIx(programId, cr.publicKey, cStream, cMint, cEscrow, crTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(wIx), [cr]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("StreamCancelled") || e.message.includes("0x"),
        `Expected StreamCancelled, got: ${e.message}`,
      );
    }
  });

  it("Zero amount create fails (InvalidAmount)", async () => {
    const zc  = Keypair.generate();
    const zr  = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(zc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    await sleep(5000);
    const zMint = await createMint(provider.connection, zc, zc.publicKey, null, 6);
    const zcTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, zc, zMint, zc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, zMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, zMint, ONCHAIN_TREASURY!);

    const [zStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), zc.publicKey.toBuffer(), zr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(4)]).buffer))],
      programId,
    );
    const [zEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), zStream.toBuffer()],
      programId,
    );

    const ix = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: zc.publicKey,         isSigner: true,  isWritable: true  },
        { pubkey: zr.publicKey,         isSigner: false, isWritable: false },
        { pubkey: zMint,                isSigner: false, isWritable: false },
        { pubkey: zcTA,                 isSigner: false, isWritable: true  },
        { pubkey: zEscrow,              isSigner: false, isWritable: true  },
        { pubkey: zStream,              isSigner: false, isWritable: true  },
        { pubkey: getProtocolConfigPda(programId), isSigner: false, isWritable: false },
        { pubkey: getTreasuryAta(ONCHAIN_TREASURY!, zMint), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(0, await getValidatorTime(), await getValidatorTime() + 100, 0, 4, false),
    });
    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [zc]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("InvalidAmount") || e.message.includes("0x"),
        `Expected InvalidAmount, got: ${e.message}`,
      );
    }
  });

  it("Same creator and recipient fails (InvalidRecipient)", async () => {
    const sc  = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(sc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    await sleep(5000);
    const sMint = await createMint(provider.connection, sc, sc.publicKey, null, 6);
    const scTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, sc, sMint, sc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, sMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, sMint, ONCHAIN_TREASURY!);

    const [sStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), sc.publicKey.toBuffer(), sc.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(5)]).buffer))],
      programId,
    );
    const [sEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), sStream.toBuffer()],
      programId,
    );

    const ix = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: sc.publicKey,         isSigner: true,  isWritable: true  },
        { pubkey: sc.publicKey,         isSigner: false, isWritable: false },
        { pubkey: sMint,                isSigner: false, isWritable: false },
        { pubkey: scTA,                 isSigner: false, isWritable: true  },
        { pubkey: sEscrow,              isSigner: false, isWritable: true  },
        { pubkey: sStream,              isSigner: false, isWritable: true  },
        { pubkey: getProtocolConfigPda(programId), isSigner: false, isWritable: false },
        { pubkey: getTreasuryAta(ONCHAIN_TREASURY!, sMint), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(1_000_000, await getValidatorTime(), await getValidatorTime() + 100, 0, 5, false),
    });
    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [sc]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("InvalidRecipient") || e.message.includes("0x"),
        `Expected InvalidRecipient, got: ${e.message}`,
      );
    }
  });

  it("Cancel already cancelled fails (AlreadyCancelled)", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    await mintTo(provider.connection, cc, cMint, ccTA, cc, 1_010_000);

    const cStart = await getValidatorTime();
    const cEnd   = cStart + 100;

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(6)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, TOTAL_AMOUNT, 6, provider,
    );

    const ix = createCancelIx(programId, cc.publicKey, cStream, cMint, cEscrow, ccTA, crTA);
    await provider.sendAndConfirm(new Transaction().add(ix), [cc]);

    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [cc]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("AlreadyCancelled") || e.message.includes("0x"),
        `Expected AlreadyCancelled, got: ${e.message}`,
      );
    }
  });

  // ── Cliff vesting ──────────────────────────────────────────────────────────

  it("Cliff: withdraw before cliff_date is blocked (0% unlocked)", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    await mintTo(provider.connection, cc, cMint, ccTA, cc, 1_010_000);

    const cStart = await getValidatorTime();
    const cEnd   = cStart + 300;
    const cliff  = cStart + 120; // far future — validator clock won't reach it during this test

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(7)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, TOTAL_AMOUNT, 7, provider, cliff, false,
    );

    const wIx = createWithdrawIx(programId, cr.publicKey, cStream, cMint, cEscrow, crTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(wIx), [cr]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("NothingToWithdraw") || e.message.includes("0x"),
        `Expected 0-unlock error, got: ${e.message}`,
      );
    }
  });

  it("Cliff: withdraw succeeds after cliff_date (auto-unlock, no milestone needed)", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    await mintTo(provider.connection, cc, cMint, ccTA, cc, 1_010_000);

    const cStart = await getValidatorTime() - 120;
    const cEnd   = cStart + 300;
    const cliff  = cStart + 60; // well in the past — validator clock is definitely past it

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(8)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, TOTAL_AMOUNT, 8, provider, cliff, false,
    );

    const waitMs = (cliff - await getValidatorTime() + 2) * 1000;
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    const wIx = createWithdrawIx(programId, cr.publicKey, cStream, cMint, cEscrow, crTA);
    await provider.sendAndConfirm(new Transaction().add(wIx), [cr]);

    const bal = await getAccount(provider.connection, crTA);
    assert.ok(Number(bal.amount) > 0, `Expected tokens after cliff, got ${bal.amount}`);
    console.log(`Cliff-only withdraw: ${bal.amount}`);
  });

  // ── Milestone vesting ──────────────────────────────────────────────────────

  it("Milestone-only: tokens unlock only after set_milestone (no cliff)", async () => {
    const mc = Keypair.generate();
    const mr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(mc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(mr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const mMint = await createMint(provider.connection, mc, mc.publicKey, null, 6);
    const mcTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, mc, mMint, mc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    const mrTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, mr, mMint, mr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);

    await mintTo(provider.connection, mc, mMint, mcTA, mc, 1_010_000);

    const mStart = await getValidatorTime() - 10;
    const mEnd   = mStart + 100;
    const mCliff = mStart - 1;

    const [mStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), mc.publicKey.toBuffer(), mr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(9)]).buffer))],
      programId,
    );
    const [mEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), mStream.toBuffer()],
      programId,
    );

    const createIx = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: mc.publicKey,         isSigner: true,  isWritable: true  },
        { pubkey: mr.publicKey,         isSigner: false, isWritable: false },
        { pubkey: mMint,                isSigner: false, isWritable: false },
        { pubkey: mcTA,                 isSigner: false, isWritable: true  },
        { pubkey: mEscrow,              isSigner: false, isWritable: true  },
        { pubkey: mStream,              isSigner: false, isWritable: true  },
        { pubkey: getProtocolConfigPda(programId), isSigner: false, isWritable: false },
        { pubkey: getTreasuryAta(ONCHAIN_TREASURY!, mMint), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(TOTAL_AMOUNT, mStart, mEnd, mCliff, 9, true),
    });
    await provider.sendAndConfirm(new Transaction().add(createIx), [mc]);

    const wIx1 = createWithdrawIx(programId, mr.publicKey, mStream, mMint, mEscrow, mrTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(wIx1), [mr]);
      await new Promise((r) => setTimeout(r, 3_000));
      assert.fail("Should have failed — milestone not reached");
    } catch (e: any) {
      assert.ok(
        e.message.includes("NothingToWithdraw") || e.message.includes("0x"),
        `Expected NothingToWithdraw (milestone gate), got: ${e.message}`,
      );
    }

    const setMsIx = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: mc.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: mStream,      isSigner: false, isWritable: true  },
      ],
      programId,
      data: Buffer.from([174, 213, 91, 82, 156, 42, 105, 3]),
    });
    await provider.sendAndConfirm(new Transaction().add(setMsIx), [mc]);

    await new Promise((r) => setTimeout(r, 5_000));

    const wIx2 = createWithdrawIx(programId, mr.publicKey, mStream, mMint, mEscrow, mrTA);
    await provider.sendAndConfirm(new Transaction().add(wIx2), [mr]);

    const bal = await getAccount(provider.connection, mrTA);
    assert.ok(Number(bal.amount) > 0, `Expected tokens after milestone, got ${bal.amount}`);
    console.log(`Milestone-only withdraw: ${bal.amount}`);
  });

  it("Cancel after full vest fails (FullyVested)", async () => {
    const fc = Keypair.generate();
    const fr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(fc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(fr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const fMint = await createMint(provider.connection, fc, fc.publicKey, null, 6);
    const fcTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, fc, fMint, fc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, fMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, fMint, ONCHAIN_TREASURY!);
    const frTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, fr, fMint, fr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, fMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, fMint, ONCHAIN_TREASURY!);

    await mintTo(provider.connection, fc, fMint, fcTA, fc, 1_010_000);

    // Stream already fully vested at creation time — no waiting needed
    const now    = await getValidatorTime();
    const fStart = now - 200;
    const fEnd   = now - 50;

    const [fStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), fc.publicKey.toBuffer(), fr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(10)]).buffer))],
      programId,
    );
    const [fEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), fStream.toBuffer()],
      programId,
    );

    const fIx = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: fc.publicKey,         isSigner: true,  isWritable: true  },
        { pubkey: fr.publicKey,         isSigner: false, isWritable: false },
        { pubkey: fMint,                isSigner: false, isWritable: false },
        { pubkey: fcTA,                 isSigner: false, isWritable: true  },
        { pubkey: fEscrow,              isSigner: false, isWritable: true  },
        { pubkey: fStream,              isSigner: false, isWritable: true  },
        { pubkey: getProtocolConfigPda(programId), isSigner: false, isWritable: false },
        { pubkey: getTreasuryAta(ONCHAIN_TREASURY!, fMint), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(TOTAL_AMOUNT, fStart, fEnd, 0, 10, false),
    });
    await provider.sendAndConfirm(new Transaction().add(fIx), [fc]);

    const cIx = createCancelIx(programId, fc.publicKey, fStream, fMint, fEscrow, fcTA, frTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(cIx), [fc]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("FullyVested") || e.message.includes("0x"),
        `Expected FullyVested, got: ${e.message}`,
      );
    }
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("Invalid end time (end <= start) fails (InvalidTimestamp)", async () => {
    const ic = Keypair.generate();
    const ir = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(ic.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    await sleep(5000);
    const iMint = await createMint(provider.connection, ic, ic.publicKey, null, 6);
    const icTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, ic, iMint, ic.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, iMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, iMint, ONCHAIN_TREASURY!);
    await mintTo(provider.connection, ic, iMint, icTA, ic, 1_010_000);

    const now = await getValidatorTime();
    const [iStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), ic.publicKey.toBuffer(), ir.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(11)]).buffer))],
      programId,
    );
    const [iEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), iStream.toBuffer()],
      programId,
    );

    const ix = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: ic.publicKey,            isSigner: true,  isWritable: true  },
        { pubkey: ir.publicKey,            isSigner: false, isWritable: false },
        { pubkey: iMint,                   isSigner: false, isWritable: false },
        { pubkey: icTA,                    isSigner: false, isWritable: true  },
        { pubkey: iEscrow,                 isSigner: false, isWritable: true  },
        { pubkey: iStream,                 isSigner: false, isWritable: true  },
        { pubkey: getProtocolConfigPda(programId), isSigner: false, isWritable: false },
        { pubkey: getTreasuryAta(ONCHAIN_TREASURY!, iMint), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(1_000_000, now + 100, now, 0, 11, false),
    });
    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [ic]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("InvalidTimestamp") || e.message.includes("0x"),
        `Expected InvalidTimestamp, got: ${e.message}`,
      );
    }
  });

  it("Invalid cliff (cliff > end) fails (InvalidTimestamp)", async () => {
    const ic = Keypair.generate();
    const ir = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(ic.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    await sleep(5000);
    const iMint = await createMint(provider.connection, ic, ic.publicKey, null, 6);
    const icTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, ic, iMint, ic.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, iMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, iMint, ONCHAIN_TREASURY!);
    await mintTo(provider.connection, ic, iMint, icTA, ic, 1_010_000);

    const now = await getValidatorTime();
    const [iStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), ic.publicKey.toBuffer(), ir.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(12)]).buffer))],
      programId,
    );
    const [iEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), iStream.toBuffer()],
      programId,
    );

    const ix = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: ic.publicKey,            isSigner: true,  isWritable: true  },
        { pubkey: ir.publicKey,            isSigner: false, isWritable: false },
        { pubkey: iMint,                   isSigner: false, isWritable: false },
        { pubkey: icTA,                    isSigner: false, isWritable: true  },
        { pubkey: iEscrow,                 isSigner: false, isWritable: true  },
        { pubkey: iStream,                 isSigner: false, isWritable: true  },
        { pubkey: getProtocolConfigPda(programId), isSigner: false, isWritable: false },
        { pubkey: getTreasuryAta(ONCHAIN_TREASURY!, iMint), isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: createStreamData(1_000_000, now, now + 100, now + 200, 12, false),
    });
    try {
      await provider.sendAndConfirm(new Transaction().add(ix), [ic]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("InvalidTimestamp") || e.message.includes("0x"),
        `Expected InvalidTimestamp (cliff>end), got: ${e.message}`,
      );
    }
  });

  it("Withdraw before stream start fails (StreamNotStarted)", async () => {
    const nc = Keypair.generate();
    const nr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(nc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(nr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const nMint = await createMint(provider.connection, nc, nc.publicKey, null, 6);
    const ncTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, nc, nMint, nc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, nMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, nMint, ONCHAIN_TREASURY!);
    const nrTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, nr, nMint, nr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, nMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, nMint, ONCHAIN_TREASURY!);
    await mintTo(provider.connection, nc, nMint, ncTA, nc, 1_010_000);

    const now    = await getValidatorTime();
    const nStart = now + 10_000;
    const nEnd   = nStart + 100;

    const [nStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), nc.publicKey.toBuffer(), nr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(13)]).buffer))],
      programId,
    );
    const [nEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), nStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, nc, nr.publicKey, nMint, ncTA, nEscrow, nStream,
      nStart, nEnd, 1_000_000, 13, provider,
    );

    const wIx = createWithdrawIx(programId, nr.publicKey, nStream, nMint, nEscrow, nrTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(wIx), [nr]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("StreamNotStarted") || e.message.includes("0x"),
        `Expected StreamNotStarted, got: ${e.message}`,
      );
    }
  });

  it("set_milestone by non-creator fails (Unauthorized)", async () => {
    const mc      = Keypair.generate();
    const mr      = Keypair.generate();
    const attacker = Keypair.generate();
    const sigs = await Promise.all([
      provider.connection.requestAirdrop(mc.publicKey,      2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(mr.publicKey,      1 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(attacker.publicKey,1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all(sigs.map(s => provider.connection.confirmTransaction(s, "confirmed")));

    await sleep(5000);
    const mMint = await createMint(provider.connection, mc, mc.publicKey, null, 6);
    const mcTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, mc, mMint, mc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await mintTo(provider.connection, mc, mMint, mcTA, mc, 1_010_000);

    const now    = await getValidatorTime();
    const mCliff = now - 1;

    const [mStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), mc.publicKey.toBuffer(), mr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(14)]).buffer))],
      programId,
    );
    const [mEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), mStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, mc, mr.publicKey, mMint, mcTA, mEscrow, mStream,
      now, now + 100, 1_000_000, 14, provider, mCliff, true,
    );

    const attackIx = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: attacker.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: mStream,            isSigner: false, isWritable: true  },
      ],
      programId,
      data: Buffer.from([174, 213, 91, 82, 156, 42, 105, 3]),
    });
    try {
      await provider.sendAndConfirm(new Transaction().add(attackIx), [attacker]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("Unauthorized") ||
        e.message.includes("ConstraintSeeds") ||
        e.message.includes("0x"),
        `Expected Unauthorized/ConstraintSeeds, got: ${e.message}`,
      );
    }
  });

  it("set_milestone already reached fails (MilestoneAlreadyReached)", async () => {
    const mc = Keypair.generate();
    const mr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(mc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(mr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);
    await sleep(10000);

    const mMint = await createMint(provider.connection, mc, mc.publicKey, null, 6);
    const mcTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, mc, mMint, mc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await mintTo(provider.connection, mc, mMint, mcTA, mc, 1_010_000);

    const now    = await getValidatorTime();
    const mCliff = now - 1;

    const [mStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), mc.publicKey.toBuffer(), mr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(15)]).buffer))],
      programId,
    );
    const [mEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), mStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, mc, mr.publicKey, mMint, mcTA, mEscrow, mStream,
      now, now + 100, 1_000_000, 15, provider, mCliff, true,
    );

    const msIx = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: mc.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: mStream,      isSigner: false, isWritable: true  },
      ],
      programId,
      data: Buffer.from([174, 213, 91, 82, 156, 42, 105, 3]),
    });

    await provider.sendAndConfirm(new Transaction().add(msIx), [mc]);

    try {
      await provider.sendAndConfirm(new Transaction().add(msIx), [mc]);
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("MilestoneAlreadyReached") || e.message.includes("0x"),
        `Expected MilestoneAlreadyReached, got: ${e.message}`,
      );
    }
  });

  it("set_milestone before cliff succeeds (cliff gate still blocks until cliff_time)", async () => {
    const mc = Keypair.generate();
    const mr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(mc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(mr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);
    await sleep(10000);

    const mMint = await createMint(provider.connection, mc, mc.publicKey, null, 6);
    const mcTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, mc, mMint, mc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    const mrTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, mr, mMint, mr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mMint, ONCHAIN_TREASURY!);
    const MM_TOTAL = 1_000_000;
    const MM_FEE   = Math.floor(MM_TOTAL * 90 / 10_000);
    await mintTo(provider.connection, mc, mMint, mcTA, mc, MM_TOTAL + MM_FEE);

    const now    = await getValidatorTime();
    const mCliff = now + 100;

    const [mStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), mc.publicKey.toBuffer(), mr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(16)]).buffer))],
      programId,
    );
    const [mEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), mStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, mc, mr.publicKey, mMint, mcTA, mEscrow, mStream,
      now, now + 200, MM_TOTAL, 16, provider, mCliff, true,
    );

    const msIx = new anchor.web3.TransactionInstruction({
      keys: [
        { pubkey: mc.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: mStream,      isSigner: false, isWritable: true  },
      ],
      programId,
      data: Buffer.from([174, 213, 91, 82, 156, 42, 105, 3]),
    });
    await provider.sendAndConfirm(new Transaction().add(msIx), [mc]);
    console.log(`✅ set_milestone before cliff succeeded`);

    const wIx = createWithdrawIx(programId, mr.publicKey, mStream, mMint, mEscrow, mrTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(wIx), [mr]);
      assert.fail("Should have failed — cliff not yet reached");
    } catch (e: any) {
      assert.ok(
        e.message.includes("NothingToWithdraw") || e.message.includes("0x"),
        `Expected NothingToWithdraw (cliff gate), got: ${e.message}`,
      );
    }
  });

  // ── Campaign & Milestone Flow ─────────────────────────────────────────────
  // Full e2e on the SBF validator — exercises real discriminators, account order,
  // PDA seeds, CEI ordering, and the is_claimed guard.

  it("Full milestone flow: create_campaign → create_milestone → verify_game → claim_milestone", async () => {
    // 1. Setup
    const founder   = Keypair.generate();
    const recipient = Keypair.generate();
    const gameAuthority = Keypair.generate(); // game server's signing keypair
    await airdropAndConfirm(founder.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await airdropAndConfirm(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await sleep(5000);

    const mint = await createMint(provider.connection, founder, founder.publicKey, null, 6);
    const founderTA   = (await getOrCreateAssociatedTokenAccount(provider.connection, founder,   mint, founder.publicKey)).address;
    const recipientTA = (await getOrCreateAssociatedTokenAccount(provider.connection, recipient, mint, recipient.publicKey)).address;
    const BUDGET = BigInt(500_000);
    const AMOUNT = BigInt(100_000);
    await mintTo(provider.connection, founder, mint, founderTA, founder, Number(BUDGET));
    await sleep(5000);

    const campaignSeed  = BigInt(100);
    const milestoneSeed = BigInt(200);
    const [campaignPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), founder.publicKey.toBuffer(), Buffer.from(new BigUint64Array([campaignSeed]).buffer)],
      programId,
    );
    const [campaignEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPDA.toBuffer()], programId,
    );
    const [milestonePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), campaignPDA.toBuffer(), Buffer.from(new BigUint64Array([milestoneSeed]).buffer)],
      programId,
    );

    // 2. create_campaign
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: founder.publicKey, isSigner: true,  isWritable: true  },
          { pubkey: mint,              isSigner: false, isWritable: false },
          { pubkey: founderTA,         isSigner: false, isWritable: true  },
          { pubkey: campaignEscrow,    isSigner: false, isWritable: true  },
          { pubkey: campaignPDA,       isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: mkCreateCampaignData(Buffer.alloc(32, 1), BUDGET, campaignSeed),
      })),
      [founder],
    );
    const campaignInfo = await provider.connection.getAccountInfo(campaignPDA);
    assert.ok(campaignInfo !== null, "Campaign account should exist");

    // 3. create_milestone — game verification is free, no protocol fee charged.
    //    The full BUDGET stays in the campaign_escrow PDA and is paid out per milestone.
    const msIx = createMilestoneIx(
      programId,
      founder.publicKey,
      campaignPDA,
      milestonePDA,
      mint,
      campaignEscrow,
      Buffer.alloc(32, 2), campaignSeed, milestoneSeed, AMOUNT,
      gameAuthority.publicKey, recipient.publicKey, 10, 1,
    );
    await provider.sendAndConfirm(new Transaction().add(msIx), [founder]);

    // Escrow should still hold the full BUDGET (no fee deducted on create_milestone).
    const escrowBal = await getAccount(provider.connection, campaignEscrow);
    assert.strictEqual(
      Number(escrowBal.amount),
      Number(BUDGET),
      `Escrow should hold full BUDGET (${BUDGET}) after create_milestone — no fee`,
    );

    // 4. verify_game — game authority signs (simulates game server callback after level completion)
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: campaignPDA,        isSigner: false, isWritable: false },
          { pubkey: milestonePDA,       isSigner: false, isWritable: true  },
          { pubkey: gameAuthority.publicKey, isSigner: true,  isWritable: false },
        ],
        programId,
        data: mkVerifyGameData(milestoneSeed, 10),
      })),
      [gameAuthority],
    );

    // 5. claim_milestone
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: recipient.publicKey, isSigner: true,  isWritable: true  },
          { pubkey: milestonePDA,        isSigner: false, isWritable: true  },
          { pubkey: campaignPDA,         isSigner: false, isWritable: false },
          { pubkey: mint,                isSigner: false, isWritable: false },
          { pubkey: campaignEscrow,      isSigner: false, isWritable: true  },
          { pubkey: recipientTA,         isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false },
        ],
        programId,
        data: mkClaimMilestoneData(milestoneSeed, campaignSeed),
      })),
      [recipient],
    );

    // 6. Verify balance
    const bal = await getAccount(provider.connection, recipientTA);
    assert.strictEqual(Number(bal.amount), Number(AMOUNT), `Expected ${AMOUNT}, got ${bal.amount}`);

    // 7. Double-claim must fail (security fix #9: is_claimed guard)
    try {
      await provider.sendAndConfirm(
        new Transaction().add(new anchor.web3.TransactionInstruction({
          keys: [
            { pubkey: recipient.publicKey, isSigner: true,  isWritable: true  },
            { pubkey: milestonePDA,        isSigner: false, isWritable: true  },
            { pubkey: campaignPDA,         isSigner: false, isWritable: false },
            { pubkey: mint,                isSigner: false, isWritable: false },
            { pubkey: campaignEscrow,      isSigner: false, isWritable: true  },
            { pubkey: recipientTA,         isSigner: false, isWritable: true  },
            { pubkey: TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false },
          ],
          programId,
          data: mkClaimMilestoneData(milestoneSeed, campaignSeed),
        })),
        [recipient],
      );
      assert.fail("Double-claim should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("AlreadyClaimed") || e.message.includes("0x"),
        `Expected AlreadyClaimed, got: ${e.message}`,
      );
    }
  });

  // ── Game Verification Layer Security Tests ─────────────────────────────────

  it("verify_game: wrong game authority signer fails (InvalidGameAuthority)", async () => {
    const founder = Keypair.generate();
    const recipient = Keypair.generate();
    const gameAuthority = Keypair.generate();
    const fakeGameAuthority = Keypair.generate();
    await airdropAndConfirm(founder.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await airdropAndConfirm(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await sleep(5000);

    const mint = await createMint(provider.connection, founder, founder.publicKey, null, 6);
    const founderTA = (await getOrCreateAssociatedTokenAccount(provider.connection, founder, mint, founder.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const BUDGET = BigInt(500_000);
    const AMOUNT = BigInt(100_000);
    await mintTo(provider.connection, founder, mint, founderTA, founder, Number(BUDGET));
    await sleep(5000);

    const campaignSeed = BigInt(300);
    const milestoneSeed = BigInt(400);
    const [campaignPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), founder.publicKey.toBuffer(), Buffer.from(new BigUint64Array([campaignSeed]).buffer)],
      programId,
    );
    const [campaignEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPDA.toBuffer()], programId,
    );
    const [milestonePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), campaignPDA.toBuffer(), Buffer.from(new BigUint64Array([milestoneSeed]).buffer)],
      programId,
    );

    // create_campaign
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: founder.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: founderTA, isSigner: false, isWritable: true },
          { pubkey: campaignEscrow, isSigner: false, isWritable: true },
          { pubkey: campaignPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: mkCreateCampaignData(Buffer.alloc(32, 3), BUDGET, campaignSeed),
      })),
      [founder],
    );

    // create_milestone with real gameAuthority
    await provider.sendAndConfirm(
      new Transaction().add(createMilestoneIx(
        programId,
        founder.publicKey,
        campaignPDA,
        milestonePDA,
        mint,
        campaignEscrow,
        Buffer.alloc(32, 4), campaignSeed, milestoneSeed, AMOUNT,
        gameAuthority.publicKey, recipient.publicKey, 10, 1,
      )),
      [founder],
    );

    // Attacker tries to verify with wrong keypair
    try {
      await provider.sendAndConfirm(
        new Transaction().add(new anchor.web3.TransactionInstruction({
          keys: [
            { pubkey: campaignPDA, isSigner: false, isWritable: false },
            { pubkey: milestonePDA, isSigner: false, isWritable: true },
            { pubkey: fakeGameAuthority.publicKey, isSigner: true, isWritable: false },
          ],
          programId,
          data: mkVerifyGameData(milestoneSeed, 10),
        })),
        [fakeGameAuthority],
      );
      assert.fail("Should have failed — wrong game authority");
    } catch (e: any) {
      assert.ok(
        e.message.includes("InvalidGameAuthority") || e.message.includes("0x"),
        `Expected InvalidGameAuthority, got: ${e.message}`,
      );
    }
  });

  it("verify_game: double verification fails (MilestoneAlreadyVerified)", async () => {
    const founder = Keypair.generate();
    const recipient = Keypair.generate();
    const gameAuthority = Keypair.generate();
    await airdropAndConfirm(founder.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await airdropAndConfirm(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await sleep(5000);

    const mint = await createMint(provider.connection, founder, founder.publicKey, null, 6);
    const founderTA = (await getOrCreateAssociatedTokenAccount(provider.connection, founder, mint, founder.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const BUDGET = BigInt(500_000);
    const AMOUNT = BigInt(100_000);
    await mintTo(provider.connection, founder, mint, founderTA, founder, Number(BUDGET));
    await sleep(5000);

    const campaignSeed = BigInt(500);
    const milestoneSeed = BigInt(600);
    const [campaignPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), founder.publicKey.toBuffer(), Buffer.from(new BigUint64Array([campaignSeed]).buffer)],
      programId,
    );
    const [campaignEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPDA.toBuffer()], programId,
    );
    const [milestonePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), campaignPDA.toBuffer(), Buffer.from(new BigUint64Array([milestoneSeed]).buffer)],
      programId,
    );

    // create_campaign + create_milestone
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: founder.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: founderTA, isSigner: false, isWritable: true },
          { pubkey: campaignEscrow, isSigner: false, isWritable: true },
          { pubkey: campaignPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: mkCreateCampaignData(Buffer.alloc(32, 5), BUDGET, campaignSeed),
      })),
      [founder],
    );
    await provider.sendAndConfirm(
      new Transaction().add(createMilestoneIx(
        programId,
        founder.publicKey,
        campaignPDA,
        milestonePDA,
        mint,
        campaignEscrow,
        Buffer.alloc(32, 6), campaignSeed, milestoneSeed, AMOUNT,
        gameAuthority.publicKey, recipient.publicKey, 10, 1,
      )),
      [founder],
    );

    // First verify — succeeds
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: campaignPDA, isSigner: false, isWritable: false },
          { pubkey: milestonePDA, isSigner: false, isWritable: true },
          { pubkey: gameAuthority.publicKey, isSigner: true, isWritable: false },
        ],
        programId,
        data: mkVerifyGameData(milestoneSeed, 10),
      })),
      [gameAuthority],
    );

    // Second verify — must fail
    try {
      await provider.sendAndConfirm(
        new Transaction().add(new anchor.web3.TransactionInstruction({
          keys: [
            { pubkey: campaignPDA, isSigner: false, isWritable: false },
            { pubkey: milestonePDA, isSigner: false, isWritable: true },
            { pubkey: gameAuthority.publicKey, isSigner: true, isWritable: false },
          ],
          programId,
          data: mkVerifyGameData(milestoneSeed, 10),
        })),
        [gameAuthority],
      );
      assert.fail("Should have failed — already verified");
    } catch (e: any) {
      assert.ok(
        e.message.includes("MilestoneAlreadyVerified") || e.message.includes("0x"),
        `Expected MilestoneAlreadyVerified, got: ${e.message}`,
      );
    }
  });

  it("claim_milestone: claim before verification fails (MilestoneNotVerified)", async () => {
    const founder = Keypair.generate();
    const recipient = Keypair.generate();
    const gameAuthority = Keypair.generate();
    await airdropAndConfirm(founder.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await airdropAndConfirm(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await sleep(5000);

    const mint = await createMint(provider.connection, founder, founder.publicKey, null, 6);
    const founderTA = (await getOrCreateAssociatedTokenAccount(provider.connection, founder, mint, founder.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const recipientTA = (await getOrCreateAssociatedTokenAccount(provider.connection, recipient, mint, recipient.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const BUDGET = BigInt(500_000);
    const AMOUNT = BigInt(100_000);
    await mintTo(provider.connection, founder, mint, founderTA, founder, Number(BUDGET));
    await sleep(5000);

    const campaignSeed = BigInt(700);
    const milestoneSeed = BigInt(800);
    const [campaignPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), founder.publicKey.toBuffer(), Buffer.from(new BigUint64Array([campaignSeed]).buffer)],
      programId,
    );
    const [campaignEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPDA.toBuffer()], programId,
    );
    const [milestonePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), campaignPDA.toBuffer(), Buffer.from(new BigUint64Array([milestoneSeed]).buffer)],
      programId,
    );

    // create_campaign + create_milestone (no verify_game)
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: founder.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: founderTA, isSigner: false, isWritable: true },
          { pubkey: campaignEscrow, isSigner: false, isWritable: true },
          { pubkey: campaignPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: mkCreateCampaignData(Buffer.alloc(32, 7), BUDGET, campaignSeed),
      })),
      [founder],
    );
    await provider.sendAndConfirm(
      new Transaction().add(createMilestoneIx(
        programId,
        founder.publicKey,
        campaignPDA,
        milestonePDA,
        mint,
        campaignEscrow,
        Buffer.alloc(32, 8), campaignSeed, milestoneSeed, AMOUNT,
        gameAuthority.publicKey, recipient.publicKey, 10, 1,
      )),
      [founder],
    );

    // Try to claim without verification
    try {
      await provider.sendAndConfirm(
        new Transaction().add(new anchor.web3.TransactionInstruction({
          keys: [
            { pubkey: recipient.publicKey, isSigner: true, isWritable: true },
            { pubkey: milestonePDA, isSigner: false, isWritable: true },
            { pubkey: campaignPDA, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: campaignEscrow, isSigner: false, isWritable: true },
            { pubkey: recipientTA, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          programId,
          data: mkClaimMilestoneData(milestoneSeed, campaignSeed),
        })),
        [recipient],
      );
      assert.fail("Should have failed — not verified");
    } catch (e: any) {
      assert.ok(
        e.message.includes("MilestoneNotVerified") || e.message.includes("0x"),
        `Expected MilestoneNotVerified, got: ${e.message}`,
      );
    }
  });

  it("claim_milestone: wrong recipient fails (Unauthorized)", async () => {
    const founder = Keypair.generate();
    const recipient = Keypair.generate();
    const wrongRecipient = Keypair.generate();
    const gameAuthority = Keypair.generate();
    await airdropAndConfirm(founder.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await airdropAndConfirm(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await airdropAndConfirm(wrongRecipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await sleep(5000);

    const mint = await createMint(provider.connection, founder, founder.publicKey, null, 6);
    const founderTA = (await getOrCreateAssociatedTokenAccount(provider.connection, founder, mint, founder.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const wrongRecipientTA = (await getOrCreateAssociatedTokenAccount(provider.connection, wrongRecipient, mint, wrongRecipient.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const BUDGET = BigInt(500_000);
    const AMOUNT = BigInt(100_000);
    await mintTo(provider.connection, founder, mint, founderTA, founder, Number(BUDGET));
    await sleep(5000);

    const campaignSeed = BigInt(900);
    const milestoneSeed = BigInt(1000);
    const [campaignPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), founder.publicKey.toBuffer(), Buffer.from(new BigUint64Array([campaignSeed]).buffer)],
      programId,
    );
    const [campaignEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPDA.toBuffer()], programId,
    );
    const [milestonePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), campaignPDA.toBuffer(), Buffer.from(new BigUint64Array([milestoneSeed]).buffer)],
      programId,
    );

    // create_campaign + create_milestone
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: founder.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: founderTA, isSigner: false, isWritable: true },
          { pubkey: campaignEscrow, isSigner: false, isWritable: true },
          { pubkey: campaignPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: mkCreateCampaignData(Buffer.alloc(32, 9), BUDGET, campaignSeed),
      })),
      [founder],
    );
    await provider.sendAndConfirm(
      new Transaction().add(createMilestoneIx(
        programId,
        founder.publicKey,
        campaignPDA,
        milestonePDA,
        mint,
        campaignEscrow,
        Buffer.alloc(32, 10), campaignSeed, milestoneSeed, AMOUNT,
        gameAuthority.publicKey, recipient.publicKey, 10, 1,
      )),
      [founder],
    );

    // verify_game
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: campaignPDA, isSigner: false, isWritable: false },
          { pubkey: milestonePDA, isSigner: false, isWritable: true },
          { pubkey: gameAuthority.publicKey, isSigner: true, isWritable: false },
        ],
        programId,
        data: mkVerifyGameData(milestoneSeed, 10),
      })),
      [gameAuthority],
    );

    // Wrong recipient tries to claim
    try {
      await provider.sendAndConfirm(
        new Transaction().add(new anchor.web3.TransactionInstruction({
          keys: [
            { pubkey: wrongRecipient.publicKey, isSigner: true, isWritable: true },
            { pubkey: milestonePDA, isSigner: false, isWritable: true },
            { pubkey: campaignPDA, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: campaignEscrow, isSigner: false, isWritable: true },
            { pubkey: wrongRecipientTA, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          programId,
          data: mkClaimMilestoneData(milestoneSeed, campaignSeed),
        })),
        [wrongRecipient],
      );
      assert.fail("Should have failed — wrong recipient");
    } catch (e: any) {
      assert.ok(
        e.message.includes("Unauthorized") || e.message.includes("0x"),
        `Expected Unauthorized, got: ${e.message}`,
      );
    }
  });

  it("campaign_escrow: balance decreases after successful claim", async () => {
    const founder = Keypair.generate();
    const recipient = Keypair.generate();
    const gameAuthority = Keypair.generate();
    await airdropAndConfirm(founder.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await airdropAndConfirm(recipient.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL, provider);
    await sleep(5000);

    const mint = await createMint(provider.connection, founder, founder.publicKey, null, 6);
    const founderTA = (await getOrCreateAssociatedTokenAccount(provider.connection, founder, mint, founder.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const recipientTA = (await getOrCreateAssociatedTokenAccount(provider.connection, recipient, mint, recipient.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, ONCHAIN_TREASURY!);
    const BUDGET = BigInt(500_000);
    const AMOUNT = BigInt(100_000);
    await mintTo(provider.connection, founder, mint, founderTA, founder, Number(BUDGET));
    await sleep(5000);

    const campaignSeed = BigInt(1100);
    const milestoneSeed = BigInt(1200);
    const [campaignPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), founder.publicKey.toBuffer(), Buffer.from(new BigUint64Array([campaignSeed]).buffer)],
      programId,
    );
    const [campaignEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_escrow"), campaignPDA.toBuffer()], programId,
    );
    const [milestonePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("milestone"), campaignPDA.toBuffer(), Buffer.from(new BigUint64Array([milestoneSeed]).buffer)],
      programId,
    );

    // create_campaign + create_milestone
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: founder.publicKey, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: founderTA, isSigner: false, isWritable: true },
          { pubkey: campaignEscrow, isSigner: false, isWritable: true },
          { pubkey: campaignPDA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: mkCreateCampaignData(Buffer.alloc(32, 11), BUDGET, campaignSeed),
      })),
      [founder],
    );
    await provider.sendAndConfirm(
      new Transaction().add(createMilestoneIx(
        programId,
        founder.publicKey,
        campaignPDA,
        milestonePDA,
        mint,
        campaignEscrow,
        Buffer.alloc(32, 12), campaignSeed, milestoneSeed, AMOUNT,
        gameAuthority.publicKey, recipient.publicKey, 10, 1,
      )),
      [founder],
    );

    // Check escrow balance before claim. No fee was deducted at create_milestone
    // time — the full BUDGET is still held in the campaign_escrow PDA.
    const escrowBefore = await getAccount(provider.connection, campaignEscrow);
    assert.strictEqual(
      Number(escrowBefore.amount),
      Number(BUDGET),
      `Escrow should still hold the full BUDGET (${BUDGET}) — no fee on create_milestone`,
    );

    // verify_game + claim
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: campaignPDA, isSigner: false, isWritable: false },
          { pubkey: milestonePDA, isSigner: false, isWritable: true },
          { pubkey: gameAuthority.publicKey, isSigner: true, isWritable: false },
        ],
        programId,
        data: mkVerifyGameData(milestoneSeed, 10),
      })),
      [gameAuthority],
    );
    await provider.sendAndConfirm(
      new Transaction().add(new anchor.web3.TransactionInstruction({
        keys: [
          { pubkey: recipient.publicKey, isSigner: true, isWritable: true },
          { pubkey: milestonePDA, isSigner: false, isWritable: true },
          { pubkey: campaignPDA, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: campaignEscrow, isSigner: false, isWritable: true },
          { pubkey: recipientTA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId,
        data: mkClaimMilestoneData(milestoneSeed, campaignSeed),
      })),
      [recipient],
    );

    // Check escrow balance after claim. Escrow held BUDGET; the claim drains
    // AMOUNT, leaving BUDGET - AMOUNT.
    const escrowAfter = await getAccount(provider.connection, campaignEscrow);
    assert.strictEqual(
      Number(escrowAfter.amount),
      Number(BUDGET) - Number(AMOUNT),
      "Escrow should decrease by AMOUNT (no fee on create_milestone)",
    );
  });

  // ===========================================================================
  // close_stream: end-to-end tests
  // Validates the rent-recovery + account-closure path. 4 scenarios:
  //   1. cancel + close → accounts gone, SOL rent back to creator
  //   2. fully withdraw + close → dust tokens returned to creator
  //   3. close an unsettled stream → StreamNotSettled
  //   4. close with a non-creator signer → Unauthorized
  // ===========================================================================

  it("close_stream (1/4): cancel then close — accounts deleted, rent recovered", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    // Pre-create treasury ATA for the 0.9% stream fee.
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    // Mint enough to cover the stream amount PLUS the 0.9% fee.
    const CLOSE_TOTAL = 1_000_000;
    const CLOSE_FEE   = Math.floor(CLOSE_TOTAL * 90 / 10_000);
    await mintTo(provider.connection, cc, cMint, ccTA, cc, CLOSE_TOTAL + CLOSE_FEE);

    // Use a future start so no tokens vest before cancel
    const cStart = await getValidatorTime() + 60;
    const cEnd   = cStart + 100;
    const SEED   = 100;

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(SEED)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, CLOSE_TOTAL, SEED, provider,
    );

    // Confirm the stream account exists with rent before closing
    const streamBefore  = await provider.connection.getAccountInfo(cStream);
    const escrowBefore  = await provider.connection.getAccountInfo(cEscrow);
    assert.ok(streamBefore !== null, "Stream account should exist before close");
    assert.ok(escrowBefore !== null, "Escrow account should exist before close");
    const solBefore     = await provider.connection.getBalance(cc.publicKey);

    // Cancel — returns all unvested tokens to creator, sets is_cancelled=true
    const cancelIx = createCancelIx(programId, cc.publicKey, cStream, cMint, cEscrow, ccTA, crTA);
    await provider.sendAndConfirm(new Transaction().add(cancelIx), [cc]);

    // Close — escrow should be empty (cancel drained it), so no dust return
    const closeIx = createCloseIx(programId, cc.publicKey, cStream, cr.publicKey, cMint, cEscrow, ccTA);
    const closeSig = await provider.sendAndConfirm(new Transaction().add(closeIx), [cc]);
    assert.ok(closeSig.length > 0, "close_stream should return a tx signature");

    // Both accounts should be deleted
    const streamAfter = await provider.connection.getAccountInfo(cStream);
    const escrowAfter = await provider.connection.getAccountInfo(cEscrow);
    assert.strictEqual(streamAfter, null, "Stream account should be deleted after close");
    assert.strictEqual(escrowAfter, null, "Escrow account should be deleted after close");

    // SOL rent should have been returned to the creator (minus tx fee)
    const solAfter = await provider.connection.getBalance(cc.publicKey);
    assert.ok(
      solAfter > solBefore - 50_000, // fee is ~5_000 lamports × 2 txs
      `Creator should recover rent; solBefore=${solBefore}, solAfter=${solAfter}`,
    );
  });

  it("close_stream (2/4): fully withdraw then close — dust tokens returned to creator", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    const TOTAL = 1_000_000;
    const FEE   = Math.floor(TOTAL * 90 / 10_000);
    await mintTo(provider.connection, cc, cMint, ccTA, cc, TOTAL + FEE);

    // Deterministic: set BOTH start and end in the past so the stream is
    // already fully vested at createStream time. No timing race conditions
    // with the validator's integer-second clock.
    const now     = await getValidatorTime();
    const cStart  = now - 200;
    const cEnd    = now - 50;
    const SEED    = 101;

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(SEED)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, TOTAL, SEED, provider,
    );

    // Recipient fully withdraws — guaranteed 100% because end < now
    const withdrawIx = createWithdrawIx(programId, cr.publicKey, cStream, cMint, cEscrow, crTA);
    await provider.sendAndConfirm(new Transaction().add(withdrawIx), [cr]);

    const recipientBal = await getAccount(provider.connection, crTA);
    assert.strictEqual(
      Number(recipientBal.amount), TOTAL,
      `Recipient should have withdrawn all ${TOTAL} tokens, got ${recipientBal.amount}`,
    );

    // Inspect escrow dust before close (typically 0 or 1 due to u64 division)
    const escrowBeforeClose = await getAccount(provider.connection, cEscrow);
    const creatorBalBefore = await getAccount(provider.connection, ccTA);
    console.log(
      `close_stream dust test: escrow=${escrowBeforeClose.amount}, ` +
      `creatorBefore=${creatorBalBefore.amount}, recipient=${Number(recipientBal.amount)}`,
    );

    // Close the fully-withdrawn stream
    const closeIx = createCloseIx(programId, cc.publicKey, cStream, cr.publicKey, cMint, cEscrow, ccTA);
    await provider.sendAndConfirm(new Transaction().add(closeIx), [cc]);

    // Both accounts deleted
    const streamAfter = await provider.connection.getAccountInfo(cStream);
    const escrowAfter = await provider.connection.getAccountInfo(cEscrow);
    assert.strictEqual(streamAfter, null, "Stream account should be deleted");
    assert.strictEqual(escrowAfter, null, "Escrow account should be deleted");

    // If there was dust, the creator's token balance increased by exactly that amount
    const dust = Number(escrowBeforeClose.amount);
    if (dust > 0) {
      const creatorBalAfter = await getAccount(provider.connection, ccTA);
      assert.strictEqual(
        Number(creatorBalAfter.amount),
        Number(creatorBalBefore.amount) + dust,
        `Creator should receive ${dust} dust tokens on close`,
      );
    }
  });

  it("close_stream (3/4): close an unsettled stream fails (StreamNotSettled)", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const [s1, s2] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    const CLOSE3_TOTAL = 1_000_000;
    const CLOSE3_FEE   = Math.floor(CLOSE3_TOTAL * 90 / 10_000);
    await mintTo(provider.connection, cc, cMint, ccTA, cc, CLOSE3_TOTAL + CLOSE3_FEE);

    // Stream mid-flight: not cancelled, not fully withdrawn
    const cStart = await getValidatorTime() - 30;
    const cEnd   = await getValidatorTime() + 600;
    const SEED   = 102;

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(SEED)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, CLOSE3_TOTAL, SEED, provider,
    );

    // Try to close — should fail with StreamNotSettled (error 6015 per errors.rs)
    const closeIx = createCloseIx(programId, cc.publicKey, cStream, cr.publicKey, cMint, cEscrow, ccTA);
    try {
      await provider.sendAndConfirm(new Transaction().add(closeIx), [cc]);
      assert.fail("close_stream on an unsettled stream should have failed");
    } catch (e: any) {
      assert.ok(
        e.message.includes("StreamNotSettled") || e.message.includes("6015") || e.message.includes("0x1797"),
        `Expected StreamNotSettled, got: ${e.message}`,
      );
    }

    // Stream account should still exist (close was rejected)
    const streamStillThere = await provider.connection.getAccountInfo(cStream);
    assert.ok(streamStillThere !== null, "Stream account should still exist after rejected close");
  });

  it("close_stream (4/4): close with a non-creator signer fails (Unauthorized)", async () => {
    const cc = Keypair.generate();
    const cr = Keypair.generate();
    const nonCreator = Keypair.generate();
    const [s1, s2, s3] = await Promise.all([
      provider.connection.requestAirdrop(cc.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(cr.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(nonCreator.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL),
    ]);
    await Promise.all([
      provider.connection.confirmTransaction(s1, "confirmed"),
      provider.connection.confirmTransaction(s2, "confirmed"),
      provider.connection.confirmTransaction(s3, "confirmed"),
    ]);

    await sleep(5000);
    const cMint = await createMint(provider.connection, cc, cc.publicKey, null, 6);
    const ccTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cc, cMint, cc.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    const crTA  = (await getOrCreateAssociatedTokenAccount(provider.connection, cr, cMint, cr.publicKey)).address;
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);
    await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, cMint, ONCHAIN_TREASURY!);

    const CLOSE4_TOTAL = 1_000_000;
    const CLOSE4_FEE   = Math.floor(CLOSE4_TOTAL * 90 / 10_000);
    await mintTo(provider.connection, cc, cMint, ccTA, cc, CLOSE4_TOTAL + CLOSE4_FEE);

    const cStart = await getValidatorTime() + 60;
    const cEnd   = cStart + 100;
    const SEED   = 103;

    const [cStream] = PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), cc.publicKey.toBuffer(), cr.publicKey.toBuffer(),
       Buffer.from(new Uint8Array(new BigUint64Array([BigInt(SEED)]).buffer))],
      programId,
    );
    const [cEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), cStream.toBuffer()],
      programId,
    );

    await createStream(
      programId, cc, cr.publicKey, cMint, ccTA, cEscrow, cStream,
      cStart, cEnd, CLOSE4_TOTAL, SEED, provider,
    );

    // Cancel first so the stream is in a settleable state
    const cancelIx = createCancelIx(programId, cc.publicKey, cStream, cMint, cEscrow, ccTA, crTA);
    await provider.sendAndConfirm(new Transaction().add(cancelIx), [cc]);

    // nonCreator tries to close — must fail.
    // The on-chain CloseStream has two checks that can fire in this scenario:
    //   1. seeds constraint (Anchor error 2006, 0x7d6) — fires first because the
    //      PDA was derived from (cc.publicKey, cr.publicKey, seed), not nonCreator
    //   2. explicit `stream.creator == creator.key()` check (error 6008, 0x1778)
    // Either is a valid rejection of a non-creator signer. We accept both.
    const closeIx = createCloseIx(
      programId, nonCreator.publicKey, cStream, cr.publicKey, cMint, cEscrow, ccTA,
    );
    try {
      await provider.sendAndConfirm(new Transaction().add(closeIx), [nonCreator]);
      assert.fail("close_stream with a non-creator signer should have failed");
    } catch (e: any) {
      const msg = e.message;
      const ok =
        msg.includes("Unauthorized")  || msg.includes("6008") || msg.includes("0x1778") ||
        msg.includes("ConstraintSeeds") || msg.includes("2006") || msg.includes("0x7d6");
      assert.ok(ok, `Expected Unauthorized or ConstraintSeeds, got: ${msg}`);
    }

    // Stream account should still exist (close was rejected)
    const streamStillThere = await provider.connection.getAccountInfo(cStream);
    assert.ok(streamStillThere !== null, "Stream account should still exist after rejected close");
  });
});

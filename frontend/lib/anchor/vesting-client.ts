/**
 * vesting-client.ts — Exact adapter for the BlockBite program deployed on devnet.
 *
 * Target: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq  (deployed 2026-05-20, slot 463647969)
 *
 * StreamAccount layout — 196 bytes total (after 8-byte discriminator):
 *   [8..40]   creator              Pubkey
 *   [40..72]  recipient            Pubkey
 *   [72..104] mint                 Pubkey
 *   [104..136]escrow_token_account Pubkey
 *   [136..144]total_amount         u64
 *   [144..152]amount_withdrawn     u64
 *   [152..160]start_time           i64
 *   [160..168]end_time             i64
 *   [168..176]cliff_time           i64
 *   [176]     is_cancelled         bool
 *   [177]     bump                 u8
 *   [178..186]seed                 u64
 *   [186]     milestone_reached    bool
 *   [187]     velocity_strikes     u8
 *   [188..196]last_action_ts       i64
 *
 * create_stream instruction — 48 bytes data, 9 accounts:
 *   data: [disc(8)] [total_amount u64 LE(8)] [start_time i64 LE(8)]
 *         [end_time i64 LE(8)] [cliff_time i64 LE(8)] [seed u64 LE(8)]
 *   accounts: creator, recipient, mint, creator_ta, escrow_ta,
 *             stream, developer_ta, token_program, system_program
 *
 * unlock logic (mirrors Rust calculate_unlocked):
 *   cliff_time == 0: pure linear start→end
 *   cliff_time >  0 && !milestone_reached: 0
 *   cliff_time >  0 && milestone_reached:  linear cliff→end
 */

import { BN } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { TEAM_WALLET } from '@/lib/solana/config';

// ─── Program constants ────────────────────────────────────────────────────────
export const VESTING_PROGRAM_ID = new PublicKey(
  'Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq',
);

// Instruction discriminators: sha256("global:<name>")[0..8]
const DISC_CREATE   = Buffer.from([71,  188, 111, 127, 108, 40,  229, 158]);
const DISC_WITHDRAW = Buffer.from([183, 18,  70,  156, 148, 109, 161, 34 ]);
const DISC_CANCEL   = Buffer.from([232, 219, 223, 41,  219, 236, 220, 190]);
const DISC_MILESTONE= Buffer.from([174, 213, 91,  82,  156, 42,  105, 3  ]);

// StreamAccount constants
export const STREAM_ACCOUNT_SIZE = 196;
const OFFSET_CREATOR   = 8;
const OFFSET_RECIPIENT = 40;

// ─── PDA derivation ───────────────────────────────────────────────────────────

export function deriveStreamPDA(
  creator: PublicKey,
  recipient: PublicKey,
  seed: BN,
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(seed.toString()));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stream'), creator.toBuffer(), recipient.toBuffer(), buf],
    VESTING_PROGRAM_ID,
  );
}

export function deriveEscrowPDA(streamPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), streamPDA.toBuffer()],
    VESTING_PROGRAM_ID,
  );
}

/** Alias used by pages */
export function deriveVaultPDA(
  creator: PublicKey,
  recipient: PublicKey,
  seed: BN,
): [PublicKey, number] {
  const [streamPDA] = deriveStreamPDA(creator, recipient, seed);
  return deriveEscrowPDA(streamPDA);
}

export function deriveProofCachePDA(stream: PublicKey, player: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('proof_cache'), stream.toBuffer(), player.toBuffer()],
    VESTING_PROGRAM_ID,
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type SendTx = (
  tx: Transaction,
  connection: Connection,
  opts?: { signers?: never[] },
) => Promise<string>;

export interface StreamInfo {
  pubkey:             PublicKey;
  authority:          PublicKey;   // = creator
  beneficiary:        PublicKey;   // = recipient
  mint:               PublicKey;
  escrowTokenAccount: PublicKey;
  streamId:           BN;          // = seed
  amountTotal:        BN;
  amountWithdrawn:    BN;
  startTs:            BN;
  cliffTs:            BN;
  endTs:              BN;
  cancelled:          boolean;
  bump:               number;
  milestoneReached:   boolean;
  velocityStrikes:    number;
  lastActionTs:       BN;
  // Compatibility fields for blockblast page components
  requiredTier:       number;
  milestoneCount:     number;
  milestonesVerified: boolean[];
  milestonePct:       number[];
}

// ─── Decode raw 196-byte StreamAccount ───────────────────────────────────────
function decodeStream(pubkey: PublicKey, rawData: Uint8Array): StreamInfo | null {
  const data = Buffer.from(rawData);
  if (data.length < STREAM_ACCOUNT_SIZE) return null;
  try {
    let off = 8;
    const rd32 = (): PublicKey => {
      const pk = new PublicKey(data.slice(off, off + 32));
      off += 32;
      return pk;
    };
    const creator            = rd32();
    const recipient          = rd32();
    const mint               = rd32();
    const escrowTokenAccount = rd32();
    const totalAmount        = data.readBigUInt64LE(off); off += 8;
    const amountWithdrawn    = data.readBigUInt64LE(off); off += 8;
    const startTime          = data.readBigInt64LE(off);  off += 8;
    const endTime            = data.readBigInt64LE(off);  off += 8;
    const cliffTime          = data.readBigInt64LE(off);  off += 8;
    const isCancelled        = data[off] !== 0;           off++;
    const bump               = data[off];                 off++;
    const seed               = data.readBigUInt64LE(off); off += 8;
    const milestoneReached   = data[off] !== 0;           off++;
    const velocityStrikes    = data[off];                 off++;
    const lastActionTs       = data.readBigInt64LE(off);

    return {
      pubkey,
      authority:          creator,
      beneficiary:        recipient,
      mint,
      escrowTokenAccount,
      streamId:           new BN(seed.toString()),
      amountTotal:        new BN(totalAmount.toString()),
      amountWithdrawn:    new BN(amountWithdrawn.toString()),
      startTs:            new BN(startTime.toString()),
      cliffTs:            new BN(cliffTime.toString()),
      endTs:              new BN(endTime.toString()),
      cancelled:          isCancelled,
      bump,
      milestoneReached,
      velocityStrikes,
      lastActionTs:       new BN(lastActionTs.toString()),
      requiredTier:       cliffTime > 0n ? 1 : 0,
      milestoneCount:     cliffTime > 0n ? 1 : 0,
      milestonesVerified: [milestoneReached],
      milestonePct:       [100],
    };
  } catch {
    return null;
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
export async function getAllStreams(connection: Connection): Promise<StreamInfo[]> {
  const accs = await connection.getProgramAccounts(VESTING_PROGRAM_ID, {
    filters: [{ dataSize: STREAM_ACCOUNT_SIZE }],
  });
  return accs.flatMap(({ pubkey, account }) => {
    const d = decodeStream(pubkey, account.data);
    return d ? [d] : [];
  });
}

export async function getStreamsByAuthority(
  connection: Connection,
  authority: PublicKey,
): Promise<StreamInfo[]> {
  const accs = await connection.getProgramAccounts(VESTING_PROGRAM_ID, {
    filters: [
      { dataSize: STREAM_ACCOUNT_SIZE },
      { memcmp: { offset: OFFSET_CREATOR, bytes: authority.toBase58() } },
    ],
  });
  return accs.flatMap(({ pubkey, account }) => {
    const d = decodeStream(pubkey, account.data);
    return d ? [d] : [];
  });
}

export async function getStreamsByBeneficiary(
  connection: Connection,
  beneficiary: PublicKey,
): Promise<StreamInfo[]> {
  const accs = await connection.getProgramAccounts(VESTING_PROGRAM_ID, {
    filters: [
      { dataSize: STREAM_ACCOUNT_SIZE },
      { memcmp: { offset: OFFSET_RECIPIENT, bytes: beneficiary.toBase58() } },
    ],
  });
  return accs.flatMap(({ pubkey, account }) => {
    const d = decodeStream(pubkey, account.data);
    return d ? [d] : [];
  });
}

export async function fetchStream(
  connection: Connection,
  streamPda: PublicKey,
): Promise<StreamInfo | null> {
  try {
    const acc = await connection.getAccountInfo(streamPda);
    if (!acc) return null;
    return decodeStream(streamPda, acc.data);
  } catch { return null; }
}

export async function fetchVaultBalance(
  connection: Connection,
  vault: PublicKey,
): Promise<bigint> {
  try {
    const info = await getAccount(connection, vault);
    return info.amount;
  } catch { return 0n; }
}

export async function fetchProofCache(
  _c: Connection, _s: PublicKey, _p: PublicKey,
) { return null; }

// ─── Unlocked computation (mirrors Rust calculate_unlocked exactly) ───────────
export function computeUnlocked(stream: StreamInfo, nowSec: number): bigint {
  const now   = BigInt(nowSec);
  const cliff = BigInt(stream.cliffTs.toString());
  const start = BigInt(stream.startTs.toString());
  const end   = BigInt(stream.endTs.toString());
  const total = BigInt(stream.amountTotal.toString());
  const drawn = BigInt(stream.amountWithdrawn.toString());

  if (stream.cancelled) return 0n;

  // Case 1: No cliff → pure linear
  if (cliff === 0n) {
    if (now < start) return 0n;
    if (now >= end) return total > drawn ? total - drawn : 0n;
    const dur = end > start ? end - start : 1n;
    const el  = now - start;
    const ul  = total * el / dur;
    return ul > drawn ? ul - drawn : 0n;
  }

  // Case 2: Cliff set but milestone NOT reached → 0
  if (!stream.milestoneReached) return 0n;

  // Case 3: Cliff + milestone reached → linear from cliff to end
  if (now < cliff) return 0n;
  if (now >= end)  return total > drawn ? total - drawn : 0n;
  const dur = end > cliff ? end - cliff : 1n;
  const el  = now - cliff;
  const ul  = total * el / dur;
  return ul > drawn ? ul - drawn : 0n;
}

// ─── ATA helper ──────────────────────────────────────────────────────────────
export async function ensureAtaIx(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
) {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try { await getAccount(connection, ata); return null; }
  catch { return createAssociatedTokenAccountInstruction(payer, ata, owner, mint); }
}

// ─── Raw instruction builders ─────────────────────────────────────────────────

/**
 * build create_stream: 48 bytes, 9 accounts.
 * Args: total_amount(u64) start_time(i64) end_time(i64) cliff_time(i64) seed(u64)
 * Account 6: developer_token_account — receives DEV_FEE_BPS (1%) of total_amount
 */
function mkCreateIx(
  creator:     PublicKey,
  recipient:   PublicKey,
  mint:        PublicKey,
  creatorTA:   PublicKey,
  escrowTA:    PublicKey,
  streamPDA:   PublicKey,
  developerTA: PublicKey,
  totalAmount: bigint,
  startTime:   bigint,
  endTime:     bigint,
  cliffTime:   bigint,
  seed:        bigint,
): TransactionInstruction {
  const data = Buffer.alloc(48); // 8 disc + 5×8 args
  DISC_CREATE.copy(data, 0);
  data.writeBigUInt64LE(totalAmount, 8);
  data.writeBigInt64LE(startTime,   16);
  data.writeBigInt64LE(endTime,     24);
  data.writeBigInt64LE(cliffTime,   32);
  data.writeBigUInt64LE(seed,       40);
  return new TransactionInstruction({
    programId: VESTING_PROGRAM_ID,
    keys: [
      { pubkey: creator,                 isSigner: true,  isWritable: true  }, // 0
      { pubkey: recipient,               isSigner: false, isWritable: false }, // 1
      { pubkey: mint,                    isSigner: false, isWritable: false }, // 2
      { pubkey: creatorTA,               isSigner: false, isWritable: true  }, // 3
      { pubkey: escrowTA,                isSigner: false, isWritable: true  }, // 4
      { pubkey: streamPDA,               isSigner: false, isWritable: true  }, // 5
      { pubkey: developerTA,             isSigner: false, isWritable: true  }, // 6 DEV FEE
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false }, // 7
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 8
    ],
    data,
  });
}

function mkWithdrawIx(
  recipient: PublicKey, streamPDA: PublicKey, mint: PublicKey,
  escrowTA: PublicKey,  recipientTA: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: VESTING_PROGRAM_ID,
    keys: [
      { pubkey: recipient,        isSigner: true,  isWritable: true  },
      { pubkey: streamPDA,        isSigner: false, isWritable: true  },
      { pubkey: mint,             isSigner: false, isWritable: false },
      { pubkey: escrowTA,         isSigner: false, isWritable: true  },
      { pubkey: recipientTA,      isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DISC_WITHDRAW),
  });
}

function mkCancelIx(
  creator: PublicKey, streamPDA: PublicKey, mint: PublicKey,
  escrowTA: PublicKey, creatorTA: PublicKey, recipientTA: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: VESTING_PROGRAM_ID,
    keys: [
      { pubkey: creator,          isSigner: true,  isWritable: true  },
      { pubkey: streamPDA,        isSigner: false, isWritable: true  },
      { pubkey: mint,             isSigner: false, isWritable: false },
      { pubkey: escrowTA,         isSigner: false, isWritable: true  },
      { pubkey: creatorTA,        isSigner: false, isWritable: true  },
      { pubkey: recipientTA,      isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DISC_CANCEL),
  });
}

function mkSetMilestoneIx(
  creator: PublicKey, streamPDA: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: VESTING_PROGRAM_ID,
    keys: [
      { pubkey: creator,   isSigner: true,  isWritable: false },
      { pubkey: streamPDA, isSigner: false, isWritable: true  },
    ],
    data: Buffer.from(DISC_MILESTONE),
  });
}

// ─── High-level tx functions ──────────────────────────────────────────────────

export interface CreateStreamParams {
  connection:      Connection;
  authority:       PublicKey;     // creator (signer)
  beneficiary:     PublicKey;
  mint:            PublicKey;
  streamId:        bigint;        // used as seed
  amount:          bigint;        // raw token units (already × 10^decimals)
  startTs:         number;
  cliffTs:         number;        // 0 = no cliff (pure linear)
  endTs:           number;
  requiredTier?:   0 | 1 | 2;    // ignored — cliff presence is the gate
  sendTransaction: SendTx;
}

export async function createStream(p: CreateStreamParams): Promise<string> {
  const seed = new BN(p.streamId.toString());
  const [streamPDA] = deriveStreamPDA(p.authority, p.beneficiary, seed);
  const [escrowTA]  = deriveEscrowPDA(streamPDA);
  const creatorTA   = await getAssociatedTokenAddress(p.mint, p.authority);

  // Developer fee account — TEAM_WALLET's ATA for this mint
  const devTA = await getAssociatedTokenAddress(p.mint, TEAM_WALLET);

  const tx = new Transaction();

  // Ensure developer ATA exists (create if missing — payer = creator)
  const devAtaIx = await ensureAtaIx(p.connection, p.authority, TEAM_WALLET, p.mint);
  if (devAtaIx) tx.add(devAtaIx);

  tx.add(mkCreateIx(
    p.authority, p.beneficiary, p.mint, creatorTA, escrowTA, streamPDA, devTA,
    p.amount,
    BigInt(p.startTs), BigInt(p.endTs), BigInt(p.cliffTs),
    p.streamId,
  ));

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.authority;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

export interface WithdrawParams {
  connection:      Connection;
  beneficiary:     PublicKey;
  stream:          PublicKey;
  vault:           PublicKey;
  beneficiaryAta:  PublicKey;
  mint:            PublicKey;
  proofCache?:     PublicKey;     // not used in deployed program
  sendTransaction: SendTx;
}

export async function withdraw(p: WithdrawParams): Promise<string> {
  const tx = new Transaction();

  // Auto-create recipient ATA if needed
  const ataCrIx = await ensureAtaIx(p.connection, p.beneficiary, p.beneficiary, p.mint);
  if (ataCrIx) tx.add(ataCrIx);

  tx.add(mkWithdrawIx(p.beneficiary, p.stream, p.mint, p.vault, p.beneficiaryAta));
  tx.feePayer = p.beneficiary;

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

export interface CancelParams {
  connection:      Connection;
  authority:       PublicKey;
  beneficiary:     PublicKey;
  stream:          PublicKey;
  vault:           PublicKey;
  authorityAta:    PublicKey;
  beneficiaryAta:  PublicKey;
  sendTransaction: SendTx;
}

export async function cancelStream(p: CancelParams): Promise<string> {
  const streamInfo = await fetchStream(p.connection, p.stream);
  if (!streamInfo) throw new Error('Stream account not found on devnet');

  const ix = mkCancelIx(
    p.authority, p.stream, streamInfo.mint,
    p.vault, p.authorityAta, p.beneficiaryAta,
  );
  const tx = new Transaction().add(ix);
  tx.feePayer = p.authority;

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

export async function setMilestone(
  connection: Connection,
  authority: PublicKey,
  stream: PublicKey,
  sendTransaction: SendTx,
): Promise<string> {
  const ix = mkSetMilestoneIx(authority, stream);
  const tx = new Transaction().add(ix);
  tx.feePayer = authority;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;
  const sig = await sendTransaction(tx, connection);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

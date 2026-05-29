/**
 * vesting-client.ts — BlockBite mancer contract adapter.
 *
 * Keeps blockblast's function signatures so all page imports work unchanged.
 * Targets: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq (Solana devnet)
 *
 * StreamAccount layout (188 bytes, after 8-byte discriminator):
 *   [8]   creator              Pubkey
 *   [40]  recipient            Pubkey
 *   [72]  mint                 Pubkey
 *   [104] escrow_token_account Pubkey
 *   [136] total_amount         u64
 *   [144] amount_withdrawn     u64
 *   [152] start_time           i64
 *   [160] end_time             i64
 *   [168] cliff_time           i64
 *   [176] is_cancelled         bool
 *   [177] bump                 u8
 *   [178] seed                 u64
 *   [186] milestone_reached    bool
 *   [187] milestone_enabled    bool
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

// ─── Program constants ────────────────────────────────────────────────────────
export const VESTING_PROGRAM_ID = new PublicKey(
  'Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq',
);

// Instruction discriminators (sha256("global:<name>")[0..8])
const DISC_CREATE   = Buffer.from([71,  188, 111, 127, 108, 40,  229, 158]);
const DISC_WITHDRAW = Buffer.from([183, 18,  70,  156, 148, 109, 161, 34 ]);
const DISC_CANCEL   = Buffer.from([232, 219, 223, 41,  219, 236, 220, 190]);

const STREAM_ACCOUNT_SIZE = 188;
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

/** Vault alias for blockblast compatibility */
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
  authority:          PublicKey;
  beneficiary:        PublicKey;
  mint:               PublicKey;
  streamId:           BN;
  amountTotal:        BN;
  amountWithdrawn:    BN;
  startTs:            BN;
  cliffTs:            BN;
  endTs:              BN;
  cancelled:          boolean;
  bump:               number;
  velocityStrikes:    number;
  lastActionTs:       BN;
  requiredTier:       number;
  milestoneCount:     number;
  milestonesVerified: boolean[];
  milestonePct:       number[];
  escrowTokenAccount: PublicKey;
  milestoneReached:   boolean;
  milestoneEnabled:   boolean;
}

// ─── Decode raw account ───────────────────────────────────────────────────────
function decodeStream(pubkey: PublicKey, data: Buffer): StreamInfo | null {
  if (data.length < STREAM_ACCOUNT_SIZE) return null;
  try {
    let off = 8;
    const rd32 = () => { const pk = new PublicKey(data.slice(off, off + 32)); off += 32; return pk; };
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
    const milestoneEnabled   = data[off] !== 0;
    return {
      pubkey,
      authority:          creator,
      beneficiary:        recipient,
      mint,
      streamId:           new BN(seed.toString()),
      amountTotal:        new BN(totalAmount.toString()),
      amountWithdrawn:    new BN(amountWithdrawn.toString()),
      startTs:            new BN(startTime.toString()),
      cliffTs:            new BN(cliffTime.toString()),
      endTs:              new BN(endTime.toString()),
      cancelled:          isCancelled,
      bump,
      velocityStrikes:    0,
      lastActionTs:       new BN(0),
      requiredTier:       milestoneEnabled ? 1 : 0,
      milestoneCount:     milestoneEnabled ? 1 : 0,
      milestonesVerified: [milestoneReached],
      milestonePct:       [100],
      escrowTokenAccount,
      milestoneReached,
      milestoneEnabled,
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
    const d = decodeStream(pubkey, Buffer.from(account.data));
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
    const d = decodeStream(pubkey, Buffer.from(account.data));
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
    const d = decodeStream(pubkey, Buffer.from(account.data));
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
    return decodeStream(streamPda, Buffer.from(acc.data));
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

// ─── Compute unlocked (mirrors Rust) ─────────────────────────────────────────
export function computeUnlocked(stream: StreamInfo, nowSec: number): bigint {
  const now   = BigInt(nowSec);
  const cliff = BigInt(stream.cliffTs.toString());
  const start = BigInt(stream.startTs.toString());
  const end   = BigInt(stream.endTs.toString());
  const total = BigInt(stream.amountTotal.toString());
  const drawn = BigInt(stream.amountWithdrawn.toString());
  if (stream.cancelled) return 0n;
  if (now < cliff || now < start) return 0n;
  if (now >= end) return total > drawn ? total - drawn : 0n;
  const dur  = end > start ? end - start : 1n;
  const el   = now - start;
  const ul   = total * el / dur;
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

// ─── Raw IX builders ─────────────────────────────────────────────────────────
function mkCreateIx(
  creator: PublicKey, recipient: PublicKey, mint: PublicKey,
  creatorTA: PublicKey, escrowTA: PublicKey, streamPDA: PublicKey,
  totalAmount: bigint, startTime: bigint, endTime: bigint,
  cliffTime: bigint, seed: bigint, milestoneEnabled: boolean,
): TransactionInstruction {
  const data = Buffer.alloc(49);
  DISC_CREATE.copy(data, 0);
  data.writeBigUInt64LE(totalAmount, 8);
  data.writeBigInt64LE(startTime,   16);
  data.writeBigInt64LE(endTime,     24);
  data.writeBigInt64LE(cliffTime,   32);
  data.writeBigUInt64LE(seed,       40);
  data[48] = milestoneEnabled ? 1 : 0;
  return new TransactionInstruction({
    programId: VESTING_PROGRAM_ID,
    keys: [
      { pubkey: creator,                   isSigner: true,  isWritable: true  },
      { pubkey: recipient,                 isSigner: false, isWritable: false },
      { pubkey: mint,                      isSigner: false, isWritable: false },
      { pubkey: creatorTA,                 isSigner: false, isWritable: true  },
      { pubkey: escrowTA,                  isSigner: false, isWritable: true  },
      { pubkey: streamPDA,                 isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,          isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,   isSigner: false, isWritable: false },
    ],
    data,
  });
}

function mkWithdrawIx(
  recipient: PublicKey, streamPDA: PublicKey, mint: PublicKey,
  escrowTA: PublicKey, recipientTA: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: VESTING_PROGRAM_ID,
    keys: [
      { pubkey: recipient,    isSigner: true,  isWritable: true  },
      { pubkey: streamPDA,    isSigner: false, isWritable: true  },
      { pubkey: mint,         isSigner: false, isWritable: false },
      { pubkey: escrowTA,     isSigner: false, isWritable: true  },
      { pubkey: recipientTA,  isSigner: false, isWritable: true  },
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
      { pubkey: creator,      isSigner: true,  isWritable: true  },
      { pubkey: streamPDA,    isSigner: false, isWritable: true  },
      { pubkey: mint,         isSigner: false, isWritable: false },
      { pubkey: escrowTA,     isSigner: false, isWritable: true  },
      { pubkey: creatorTA,    isSigner: false, isWritable: true  },
      { pubkey: recipientTA,  isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DISC_CANCEL),
  });
}

// ─── High-level tx functions (blockblast-compatible) ─────────────────────────

export interface CreateStreamParams {
  connection:      Connection;
  authority:       PublicKey;
  beneficiary:     PublicKey;
  mint:            PublicKey;
  streamId:        bigint;
  amount:          bigint;
  startTs:         number;
  cliffTs:         number;
  endTs:           number;
  requiredTier?:   0 | 1 | 2;
  sendTransaction: SendTx;
}

export async function createStream(p: CreateStreamParams): Promise<string> {
  const seed = new BN(p.streamId.toString());
  const [streamPDA] = deriveStreamPDA(p.authority, p.beneficiary, seed);
  const [escrowTA]  = deriveEscrowPDA(streamPDA);
  const creatorTA   = await getAssociatedTokenAddress(p.mint, p.authority);
  const milestoneEnabled = (p.requiredTier ?? 0) > 0 || p.cliffTs > 0;

  const ix = mkCreateIx(
    p.authority, p.beneficiary, p.mint, creatorTA, escrowTA, streamPDA,
    p.amount, BigInt(p.startTs), BigInt(p.endTs), BigInt(p.cliffTs),
    p.streamId, milestoneEnabled,
  );
  const tx = new Transaction().add(ix);
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
  proofCache?:     PublicKey;
  sendTransaction: SendTx;
}

export async function withdraw(p: WithdrawParams): Promise<string> {
  const tx = new Transaction();
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

/**
 * campaign-client.ts — Client adapter for BlockBite Campaign & Milestone instructions.
 *
 * Program ID: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
 *
 * Campaign flow:
 *   1. Founder creates campaign → funds escrow
 *   2. Founder adds milestones (verification_type = 1 = GAME)
 *   3. Recipient submits proof hash
 *   4. Game verification marks milestone as verified
 *   5. Recipient claims tokens from escrow
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
export const CAMPAIGN_PROGRAM_ID = new PublicKey(
  'Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq',
);

export const VERIFICATION_GAME = 1;
export const MAX_SIGNERS = 5;

export const CAMPAIGN_ACCOUNT_SIZE = 90;
export const MILESTONE_ACCOUNT_SIZE = 372;

// Instruction discriminators: sha256("global:<name>")[0..8]
const DISC_CREATE_CAMPAIGN  = Buffer.from([111, 131, 187, 98, 160, 193, 114, 244]);
const DISC_CREATE_MILESTONE = Buffer.from([239, 58, 201, 28, 40, 186, 173, 48]);
const DISC_SUBMIT_PROOF     = Buffer.from([54, 241, 46, 84, 4, 212, 46, 94]);
const DISC_VERIFY_GAME      = Buffer.from([81, 26, 37, 190, 207, 209, 205, 211]);
const DISC_CLAIM_MILESTONE  = Buffer.from([211, 134, 152, 37, 3, 82, 214, 189]);

// ─── PDA derivation ───────────────────────────────────────────────────────────

export function deriveCampaignPDA(
  founder: PublicKey,
  seed: BN,
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(seed.toString()));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('campaign'), founder.toBuffer(), buf],
    CAMPAIGN_PROGRAM_ID,
  );
}

export function deriveCampaignEscrowPDA(campaign: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('campaign_escrow'), campaign.toBuffer()],
    CAMPAIGN_PROGRAM_ID,
  );
}

export function deriveMilestonePDA(
  campaign: PublicKey,
  milestoneSeed: BN,
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(milestoneSeed.toString()));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('milestone'), campaign.toBuffer(), buf],
    CAMPAIGN_PROGRAM_ID,
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignInfo {
  pubkey:          PublicKey;
  founder:         PublicKey;
  titleHash:       Uint8Array;
  totalBudget:     BN;
  allocatedAmount: BN;
  milestoneCount:  number;
  bump:            number;
}

export interface MilestoneInfo {
  pubkey:           PublicKey;
  campaign:         PublicKey;
  recipient:        PublicKey;
  descriptionHash:  Uint8Array;
  verificationType: number;
  oraclePubkey:     PublicKey;
  signerCount:      number;
  signers:          PublicKey[];
  gameProgramId:    PublicKey;
  tokenAmount:      BN;
  isVerified:       boolean;
  proofHash:        Uint8Array;
  bump:             number;
}

export type SendTx = (
  tx: Transaction,
  connection: Connection,
) => Promise<string>;

// ─── Decode helpers ───────────────────────────────────────────────────────────

function decodeCampaign(pubkey: PublicKey, rawData: Uint8Array): CampaignInfo | null {
  const data = Buffer.from(rawData);
  if (data.length < CAMPAIGN_ACCOUNT_SIZE) return null;
  try {
    let off = 8;
    const founder         = new PublicKey(data.slice(off, off + 32)); off += 32;
    const titleHash       = new Uint8Array(data.slice(off, off + 32)); off += 32;
    const totalBudget     = new BN(data.readBigUInt64LE(off).toString()); off += 8;
    const allocatedAmount = new BN(data.readBigUInt64LE(off).toString()); off += 8;
    const milestoneCount  = data[off]; off += 1;
    const bump            = data[off];
    return { pubkey, founder, titleHash, totalBudget, allocatedAmount, milestoneCount, bump };
  } catch {
    return null;
  }
}

function decodeMilestone(pubkey: PublicKey, rawData: Uint8Array): MilestoneInfo | null {
  const data = Buffer.from(rawData);
  if (data.length < MILESTONE_ACCOUNT_SIZE) return null;
  try {
    let off = 8;
    const campaign        = new PublicKey(data.slice(off, off + 32)); off += 32;
    const recipient       = new PublicKey(data.slice(off, off + 32)); off += 32;
    const descriptionHash = new Uint8Array(data.slice(off, off + 32)); off += 32;
    const verificationType = data[off]; off += 1;
    const oraclePubkey    = new PublicKey(data.slice(off, off + 32)); off += 32;
    const signerCount     = data[off]; off += 1;
    const signers: PublicKey[] = [];
    for (let i = 0; i < MAX_SIGNERS; i++) {
      signers.push(new PublicKey(data.slice(off, off + 32)));
      off += 32;
    }
    const gameProgramId   = new PublicKey(data.slice(off, off + 32)); off += 32;
    const tokenAmount     = new BN(data.readBigUInt64LE(off).toString()); off += 8;
    const isVerified      = data[off] !== 0; off += 1;
    const proofHash       = new Uint8Array(data.slice(off, off + 32)); off += 32;
    const bump            = data[off];
    return {
      pubkey, campaign, recipient, descriptionHash, verificationType,
      oraclePubkey, signerCount, signers, gameProgramId, tokenAmount,
      isVerified, proofHash, bump,
    };
  } catch {
    return null;
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function getAllCampaigns(connection: Connection): Promise<CampaignInfo[]> {
  const accs = await connection.getProgramAccounts(CAMPAIGN_PROGRAM_ID, {
    filters: [{ dataSize: CAMPAIGN_ACCOUNT_SIZE }],
  });
  return accs.flatMap(({ pubkey, account }) => {
    const d = decodeCampaign(pubkey, account.data);
    return d ? [d] : [];
  });
}

export async function getCampaignsByFounder(
  connection: Connection,
  founder: PublicKey,
): Promise<CampaignInfo[]> {
  const accs = await connection.getProgramAccounts(CAMPAIGN_PROGRAM_ID, {
    filters: [
      { dataSize: CAMPAIGN_ACCOUNT_SIZE },
      { memcmp: { offset: 8, bytes: founder.toBase58() } },
    ],
  });
  return accs.flatMap(({ pubkey, account }) => {
    const d = decodeCampaign(pubkey, account.data);
    return d ? [d] : [];
  });
}

export async function fetchCampaign(
  connection: Connection,
  campaignPda: PublicKey,
): Promise<CampaignInfo | null> {
  try {
    const acc = await connection.getAccountInfo(campaignPda);
    if (!acc) return null;
    return decodeCampaign(campaignPda, acc.data);
  } catch { return null; }
}

export async function getMilestonesByCampaign(
  connection: Connection,
  campaign: PublicKey,
): Promise<MilestoneInfo[]> {
  const accs = await connection.getProgramAccounts(CAMPAIGN_PROGRAM_ID, {
    filters: [
      { dataSize: MILESTONE_ACCOUNT_SIZE },
      { memcmp: { offset: 8, bytes: campaign.toBase58() } },
    ],
  });
  return accs.flatMap(({ pubkey, account }) => {
    const d = decodeMilestone(pubkey, account.data);
    return d ? [d] : [];
  });
}

export async function getMilestonesByRecipient(
  connection: Connection,
  recipient: PublicKey,
): Promise<MilestoneInfo[]> {
  const accs = await connection.getProgramAccounts(CAMPAIGN_PROGRAM_ID, {
    filters: [
      { dataSize: MILESTONE_ACCOUNT_SIZE },
      { memcmp: { offset: 40, bytes: recipient.toBase58() } },
    ],
  });
  return accs.flatMap(({ pubkey, account }) => {
    const d = decodeMilestone(pubkey, account.data);
    return d ? [d] : [];
  });
}

export async function fetchMilestone(
  connection: Connection,
  milestonePda: PublicKey,
): Promise<MilestoneInfo | null> {
  try {
    const acc = await connection.getAccountInfo(milestonePda);
    if (!acc) return null;
    return decodeMilestone(milestonePda, acc.data);
  } catch { return null; }
}

// ─── Instruction builders ─────────────────────────────────────────────────────

function mkCreateCampaignIx(
  founder: PublicKey,
  mint: PublicKey,
  founderTA: PublicKey,
  campaignEscrow: PublicKey,
  campaignPDA: PublicKey,
  titleHash: Uint8Array,
  totalBudget: bigint,
  seed: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(56);
  DISC_CREATE_CAMPAIGN.copy(data, 0);
  Buffer.from(titleHash).copy(data, 8);
  data.writeBigUInt64LE(totalBudget, 40);
  data.writeBigUInt64LE(seed, 48);
  return new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: founder,              isSigner: true,  isWritable: true  },
      { pubkey: mint,                 isSigner: false, isWritable: false },
      { pubkey: founderTA,            isSigner: false, isWritable: true  },
      { pubkey: campaignEscrow,       isSigner: false, isWritable: true  },
      { pubkey: campaignPDA,          isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,     isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function mkCreateMilestoneIx(
  founder: PublicKey,
  campaignPDA: PublicKey,
  milestonePDA: PublicKey,
  descriptionHash: Uint8Array,
  verificationType: number,
  campaignSeed: bigint,
  milestoneSeed: bigint,
  tokenAmount: bigint,
  oraclePubkey: PublicKey,
  signerCount: number,
  signers: PublicKey[],
  gameProgramId: PublicKey,
  recipient: PublicKey,
): TransactionInstruction {
  const data = Buffer.alloc(322);
  DISC_CREATE_MILESTONE.copy(data, 0);
  Buffer.from(descriptionHash).copy(data, 8);
  data[40] = verificationType;
  data.writeBigUInt64LE(campaignSeed, 41);
  data.writeBigUInt64LE(milestoneSeed, 49);
  data.writeBigUInt64LE(tokenAmount, 57);
  oraclePubkey.toBuffer().copy(data, 65);
  data[97] = signerCount;
  for (let i = 0; i < MAX_SIGNERS; i++) {
    signers[i].toBuffer().copy(data, 98 + i * 32);
  }
  gameProgramId.toBuffer().copy(data, 258);
  recipient.toBuffer().copy(data, 290);
  return new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: founder,        isSigner: true,  isWritable: true  },
      { pubkey: campaignPDA,    isSigner: false, isWritable: true  },
      { pubkey: milestonePDA,   isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function mkSubmitProofIx(
  recipient: PublicKey,
  milestonePDA: PublicKey,
  proofHash: Uint8Array,
): TransactionInstruction {
  const data = Buffer.alloc(40);
  DISC_SUBMIT_PROOF.copy(data, 0);
  Buffer.from(proofHash).copy(data, 8);
  return new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: recipient,    isSigner: true,  isWritable: true  },
      { pubkey: milestonePDA, isSigner: false, isWritable: true  },
    ],
    data,
  });
}

function mkVerifyGameIx(
  milestonePDA: PublicKey,
  gameProgram: PublicKey,
  sessionResultHash: Uint8Array,
): TransactionInstruction {
  const data = Buffer.alloc(40);
  DISC_VERIFY_GAME.copy(data, 0);
  Buffer.from(sessionResultHash).copy(data, 8);
  return new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: milestonePDA, isSigner: false, isWritable: true  },
      { pubkey: gameProgram,  isSigner: false, isWritable: false },
    ],
    data,
  });
}

function mkClaimMilestoneIx(
  recipient: PublicKey,
  milestonePDA: PublicKey,
  campaignPDA: PublicKey,
  mint: PublicKey,
  campaignEscrow: PublicKey,
  recipientTA: PublicKey,
  milestoneSeed: bigint,
  campaignSeed: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(24);
  DISC_CLAIM_MILESTONE.copy(data, 0);
  data.writeBigUInt64LE(milestoneSeed, 8);
  data.writeBigUInt64LE(campaignSeed, 16);
  return new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: recipient,           isSigner: true,  isWritable: true  },
      { pubkey: milestonePDA,        isSigner: false, isWritable: true  },
      { pubkey: campaignPDA,         isSigner: false, isWritable: false },
      { pubkey: mint,                isSigner: false, isWritable: false },
      { pubkey: campaignEscrow,      isSigner: false, isWritable: true  },
      { pubkey: recipientTA,         isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─── High-level tx functions ──────────────────────────────────────────────────

export interface CreateCampaignParams {
  connection:      Connection;
  founder:         PublicKey;
  mint:            PublicKey;
  totalBudget:     bigint;
  titleHash:       Uint8Array;
  seed:            bigint;
  sendTransaction: SendTx;
}

export async function createCampaign(p: CreateCampaignParams): Promise<string> {
  const [campaignPDA] = deriveCampaignPDA(p.founder, new BN(p.seed.toString()));
  const [campaignEscrow] = deriveCampaignEscrowPDA(campaignPDA);
  const founderTA = await getAssociatedTokenAddress(p.mint, p.founder);

  const tx = new Transaction();
  tx.add(mkCreateCampaignIx(
    p.founder, p.mint, founderTA, campaignEscrow, campaignPDA,
    p.titleHash, p.totalBudget, p.seed,
  ));

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.founder;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

export interface CreateMilestoneParams {
  connection:      Connection;
  founder:         PublicKey;
  campaignPDA:     PublicKey;
  milestonePDA:    PublicKey;
  descriptionHash: Uint8Array;
  campaignSeed:    bigint;
  milestoneSeed:   bigint;
  tokenAmount:     bigint;
  gameProgramId:   PublicKey;
  recipient:       PublicKey;
  sendTransaction: SendTx;
}

export async function createMilestone(p: CreateMilestoneParams): Promise<string> {
  const tx = new Transaction();
  tx.add(mkCreateMilestoneIx(
    p.founder, p.campaignPDA, p.milestonePDA,
    p.descriptionHash, VERIFICATION_GAME,
    p.campaignSeed, p.milestoneSeed, p.tokenAmount,
    PublicKey.default,
    0,
    Array(MAX_SIGNERS).fill(PublicKey.default),
    p.gameProgramId,
    p.recipient,
  ));

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.founder;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

export interface SubmitProofParams {
  connection:      Connection;
  recipient:       PublicKey;
  milestonePDA:    PublicKey;
  proofHash:       Uint8Array;
  sendTransaction: SendTx;
}

export async function submitProof(p: SubmitProofParams): Promise<string> {
  const tx = new Transaction();
  tx.add(mkSubmitProofIx(p.recipient, p.milestonePDA, p.proofHash));

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.recipient;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

export interface VerifyGameParams {
  connection:         Connection;
  milestonePDA:       PublicKey;
  gameProgram:        PublicKey;
  sessionResultHash:  Uint8Array;
  sendTransaction:    SendTx;
}

export async function verifyGame(p: VerifyGameParams): Promise<string> {
  const tx = new Transaction();
  tx.add(mkVerifyGameIx(p.milestonePDA, p.gameProgram, p.sessionResultHash));

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.gameProgram;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

export interface ClaimMilestoneParams {
  connection:      Connection;
  recipient:       PublicKey;
  milestonePDA:    PublicKey;
  campaignPDA:     PublicKey;
  mint:            PublicKey;
  campaignEscrow:  PublicKey;
  recipientTA:     PublicKey;
  milestoneSeed:   bigint;
  campaignSeed:    bigint;
  sendTransaction: SendTx;
}

export async function claimMilestone(p: ClaimMilestoneParams): Promise<string> {
  const tx = new Transaction();

  try {
    await getAccount(p.connection, p.recipientTA);
  } catch {
    tx.add(createAssociatedTokenAccountInstruction(
      p.recipient, p.recipientTA, p.recipient, p.mint,
    ));
  }

  tx.add(mkClaimMilestoneIx(
    p.recipient, p.milestonePDA, p.campaignPDA, p.mint,
    p.campaignEscrow, p.recipientTA, p.milestoneSeed, p.campaignSeed,
  ));

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.recipient;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

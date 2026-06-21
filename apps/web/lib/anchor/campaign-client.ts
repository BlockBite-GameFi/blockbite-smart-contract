/**
 * campaign-client.ts — Client adapter for BlockBite Campaign & Milestone instructions.
 *
 * Program ID: Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq
 *
 * Campaign flow:
 *   1. Founder creates campaign → funds escrow
 *   2. Founder adds milestones (verified via declared game program)
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
// Override via NEXT_PUBLIC_CAMPAIGN_PROGRAM_ID for localnet (Surfpool) testing.
export const CAMPAIGN_PROGRAM_ID = new PublicKey(
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CAMPAIGN_PROGRAM_ID) ||
  '9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX',
);

/**
 * Fetch the game authority pubkey from the embedded game server API.
 * Falls back to env var or placeholder if the fetch fails.
 */
export async function fetchGameAuthorityPubkey(): Promise<PublicKey> {
  // Env var override (highest priority)
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GAME_AUTHORITY_PUBKEY) {
    return new PublicKey(process.env.NEXT_PUBLIC_GAME_AUTHORITY_PUBKEY);
  }
  try {
    const res = await fetch('/api/game/health');
    if (res.ok) {
      const { gameAuthority } = await res.json() as { gameAuthority?: string };
      if (gameAuthority) return new PublicKey(gameAuthority);
    }
  } catch { /* non-fatal */ }
  // Fallback (should only happen if API route is unreachable)
  return new PublicKey('Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq');
}

/** Synchronous fallback for code that can't await — use fetchGameAuthorityPubkey() where possible */
export const GAME_AUTHORITY_PUBKEY = new PublicKey(
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GAME_AUTHORITY_PUBKEY) ||
  'Aso25jcqxjZ2X3A1QSV4ZgZkj4B8pw6JNd4jNVcpB7pq',
);

// CampaignAccount: 98 bytes = 8 disc + 32 founder + 32 title_hash + 8 total_budget
//                             + 8 allocated_amount + 8 allocated_fees + 1 milestone_count + 1 bump
export const CAMPAIGN_ACCOUNT_SIZE = 98;
// MilestoneAccount: 150 bytes
export const MILESTONE_ACCOUNT_SIZE = 150;

// Instruction discriminators: sha256("global:<name>")[0..8]
const DISC_CREATE_CAMPAIGN    = Buffer.from([111, 131, 187, 98, 160, 193, 114, 244]);
const DISC_CREATE_MILESTONE   = Buffer.from([239, 58, 201, 28, 40, 186, 173, 48]);
const DISC_VERIFY_GAME        = Buffer.from([81, 26, 37, 190, 207, 209, 205, 211]);
const DISC_CLAIM_MILESTONE    = Buffer.from([211, 134, 152, 37, 3, 82, 214, 189]);
const DISC_INIT_PROTOCOL_CFG  = Buffer.from([80, 148, 57, 230, 228, 247, 51, 164]);

// ─── PDA derivation ───────────────────────────────────────────────────────────

export function deriveProtocolConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    CAMPAIGN_PROGRAM_ID,
  );
}

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
  allocatedFees:   BN;  // sum of game-verification fees reserved to treasury
  milestoneCount:  number;
  bump:            number;
}

export interface MilestoneInfo {
  pubkey:           PublicKey;
  campaign:         PublicKey;
  recipient:        PublicKey;
  descriptionHash:  Uint8Array;
  /** On-chain field is `game_authority` — the game server's signing pubkey. */
  gameProgramId:    PublicKey;
  tokenAmount:      BN;
  targetLevel:      number;
  achievedLevel:    number;
  difficulty:       number;
  isVerified:       boolean;
  isClaimed:        boolean;
  bump:             number;
  /** Always false — submit_proof instruction does not exist in the current program. */
  proofSubmitted:   boolean;
  /** Always empty — no proof hash is stored on-chain. */
  proofHash:        Uint8Array;
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
    const allocatedFees   = new BN(data.readBigUInt64LE(off).toString()); off += 8;
    const milestoneCount  = data[off]; off += 1;
    const bump            = data[off];
    return { pubkey, founder, titleHash, totalBudget, allocatedAmount, allocatedFees, milestoneCount, bump };
  } catch {
    return null;
  }
}

function decodeMilestone(pubkey: PublicKey, rawData: Uint8Array): MilestoneInfo | null {
  const data = Buffer.from(rawData);
  if (data.length < MILESTONE_ACCOUNT_SIZE) return null;
  try {
    // Rust layout (after 8-byte discriminator):
    // campaign(32) recipient(32) description_hash(32) game_authority(32)
    // token_amount(8) target_level(1) achieved_level(1) difficulty(1)
    // is_verified(1) is_claimed(1) bump(1)
    let off = 8;
    const campaign        = new PublicKey(data.slice(off, off + 32)); off += 32; // 40
    const recipient       = new PublicKey(data.slice(off, off + 32)); off += 32; // 72
    const descriptionHash = new Uint8Array(data.slice(off, off + 32)); off += 32; // 104
    const gameProgramId   = new PublicKey(data.slice(off, off + 32)); off += 32; // 136
    const tokenAmount     = new BN(data.readBigUInt64LE(off).toString()); off += 8; // 144
    const targetLevel     = data[off]; off += 1; // 145
    const achievedLevel   = data[off]; off += 1; // 146
    const difficulty      = data[off]; off += 1; // 147
    const isVerified      = data[off] !== 0; off += 1; // 148
    const isClaimed       = data[off] !== 0; off += 1; // 149
    const bump            = data[off]; // 150
    return {
      pubkey, campaign, recipient, descriptionHash, gameProgramId, tokenAmount,
      targetLevel, achievedLevel, difficulty, isVerified, isClaimed, bump,
      proofSubmitted: false,
      proofHash: new Uint8Array(32),
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

// ─── Seed-finding utilities ───────────────────────────────────────────────────

/**
 * Brute-force the milestone seed by matching the known PDA address.
 * Tries seeds 0..maxSeed synchronously (~1ms per attempt).
 */
export function findMilestoneSeedSync(
  campaignPDA: PublicKey,
  milestonePDA: PublicKey,
  maxSeed = 2000,
): bigint | null {
  for (let seed = 0n; seed <= BigInt(maxSeed); seed++) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(seed);
    const [derived] = PublicKey.findProgramAddressSync(
      [Buffer.from('milestone'), campaignPDA.toBuffer(), buf],
      CAMPAIGN_PROGRAM_ID,
    );
    if (derived.equals(milestonePDA)) return seed;
  }
  return null;
}

/**
 * Brute-force the campaign seed by matching the known PDA address.
 * Tries seeds 0..maxSeed synchronously (~1ms per attempt).
 */
export function findCampaignSeedSync(
  founder: PublicKey,
  campaignPDA: PublicKey,
  maxSeed = 2000,
): bigint | null {
  for (let seed = 0n; seed <= BigInt(maxSeed); seed++) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(seed);
    const [derived] = PublicKey.findProgramAddressSync(
      [Buffer.from('campaign'), founder.toBuffer(), buf],
      CAMPAIGN_PROGRAM_ID,
    );
    if (derived.equals(campaignPDA)) return seed;
  }
  return null;
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
  founder:         PublicKey,
  campaignPDA:     PublicKey,
  milestonePDA:    PublicKey,
  protocolConfig:  PublicKey,
  mint:            PublicKey,
  campaignEscrow:  PublicKey,
  treasuryTA:      PublicKey,
  descriptionHash: Uint8Array,
  campaignSeed:    bigint,
  milestoneSeed:   bigint,
  tokenAmount:     bigint,
  gameAuthority:   PublicKey,
  recipient:       PublicKey,
  targetLevel:     number,
  difficulty:      number,
): TransactionInstruction {
  // disc(8) + desc_hash(32) + campaign_seed(8) + milestone_seed(8) + token_amount(8)
  // + game_authority(32) + recipient(32) + target_level(1) + difficulty(1) = 130 bytes
  const data = Buffer.alloc(130);
  DISC_CREATE_MILESTONE.copy(data, 0);
  Buffer.from(descriptionHash).copy(data, 8);
  data.writeBigUInt64LE(campaignSeed,  40);
  data.writeBigUInt64LE(milestoneSeed, 48);
  data.writeBigUInt64LE(tokenAmount,   56);
  gameAuthority.toBuffer().copy(data,  64);
  recipient.toBuffer().copy(data,      96);
  data[128] = targetLevel;
  data[129] = difficulty;
  return new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: founder,                 isSigner: true,  isWritable: true  }, // 0
      { pubkey: campaignPDA,             isSigner: false, isWritable: true  }, // 1
      { pubkey: milestonePDA,            isSigner: false, isWritable: true  }, // 2
      { pubkey: protocolConfig,          isSigner: false, isWritable: false }, // 3
      { pubkey: mint,                    isSigner: false, isWritable: false }, // 4
      { pubkey: campaignEscrow,          isSigner: false, isWritable: true  }, // 5
      { pubkey: treasuryTA,              isSigner: false, isWritable: true  }, // 6
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false }, // 7
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 8
    ],
    data,
  });
}

// NOTE: verify_game requires game_authority to sign — must be called server-side.
function mkVerifyGameIx(
  campaign: PublicKey,
  milestonePDA: PublicKey,
  gameAuthority: PublicKey,
  milestoneSeed: bigint,
  achievedLevel: number,
): TransactionInstruction {
  // Rust: #[instruction(milestone_seed: u64, achieved_level: u8)]
  // = 8 (disc) + 8 (seed) + 1 (level) = 17 bytes total
  const data = Buffer.alloc(17);
  DISC_VERIFY_GAME.copy(data, 0);
  data.writeBigUInt64LE(milestoneSeed, 8);
  data[16] = achievedLevel;
  return new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: campaign,      isSigner: false, isWritable: false },
      { pubkey: milestonePDA,  isSigner: false, isWritable: true  },
      { pubkey: gameAuthority, isSigner: true,  isWritable: false },
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
  mint:            PublicKey;  // SPL mint of the campaign
  treasury:        PublicKey;  // wallet that owns treasury ATAs (TEAM_WALLET)
  descriptionHash: Uint8Array;
  campaignSeed:    bigint;
  milestoneSeed:   bigint;
  tokenAmount:     bigint;
  /** Game server's signing public key (on-chain oracle). */
  gameProgramId:   PublicKey;
  recipient:       PublicKey;
  /** Level recipient must reach to unlock claim. Range: 1–30. */
  targetLevel:     number;
  /** 1=Easy, 2=Medium, 3=Hard */
  difficulty:      number;
  sendTransaction: SendTx;
}

export async function createMilestone(p: CreateMilestoneParams): Promise<string> {
  const [protocolConfig]  = deriveProtocolConfigPDA();
  const [campaignEscrow]  = deriveCampaignEscrowPDA(p.campaignPDA);
  const treasuryTA        = await getAssociatedTokenAddress(p.mint, p.treasury);

  const tx = new Transaction();
  tx.add(mkCreateMilestoneIx(
    p.founder, p.campaignPDA, p.milestonePDA,
    protocolConfig, p.mint, campaignEscrow, treasuryTA,
    p.descriptionHash,
    p.campaignSeed, p.milestoneSeed, p.tokenAmount,
    p.gameProgramId,
    p.recipient,
    p.targetLevel,
    p.difficulty,
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
  campaign:        PublicKey;
  milestonePDA:    PublicKey;
  milestoneSeed:   bigint;
  proofHash:       Uint8Array;
  sendTransaction: SendTx;
}

/** @deprecated submit_proof removed from on-chain program. Kept for API compatibility. */
export async function submitProof(_p: SubmitProofParams): Promise<string> {
  throw new Error('submitProof is no longer supported — use verifyGame (server-side) instead.');
}

export interface VerifyGameParams {
  connection:      Connection;
  campaign:        PublicKey;
  milestonePDA:    PublicKey;
  /** game_authority pubkey — must be the signer. Use from game server only, not browser. */
  gameAuthority:   PublicKey;
  milestoneSeed:   bigint;
  achievedLevel:   number;
  sendTransaction: SendTx;
}

/**
 * Builds and sends a verify_game transaction.
 * MUST be called server-side: game_authority private key is required to sign.
 * From the browser, use the game server's POST /api/verify endpoint instead.
 */
export async function verifyGame(p: VerifyGameParams): Promise<string> {
  const tx = new Transaction();
  tx.add(mkVerifyGameIx(
    p.campaign, p.milestonePDA, p.gameAuthority, p.milestoneSeed, p.achievedLevel,
  ));

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.gameAuthority;

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

// ─── Protocol Config ──────────────────────────────────────────────────────────

export interface InitProtocolConfigParams {
  connection:      Connection;
  admin:           PublicKey;   // signer, payer
  treasury:        PublicKey;   // wallet that will own per-mint treasury ATAs
  sendTransaction: SendTx;
}

/** One-time initialiser — call once after deploying the program. Admin signs. */
export async function initProtocolConfig(p: InitProtocolConfigParams): Promise<string> {
  const [protocolConfig] = deriveProtocolConfigPDA();
  // disc(8) + treasury Pubkey(32) = 40 bytes
  const data = Buffer.alloc(40);
  DISC_INIT_PROTOCOL_CFG.copy(data, 0);
  p.treasury.toBuffer().copy(data, 8);

  const ix = new TransactionInstruction({
    programId: CAMPAIGN_PROGRAM_ID,
    keys: [
      { pubkey: p.admin,                 isSigner: true,  isWritable: true  },
      { pubkey: protocolConfig,          isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = p.admin;

  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

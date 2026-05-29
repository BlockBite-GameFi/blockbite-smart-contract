// BlockBite TDP — on-chain helpers for the frontend
// Program ID: 9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX

import {
  PublicKey,
  Connection,
  TransactionInstruction,
} from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bvS');

// sha256("global:<name>")[0..8] — verified against blockbite.ts test file
const DISC_CREATE   = Buffer.from([71,  188, 111, 127, 108, 40,  229, 158]);
const DISC_WITHDRAW = Buffer.from([183, 18,  70,  156, 148, 109, 161, 34 ]);
const DISC_CANCEL   = Buffer.from([232, 219, 223, 41,  219, 236, 220, 190]);

// ─── PDA helpers ──────────────────────────────────────────────

export function getStreamPDA(
  creator: PublicKey,
  recipient: PublicKey,
  seed: bigint,
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(seed);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stream'), creator.toBuffer(), recipient.toBuffer(), buf],
    PROGRAM_ID,
  );
}

export function getEscrowPDA(streamPDA: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), streamPDA.toBuffer()],
    PROGRAM_ID,
  );
}

// Derives Associated Token Account without importing @solana/spl-token
export function getATA(wallet: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

// ─── StreamAccount layout (188 bytes) ────────────────────────
// [0..8]     discriminator
// [8..40]    creator               Pubkey
// [40..72]   recipient             Pubkey
// [72..104]  mint                  Pubkey
// [104..136] escrow_token_account  Pubkey
// [136..144] total_amount          u64
// [144..152] amount_withdrawn      u64
// [152..160] start_time            i64
// [160..168] end_time              i64
// [168..176] cliff_time            i64
// [176]      is_cancelled          bool
// [177]      bump                  u8
// [178..186] seed                  u64
// [186]      milestone_reached     bool
// [187]      milestone_enabled     bool
// Total = 188 bytes

export interface ChainStream {
  address: PublicKey;
  creator: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  escrowTokenAccount: PublicKey;
  totalAmount: bigint;
  amountWithdrawn: bigint;
  startTime: bigint;
  endTime: bigint;
  cliffTime: bigint;
  isCancelled: boolean;
  bump: number;
  seed: bigint;
  milestoneReached: boolean;
  milestoneEnabled: boolean;
}

export function parseStreamAccount(address: PublicKey, raw: Uint8Array): ChainStream {
  const data = Buffer.from(raw);
  let off = 8; // skip discriminator
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
  const milestoneEnabled   = data[off] !== 0;
  return {
    address, creator, recipient, mint, escrowTokenAccount,
    totalAmount, amountWithdrawn, startTime, endTime, cliffTime,
    isCancelled, bump, seed, milestoneReached, milestoneEnabled,
  };
}

export async function fetchWalletStreams(
  connection: Connection,
  wallet: PublicKey,
): Promise<ChainStream[]> {
  const base = [{ dataSize: 188 }];
  const [byCreator, byRecipient] = await Promise.all([
    connection.getProgramAccounts(PROGRAM_ID, {
      filters: [...base, { memcmp: { offset: 8,  bytes: wallet.toBase58() } }],
    }),
    connection.getProgramAccounts(PROGRAM_ID, {
      filters: [...base, { memcmp: { offset: 40, bytes: wallet.toBase58() } }],
    }),
  ]);

  const seen = new Set<string>();
  const out: ChainStream[] = [];
  for (const { pubkey, account } of [...byCreator, ...byRecipient]) {
    const key = pubkey.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      out.push(parseStreamAccount(pubkey, account.data));
    } catch { /* skip malformed */ }
  }
  return out;
}

// ─── Instruction builders ─────────────────────────────────────

export function buildCreateStreamIx(
  creator:          PublicKey,
  recipient:        PublicKey,
  mint:             PublicKey,
  creatorTA:        PublicKey,
  escrowTA:         PublicKey,
  streamPDA:        PublicKey,
  totalAmount:      bigint,
  startTime:        bigint,
  endTime:          bigint,
  cliffTime:        bigint,
  seed:             bigint,
  milestoneEnabled: boolean,
): TransactionInstruction {
  const data = Buffer.alloc(49);
  DISC_CREATE.copy(data, 0);
  data.writeBigUInt64LE(totalAmount,  8);
  data.writeBigInt64LE(startTime,    16);
  data.writeBigInt64LE(endTime,      24);
  data.writeBigInt64LE(cliffTime,    32);
  data.writeBigUInt64LE(seed,        40);
  data[48] = milestoneEnabled ? 1 : 0;
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator,           isSigner: true,  isWritable: true  },
      { pubkey: recipient,         isSigner: false, isWritable: false },
      { pubkey: mint,              isSigner: false, isWritable: false },
      { pubkey: creatorTA,         isSigner: false, isWritable: true  },
      { pubkey: escrowTA,          isSigner: false, isWritable: true  },
      { pubkey: streamPDA,         isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildWithdrawIx(
  recipient:   PublicKey,
  streamPDA:   PublicKey,
  mint:        PublicKey,
  escrowTA:    PublicKey,
  recipientTA: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: recipient,         isSigner: true,  isWritable: true  },
      { pubkey: streamPDA,         isSigner: false, isWritable: true  },
      { pubkey: mint,              isSigner: false, isWritable: false },
      { pubkey: escrowTA,          isSigner: false, isWritable: true  },
      { pubkey: recipientTA,       isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DISC_WITHDRAW),
  });
}

export function buildCancelIx(
  creator:     PublicKey,
  streamPDA:   PublicKey,
  mint:        PublicKey,
  escrowTA:    PublicKey,
  creatorTA:   PublicKey,
  recipientTA: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator,         isSigner: true,  isWritable: true  },
      { pubkey: streamPDA,       isSigner: false, isWritable: true  },
      { pubkey: mint,            isSigner: false, isWritable: false },
      { pubkey: escrowTA,        isSigner: false, isWritable: true  },
      { pubkey: creatorTA,       isSigner: false, isWritable: true  },
      { pubkey: recipientTA,     isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DISC_CANCEL),
  });
}

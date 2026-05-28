/**
 * BlockBite TDP — Anchor program client
 *
 * All on-chain interactions go through this file.
 * Import `useProgram` in any 'use client' component.
 */
import { useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { AnchorProvider, Program, BN, Idl } from '@coral-xyz/anchor';
import {
  PublicKey, SystemProgram,
  type Connection,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { IDL } from './idl';

// ─── Constants ────────────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey('9UipodjT55vBd8zZmEPvcFc8dVCveV1CMzYW2zsDHceX');

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Manually typed mirror of the StreamAccount struct in the smart contract.
 * Using a manual interface avoids IDL readonly-array type conflicts with Anchor.
 */
export interface StreamAccount {
  creator:            PublicKey;
  recipient:          PublicKey;
  mint:               PublicKey;
  escrowTokenAccount: PublicKey;
  totalAmount:        BN;
  amountWithdrawn:    BN;
  startTime:          BN;
  endTime:            BN;
  cliffTime:          BN;
  isCancelled:        boolean;
  bump:               number;
  seed:               BN;
  milestoneReached:   boolean;
  milestoneEnabled:   boolean;
}

export interface ParsedStream {
  pubkey:    PublicKey;
  account:   StreamAccount;
  id:        string;
  status:    'active' | 'pending' | 'completed' | 'cancelled';
  unlocked:  number;
  claimable: number;
}

// ─── PDA helpers ──────────────────────────────────────────────────────────────

export function getStreamPda(
  creator:   PublicKey,
  recipient: PublicKey,
  seed:      BN,
): [PublicKey, number] {
  const seedBuf = Buffer.alloc(8);
  seedBuf.writeBigUInt64LE(BigInt(seed.toString()));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stream'), creator.toBuffer(), recipient.toBuffer(), seedBuf],
    PROGRAM_ID,
  );
}

export function getEscrowPda(stream: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), stream.toBuffer()],
    PROGRAM_ID,
  );
}

// ─── Unlock math (mirrors utils.rs) ──────────────────────────────────────────

export function calculateUnlocked(acc: StreamAccount, nowSec: number): number {
  const total = Number(acc.totalAmount);
  if (acc.isCancelled) return Number(acc.amountWithdrawn);

  // Gate 1: Cliff — zero tokens before cliff_date
  const cliff = Number(acc.cliffTime);
  if (cliff > 0 && nowSec < cliff) return 0;

  // Gate 2: Milestone — zero tokens until milestone is reached
  if (acc.milestoneEnabled && !acc.milestoneReached) return 0;

  const start = Number(acc.startTime);
  const end   = Number(acc.endTime);
  if (nowSec < start) return 0;
  if (nowSec >= end)  return total;

  // Linear from effective start (cliff or stream start)
  const effectiveStart = cliff > 0 ? cliff : start;
  return Math.floor(total * (nowSec - effectiveStart) / (end - effectiveStart));
}

function deriveStatus(acc: StreamAccount, unlocked: number): ParsedStream['status'] {
  if (acc.isCancelled) return 'cancelled';
  const now = Date.now() / 1000;
  if (now < Number(acc.startTime)) return 'pending';
  // Blocked by cliff or milestone gate
  if (Number(acc.cliffTime) > 0 && now < Number(acc.cliffTime)) return 'pending';
  if (acc.milestoneEnabled && !acc.milestoneReached) return 'pending';
  if (unlocked >= Number(acc.totalAmount) && Number(acc.amountWithdrawn) >= Number(acc.totalAmount)) return 'completed';
  return 'active';
}

// ─── Ensure ATA exists (creates if missing) ───────────────────────────────────

async function ensureAta(
  connection: Connection,
  payer:      PublicKey,
  mint:       PublicKey,
  owner:      PublicKey,
): Promise<{ address: PublicKey; createIx?: ReturnType<typeof createAssociatedTokenAccountInstruction> }> {
  const address = getAssociatedTokenAddressSync(mint, owner, false);
  try {
    await getAccount(connection, address);
    return { address };
  } catch {
    return {
      address,
      createIx: createAssociatedTokenAccountInstruction(payer, address, owner, mint),
    };
  }
}

// ─── Parse error ──────────────────────────────────────────────────────────────

export function parseAnchorError(err: unknown): string {
  const msg = String(err);
  const match = msg.match(/Error Code: (\w+)/);
  if (match) {
    const map: Record<string, string> = {
      Unauthorized:               'You are not authorised to perform this action.',
      AlreadyCancelled:           'This stream is already cancelled.',
      FullyVested:                'Stream is fully vested — cannot be cancelled.',
      NothingToWithdraw:          'No tokens unlocked yet — nothing to withdraw.',
      InsufficientUnlockedTokens: 'No unlocked tokens available to withdraw.',
      StreamCancelled:            'This stream has been cancelled.',
      StreamNotStarted:           'Vesting has not started yet.',
      BotDetected:                'Too many rapid requests. Wait 2 seconds between withdrawals.',
      ClaimTooSmall:              'Claimable amount is below minimum threshold (1,000 tokens).',
      CliffNotReached:            'Cliff period has not passed yet.',
      InvalidTimestamp:           'Invalid dates: end must be after start, cliff must be before end.',
      InvalidAmount:              'Amount must be greater than zero.',
      InvalidRecipient:           'Creator and recipient cannot be the same wallet.',
      StreamNotCloseable:         'Stream must be cancelled or fully withdrawn first.',
    };
    return map[match[1]] ?? `Contract error: ${match[1]}`;
  }
  if (msg.includes('insufficient funds'))    return 'Insufficient SOL for transaction fees.';
  if (msg.includes('insufficient lamports')) return 'Insufficient SOL balance.';
  if (msg.includes('0x1'))                   return 'Insufficient token balance.';
  if (msg.includes('User rejected'))         return 'Transaction cancelled by user.';
  return msg.slice(0, 160);
}

// ─── Hook: useProgram ─────────────────────────────────────────────────────────

// Use `any` to sidestep Anchor IDL readonly-array vs mutable-array type constraint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Program<any>;

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo((): AnyProgram | null => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;
    const provider = new AnchorProvider(
      connection,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wallet as any,
      { commitment: 'confirmed', preflightCommitment: 'confirmed' },
    );
    // Cast through unknown to escape the readonly-array constraint on IDL.
    return new Program(IDL as unknown as Idl, provider);
  }, [connection, wallet]);

  // ── fetchStreams ────────────────────────────────────────────────────────────
  async function fetchStreams(walletPk: PublicKey): Promise<ParsedStream[]> {
    if (!program) return [];
    const now = Date.now() / 1000;

    const [asCreator, asRecipient] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (program.account as any)['streamAccount'].all([
        { memcmp: { offset: 8, bytes: walletPk.toBase58() } },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (program.account as any)['streamAccount'].all([
        { memcmp: { offset: 8 + 32, bytes: walletPk.toBase58() } },
      ]),
    ]);

    const all = [...asCreator, ...asRecipient].filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any, i: number, a: any[]) => a.findIndex((x: any) => x.publicKey.equals(v.publicKey)) === i,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return all.map(({ publicKey, account }: { publicKey: PublicKey; account: any }) => {
      const acc = account as StreamAccount;
      const unlocked  = calculateUnlocked(acc, now);
      const claimable = Math.max(0, unlocked - Number(acc.amountWithdrawn));
      return {
        pubkey:   publicKey,
        account:  acc,
        id:       publicKey.toBase58().slice(0, 8),
        status:   deriveStatus(acc, unlocked),
        unlocked,
        claimable,
      };
    });
  }

  // ── createStream ────────────────────────────────────────────────────────────
  async function createStream(params: {
    recipientPk:      PublicKey;
    mint:             PublicKey;
    totalAmount:      BN;
    startTime:        BN;
    endTime:          BN;
    cliffTime:        BN;
    seed:             BN;
    milestoneEnabled: boolean;
  }) {
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');
    const { recipientPk, mint, totalAmount, startTime, endTime, cliffTime, seed, milestoneEnabled } = params;
    const creator = wallet.publicKey;

    const [streamPda] = getStreamPda(creator, recipientPk, seed);
    const [escrowPda] = getEscrowPda(streamPda);

    const { address: creatorAta, createIx: createCreatorAtaIx } =
      await ensureAta(connection, creator, mint, creator);

    const preIxs = [createCreatorAtaIx].filter(Boolean) as
      ReturnType<typeof createAssociatedTokenAccountInstruction>[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const methods: any = program.methods;
    const txSig = await methods
      .createStream(totalAmount, startTime, endTime, cliffTime, seed, milestoneEnabled)
      .accounts({
        creator,
        recipient:           recipientPk,
        mint,
        creatorTokenAccount: creatorAta,
        escrowTokenAccount:  escrowPda,
        stream:              streamPda,
        tokenProgram:        TOKEN_PROGRAM_ID,
        systemProgram:       SystemProgram.programId,
      })
      .preInstructions(preIxs)
      .rpc();

    return { txSig, streamPda };
  }

  // ── withdraw ────────────────────────────────────────────────────────────────
  async function withdraw(stream: ParsedStream) {
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');
    const recipient = wallet.publicKey;
    const acc       = stream.account;

    const [escrowPda] = getEscrowPda(stream.pubkey);
    const { address: recipientAta, createIx } =
      await ensureAta(connection, recipient, acc.mint, recipient);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (program.methods as any)
      .withdraw()
      .accounts({
        recipient,
        stream:                stream.pubkey,
        mint:                  acc.mint,
        escrowTokenAccount:    escrowPda,
        recipientTokenAccount: recipientAta,
        tokenProgram:          TOKEN_PROGRAM_ID,
      })
      .preInstructions(createIx ? [createIx] : [])
      .rpc();

    return txSig;
  }

  // ── cancelStream ───────────────────────────────────────────────────────────
  async function cancelStream(stream: ParsedStream) {
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');
    const creator = wallet.publicKey;
    const acc     = stream.account;

    const [escrowPda] = getEscrowPda(stream.pubkey);

    const { address: creatorAta,   createIx: cix1 } =
      await ensureAta(connection, creator, acc.mint, creator);
    const { address: recipientAta, createIx: cix2 } =
      await ensureAta(connection, creator, acc.mint, acc.recipient);

    const preIxs = [cix1, cix2].filter(Boolean) as
      ReturnType<typeof createAssociatedTokenAccountInstruction>[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (program.methods as any)
      .cancel()
      .accounts({
        creator,
        stream:                stream.pubkey,
        mint:                  acc.mint,
        escrowTokenAccount:    escrowPda,
        creatorTokenAccount:   creatorAta,
        recipientTokenAccount: recipientAta,
        tokenProgram:          TOKEN_PROGRAM_ID,
      })
      .preInstructions(preIxs)
      .rpc();

    return txSig;
  }

  // ── setMilestone ───────────────────────────────────────────────────────────
  /** Creator calls this to unlock a cliff/milestone stream. */
  async function setMilestone(stream: ParsedStream) {
    if (!program || !wallet.publicKey) throw new Error('Wallet not connected');
    const creator = wallet.publicKey;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSig = await (program.methods as any)
      .setMilestone()
      .accounts({
        creator,
        stream: stream.pubkey,
      })
      .rpc();

    return txSig;
  }

  return { program, fetchStreams, createStream, withdraw, cancelStream, setMilestone };
}

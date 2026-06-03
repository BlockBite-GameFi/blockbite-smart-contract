/**
 * Browser-side helper for the blockbite-vesting Anchor program.
 *
 * Wraps the three on-chain instructions (create_stream, withdraw, cancel)
 * with a friendlier API that integrates with the wallet adapter's
 * `sendTransaction` signature instead of needing an Anchor Wallet.
 *
 * Keeps the IDL import isolated so route-level pages don't pull the
 * 6KB JSON twice.
 */

import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
// IDL is co-located in lib/anchor/ because .vercelignore excludes target/.
// The Anchor build still writes target/idl/blockbite_vesting.json on CI;
// when it changes substantively, run `cp target/idl/blockbite_vesting.json
// lib/anchor/idl.json` to keep this copy in sync (or wire a postbuild
// script in Anchor.toml).
import IDL from './idl.json';

export const VESTING_PROGRAM_ID = new PublicKey(IDL.address);

export type SendTx = (
  tx: Transaction,
  connection: Connection,
  opts?: { signers?: anchor.web3.Signer[]; skipPreflight?: boolean; maxRetries?: number },
) => Promise<string>;

export function deriveStreamPDA(authority: PublicKey, streamId: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('stream'),
      authority.toBuffer(),
      streamId.toArrayLike(Buffer, 'le', 8),
    ],
    VESTING_PROGRAM_ID,
  );
}

export function deriveVaultPDA(authority: PublicKey, streamId: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('vault'),
      authority.toBuffer(),
      streamId.toArrayLike(Buffer, 'le', 8),
    ],
    VESTING_PROGRAM_ID,
  );
}

/** Build a read-only Anchor Program — no signing capability. */
function readonlyProgram(connection: Connection): Program {
  // Anchor 0.32: provider with no wallet works for reads, instruction.build*
  const provider = new anchor.AnchorProvider(
    connection,
    {} as anchor.Wallet,
    { commitment: 'confirmed' },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(IDL as anchor.Idl, provider as any);
}

export interface CreateStreamParams {
  connection:    Connection;
  authority:     PublicKey;     // creator (signer)
  beneficiary:   PublicKey;     // recipient
  mint:          PublicKey;     // SPL token mint
  streamId:      bigint;        // unique per (authority, mint) — frontend picks
  amount:        bigint;        // in raw token units (already × 10^decimals)
  startTs:       number;        // unix seconds
  cliffTs:       number;        // unix seconds — 0 = no cliff
  endTs:         number;        // unix seconds
  requiredTier?: 0 | 1 | 2;    // oracle milestone gate; 0 = no gate
  sendTransaction: SendTx;
  /** Optional extra instructions prepended to the tx (e.g. wSOL wrap) */
  preInstructions?: import('@solana/web3.js').TransactionInstruction[];
}

/**
 * Builds + signs + sends the create_stream transaction.
 * Returns the signature on confirmation.
 */
export async function createStream(p: CreateStreamParams): Promise<string> {
  const program = readonlyProgram(p.connection);
  const streamIdBn = new BN(p.streamId.toString());

  const [streamPda] = deriveStreamPDA(p.authority, streamIdBn);
  const [vaultPda]  = deriveVaultPDA(p.authority, streamIdBn);
  const authorityAta = await getAssociatedTokenAddress(p.mint, p.authority);

  // Build the instruction with Anchor.
  // create_stream IDL args: stream_id, amount, start_ts, cliff_ts, end_ts, required_tier (6 total).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ix = await (program.methods as any)
    .createStream(
      streamIdBn,
      new BN(p.amount.toString()),
      new BN(p.startTs),
      new BN(p.cliffTs),
      new BN(p.endTs),
      new BN(p.requiredTier ?? 0),
    )
    .accounts({
      authority:     p.authority,
      beneficiary:   p.beneficiary,
      mint:          p.mint,
      stream:        streamPda,
      vault:         vaultPda,
      authorityAta:  authorityAta,
      tokenProgram:  TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent:          SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  // ── Retry loop: build a FRESH Transaction on every attempt so the wallet
  //    always picks up a brand-new blockhash at signing time.
  //    Never reuse a previously-signed tx object — the old signatures make it
  //    invalid for a second blockhash.
  const MAX_RETRIES = 10;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Build fresh transaction each attempt (new blockhash, no stale sigs)
    const tx = new Transaction();
    if (p.preInstructions?.length) {
      p.preInstructions.forEach(ix2 => tx.add(ix2));
    }
    tx.add(ix);
    tx.feePayer = p.authority;
    // recentBlockhash intentionally NOT set — wallet fetches fresh blockhash
    // at the exact moment the user taps "Approve", eliminating expiry entirely.

    try {
      const sig = await p.sendTransaction(tx, p.connection, { skipPreflight: true });

      // Confirm by polling signature status (no blockhash dependency).
      // Works regardless of which blockhash the wallet chose.
      await pollConfirmation(p.connection, sig, 90_000); // 90s timeout
      return sig;
    } catch (e: unknown) {
      const msg = ((e as Error)?.message ?? '').toLowerCase();
      const isRetryable =
        // RPC infra errors
        msg.includes('429')                      || msg.includes('rate limit')     ||
        msg.includes('failed to fetch')          || msg.includes('networkerror')   ||
        msg.includes('503')                      || msg.includes('502')            ||
        msg.includes('504')                      || msg.includes('522')            ||
        msg.includes('load failed')              ||                                   // Safari
        // Transaction-landing failures — blockhash expired, tx dropped, node lag
        msg.includes('blockhash')                || msg.includes('block hash')     ||
        msg.includes('expired')                  || msg.includes('not found')      ||
        msg.includes('not confirmed')            || msg.includes('timed out')      ||
        msg.includes('timeout')                  || msg.includes('check /streams') ||
        msg.includes('transaction simulation')   ||
        // Generic network noise
        msg.includes('network')                  || msg.includes('fetch');

      // Hard stops: user rejected or on-chain program error — don't retry
      const isHardStop =
        msg.includes('user rejected')            || msg.includes('user cancelled') ||
        msg.includes('user denied')              || msg.includes('transaction rejected') ||
        msg.includes('custom program error')     || msg.includes('anchor error')   ||
        msg.includes('insufficient funds')       || msg.includes('zeroa mount');

      if (!isHardStop && isRetryable && attempt < MAX_RETRIES - 1) {
        const backoff = Math.min(800 * (attempt + 1), 3_000);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Transaction failed after 10 attempts — please try again later');
}

/** Poll for transaction confirmation by signature (no blockhash dependency). */
async function pollConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs: number,
): Promise<void> {
  const start    = Date.now();
  const interval = 2_000; // poll every 2s

  while (Date.now() - start < timeoutMs) {
    try {
      const { value } = await connection.getSignatureStatuses([signature]);
      const status    = value[0];
      if (status) {
        if (status.err) throw new Error(`On-chain error: ${JSON.stringify(status.err)}`);
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          return;
        }
      }
    } catch (e) {
      // network error → keep polling
      const msg = ((e as Error)?.message ?? '').toLowerCase();
      if (!msg.includes('fetch') && !msg.includes('network') && !msg.includes('429')) throw e;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Transaction not confirmed after ${timeoutMs / 1000}s — check /streams for status`);
}

export interface WithdrawParams {
  connection:      Connection;
  beneficiary:     PublicKey;
  stream:          PublicKey;
  vault:           PublicKey;
  beneficiaryAta:  PublicKey;
  mint:            PublicKey;
  /** Pass SystemProgram.programId when required_tier == 0 (no gate). */
  proofCache:      PublicKey;
  sendTransaction: SendTx;
}

export async function withdraw(p: WithdrawParams): Promise<string> {
  const program = readonlyProgram(p.connection);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ix = await (program.methods as any)
    .withdraw()
    .accounts({
      beneficiary:    p.beneficiary,
      stream:         p.stream,
      vault:          p.vault,
      beneficiaryAta: p.beneficiaryAta,
      // Pass SystemProgram.programId when required_tier == 0 (no ProofCache gate).
      proofCache:     p.proofCache,
      tokenProgram:   TOKEN_PROGRAM_ID,
    })
    .instruction();

  const tx = new Transaction();

  // Auto-create beneficiary ATA if it doesn't exist — prevents "account not found" on first claim
  const ataCrIx = await ensureAtaIx(p.connection, p.beneficiary, p.beneficiary, p.mint);
  if (ataCrIx) tx.add(ataCrIx);

  tx.add(ix);
  tx.feePayer = p.beneficiary;
  // Use 'confirmed' not 'finalized' — finalized is ~13s behind tip, burning the validity window
  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight }, 'confirmed',
  );
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
  const program = readonlyProgram(p.connection);
  // IDL cancel accounts: authority, beneficiary, stream, vault,
  // authority_ata, beneficiary_ata, token_program, system_program.
  // Vested-but-unclaimed tokens → beneficiary_ata; unvested → authority_ata.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ix = await (program.methods as any)
    .cancel()
    .accounts({
      authority:      p.authority,
      beneficiary:    p.beneficiary,
      stream:         p.stream,
      vault:          p.vault,
      authorityAta:   p.authorityAta,
      beneficiaryAta: p.beneficiaryAta,
      tokenProgram:   TOKEN_PROGRAM_ID,
      systemProgram:  SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = p.authority;
  // Use 'confirmed' not 'finalized' — finalized is ~13s behind tip, burning the validity window
  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  const sig = await p.sendTransaction(tx, p.connection);
  await p.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight }, 'confirmed',
  );
  return sig;
}

/** Read a stream account (decoded). Returns null if not found. */
export async function fetchStream(connection: Connection, streamPda: PublicKey) {
  try {
    const program = readonlyProgram(connection);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (program.account as any).streamAccount.fetch(streamPda);
    return data as {
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
    };
  } catch {
    return null;
  }
}

/** Derive the ProofCache PDA for a (stream, player) pair. */
export function deriveProofCachePDA(stream: PublicKey, player: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('proof_cache'), stream.toBuffer(), player.toBuffer()],
    VESTING_PROGRAM_ID,
  );
}

/** Read a ProofCache account. Returns null if not found (player has no proof yet). */
export async function fetchProofCache(
  connection: Connection,
  stream:     PublicKey,
  player:     PublicKey,
) {
  try {
    const [pda] = deriveProofCachePDA(stream, player);
    const program = readonlyProgram(connection);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (program.account as any).proofCache.fetch(pda);
    return data as {
      schedule:        PublicKey; // the stream PDA this proof belongs to
      player:          PublicKey;
      cohortId:        number;
      tierReached:     number;
      lastProofTs:     BN;
      velocityStrikes: number;
      bump:            number;
    };
  } catch {
    return null;
  }
}

/**
 * Read the raw SPL token balance of a vault PDA.
 * Returns 0n if the vault account doesn't exist yet.
 */
export async function fetchVaultBalance(
  connection: Connection,
  vault:      PublicKey,
): Promise<bigint> {
  try {
    const info = await getAccount(connection, vault);
    return info.amount;
  } catch {
    return 0n;
  }
}

// ─── StreamAccount layout offsets (after 8-byte discriminator) ───────────────
// authority:        Pubkey  @  8   (32 bytes)
// beneficiary:      Pubkey  @ 40   (32 bytes)
// These offsets are used for getProgramAccounts memcmp filters.
const OFFSET_AUTHORITY    = 8;
const OFFSET_BENEFICIARY  = 40;

export interface StreamInfo {
  pubkey:          PublicKey;
  authority:       PublicKey;
  beneficiary:     PublicKey;
  mint:            PublicKey;
  streamId:        BN;
  amountTotal:     BN;
  amountWithdrawn: BN;
  startTs:         BN;
  cliffTs:         BN;
  endTs:           BN;
  cancelled:       boolean;
  requiredTier:    number;
  milestoneCount:  number;
  milestonesVerified: boolean[];
  milestonePct:    number[];
  velocityStrikes: number;
  lastActionTs:    BN;
  bump:            number;
}

/** Decode raw account data returned by getProgramAccounts. */
function decodeStream(pubkey: PublicKey, accountData: Buffer): StreamInfo | null {
  try {
    const program = readonlyProgram({ rpcEndpoint: 'x' } as unknown as Connection);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (program.account as any).streamAccount.coder.accounts.decode(
      'StreamAccount',
      accountData,
    );
    return { pubkey, ...d };
  } catch {
    return null;
  }
}

/**
 * Fetch ALL StreamAccount PDAs owned by the vesting program.
 * No filter — returns everything on devnet.
 * Useful for protocol-wide analytics.
 */
export async function getAllStreams(connection: Connection): Promise<StreamInfo[]> {
  const program = readonlyProgram(connection);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).streamAccount.all();
  return raw.map((r: { publicKey: PublicKey; account: Omit<StreamInfo, 'pubkey'> }) => ({
    pubkey: r.publicKey,
    ...r.account,
  }));
}

/**
 * Fetch all streams where the wallet is the AUTHORITY (creator).
 */
export async function getStreamsByAuthority(
  connection: Connection,
  authority:  PublicKey,
): Promise<StreamInfo[]> {
  const program = readonlyProgram(connection);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).streamAccount.all([
    { memcmp: { offset: OFFSET_AUTHORITY, bytes: authority.toBase58() } },
  ]);
  return raw.map((r: { publicKey: PublicKey; account: Omit<StreamInfo, 'pubkey'> }) => ({
    pubkey: r.publicKey,
    ...r.account,
  }));
}

/**
 * Fetch all streams where the wallet is the BENEFICIARY (recipient).
 */
export async function getStreamsByBeneficiary(
  connection: Connection,
  beneficiary: PublicKey,
): Promise<StreamInfo[]> {
  const program = readonlyProgram(connection);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (program.account as any).streamAccount.all([
    { memcmp: { offset: OFFSET_BENEFICIARY, bytes: beneficiary.toBase58() } },
  ]);
  return raw.map((r: { publicKey: PublicKey; account: Omit<StreamInfo, 'pubkey'> }) => ({
    pubkey: r.publicKey,
    ...r.account,
  }));
}

/**
 * Compute claimable (unlocked minus withdrawn) at a given unix timestamp.
 * Mirrors the Rust `unlocked_amount()` function exactly:
 *   - Returns 0 before cliff_ts
 *   - Linear from start_ts to end_ts (elapsed = now - start_ts, duration = end_ts - start_ts)
 *   - Returns amount_total when now >= end_ts
 */
export function computeUnlocked(stream: StreamInfo, nowSec: number): bigint {
  const now   = BigInt(nowSec);
  const cliff = BigInt(stream.cliffTs.toString());
  const start = BigInt(stream.startTs.toString());
  const end   = BigInt(stream.endTs.toString());
  const total = BigInt(stream.amountTotal.toString());
  const drawn = BigInt(stream.amountWithdrawn.toString());

  // Gate 1: cliff not reached → nothing unlocked
  if (now < cliff) return 0n;
  // Gate 2: before start (edge case) → nothing unlocked
  if (now < start) return 0n;
  // Gate 3: fully vested
  if (now >= end) {
    const available = total > drawn ? total - drawn : 0n;
    return available;
  }

  // Linear: elapsed / duration × total
  const duration = end > start ? end - start : 1n;
  const elapsed  = now - start;
  const unlocked = total * elapsed / duration;
  const available = unlocked > drawn ? unlocked - drawn : 0n;
  return available;
}

/**
 * Helper: prepend a createATA instruction if the recipient doesn't have one.
 * Caller adds the rest of the transaction on top.
 */
export async function ensureAtaIx(
  connection: Connection,
  payer:      PublicKey,
  owner:      PublicKey,
  mint:       PublicKey,
) {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    await getAccount(connection, ata);
    return null;
  } catch {
    return createAssociatedTokenAccountInstruction(payer, ata, owner, mint);
  }
}

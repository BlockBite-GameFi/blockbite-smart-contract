'use client';

import { useState } from 'react';
import {
  PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  getAssociatedTokenAddress, getAccount,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction, NATIVE_MINT,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createStream } from '@/lib/anchor/vesting-client';
import { USDC_MINT } from '@/lib/solana/config';

// ─── Token registry — devnet mint addresses ───────────────────────────────────
export const TOKEN_MINTS: Record<string, { mint: string; decimals: number }> = {
  BBT:  { mint: USDC_MINT.toBase58(), decimals: 6 },
  USDC: { mint: USDC_MINT.toBase58(), decimals: 6 },
  SOL:  { mint: NATIVE_MINT.toBase58(), decimals: 9 }, // wSOL — auto-wrapped
};

export type TxStatus = 'idle' | 'approving' | 'confirming' | 'done' | 'error';

export interface StreamCreateInput {
  beneficiary:   string;
  token:         string;
  amount:        string;
  startTs:       number;
  cliffTs:       number;
  endTs:         number;
  requiredTier?: 0 | 1 | 2;
}

export function useStreamCreate() {
  const { connection }                            = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txSig,    setTxSig]    = useState<string | null>(null);
  const [txErr,    setTxErr]    = useState<string | null>(null);

  const isSubmitting = txStatus === 'approving' || txStatus === 'confirming';

  const submit = async (p: StreamCreateInput): Promise<boolean> => {
    if (!publicKey || !connected) {
      setTxErr('Connect your wallet first');
      setTxStatus('error');
      return false;
    }

    let beneficiaryPk: PublicKey;
    try { beneficiaryPk = new PublicKey(p.beneficiary); }
    catch { setTxErr('Invalid beneficiary wallet address'); setTxStatus('error'); return false; }

    const tokenKey  = p.token.toUpperCase();
    const tokenInfo = TOKEN_MINTS[tokenKey];
    if (!tokenInfo) {
      setTxErr(`Unknown token "${p.token}". Use BBT, USDC, or SOL.`);
      setTxStatus('error');
      return false;
    }

    let mintPk: PublicKey;
    try { mintPk = new PublicKey(tokenInfo.mint); }
    catch { setTxErr('Invalid token mint address'); setTxStatus('error'); return false; }

    const rawAmount = BigInt(Math.round(Number(p.amount) * 10 ** tokenInfo.decimals));
    if (rawAmount <= 0n) { setTxErr('Amount must be greater than 0'); setTxStatus('error'); return false; }
    if (p.endTs <= p.startTs) { setTxErr('End date must be after start date'); setTxStatus('error'); return false; }

    // ── SOL: auto-wrap native SOL → wSOL ATA before stream creation ──────────
    if (tokenKey === 'SOL') {
      const lamportsNeeded = rawAmount + BigInt(10_000_000); // amount + 0.01 SOL buffer for fees
      const solBalance = await connection.getBalance(publicKey);
      if (BigInt(solBalance) < lamportsNeeded) {
        const have = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
        const need = (Number(lamportsNeeded) / LAMPORTS_PER_SOL).toFixed(4);
        setTxErr(`Insufficient SOL: wallet has ${have} SOL, need ${need} SOL (includes fee buffer). Get devnet SOL at faucet.solana.com`);
        setTxStatus('error');
        return false;
      }

      try {
        const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
        const wrapTx = new Transaction();

        // Create wSOL ATA if it doesn't exist
        try { await getAccount(connection, wsolAta); }
        catch {
          wrapTx.add(createAssociatedTokenAccountInstruction(
            publicKey, wsolAta, publicKey, NATIVE_MINT,
            TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
          ));
        }

        // Transfer native SOL into the wSOL ATA then sync
        wrapTx.add(
          SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: wsolAta, lamports: rawAmount }),
          createSyncNativeInstruction(wsolAta),
        );

        setTxStatus('approving');
        setTxErr(null);
        const wrapSig = await sendTransaction(wrapTx, connection);
        setTxStatus('confirming');
        await connection.confirmTransaction(wrapSig, 'confirmed');
      } catch (e: unknown) {
        setTxErr(`SOL wrap failed: ${(e as Error)?.message ?? 'unknown error'}`);
        setTxStatus('error');
        return false;
      }
    } else {
      // ── BBT/USDC: verify ATA balance ─────────────────────────────────────
      try {
        const ata  = await getAssociatedTokenAddress(mintPk, publicKey);
        const acct = await getAccount(connection, ata);
        if (acct.amount < rawAmount) {
          const have = (Number(acct.amount) / 10 ** tokenInfo.decimals).toLocaleString();
          const need = Number(p.amount).toLocaleString();
          setTxErr(`Insufficient balance: you have ${have} ${p.token}, need ${need}. Use "Get Test Tokens" button below.`);
          setTxStatus('error');
          return false;
        }
      } catch {
        setTxErr(`No ${p.token} token account found. Click "Get Test Tokens" to receive devnet ${p.token}.`);
        setTxStatus('error');
        return false;
      }
    }

    // ── Create the stream ──────────────────────────────────────────────────
    const streamId = BigInt(Date.now());
    setTxStatus('approving');
    setTxErr(null);
    setTxSig(null);

    try {
      const sig = await createStream({
        connection,
        authority:    publicKey,
        beneficiary:  beneficiaryPk,
        mint:         mintPk,
        streamId,
        amount:       rawAmount,
        startTs:      p.startTs,
        cliffTs:      p.cliffTs,
        endTs:        p.endTs,
        requiredTier: p.requiredTier ?? 0,
        sendTransaction: async (tx, conn) => {
          const s = await sendTransaction(tx, conn);
          setTxStatus('confirming');
          return s;
        },
      });
      setTxSig(sig);
      setTxStatus('done');
      return true;
    } catch (e: unknown) {
      setTxErr((e as Error)?.message ?? 'Transaction failed');
      setTxStatus('error');
      return false;
    }
  };

  const reset = () => { setTxStatus('idle'); setTxSig(null); setTxErr(null); };

  return { submit, txStatus, txSig, txErr, isSubmitting, reset };
}

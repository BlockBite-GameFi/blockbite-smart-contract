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
import { resolveMintDecimals } from './useWalletTokens';

export type TxStatus = 'idle' | 'approving' | 'confirming' | 'done' | 'error';

export interface StreamCreateInput {
  beneficiary:   string;   // base58 wallet
  mint:          string;   // SPL mint address OR 'SOL' for native SOL
  symbol:        string;   // display symbol (BBT, USDC, SOL, etc.)
  decimals?:     number;   // optional — resolved on-chain if omitted
  amount:        string;   // human-readable (e.g. "1000")
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
      setTxErr('Connect your wallet first'); setTxStatus('error'); return false;
    }

    let beneficiaryPk: PublicKey;
    try { beneficiaryPk = new PublicKey(p.beneficiary); }
    catch { setTxErr('Invalid recipient wallet address'); setTxStatus('error'); return false; }

    if (p.endTs <= p.startTs) {
      setTxErr('End date must be after start date'); setTxStatus('error'); return false;
    }

    // Treat both 'SOL' string AND the native WSOL mint address as native SOL wrapping flow
    const isNativeSol = p.mint === 'SOL' || p.mint === NATIVE_MINT.toBase58();
    const mintAddr    = NATIVE_MINT.toBase58() === p.mint ? p.mint : (isNativeSol ? NATIVE_MINT.toBase58() : p.mint);

    let mintPk: PublicKey;
    try { mintPk = new PublicKey(mintAddr); }
    catch { setTxErr('Invalid token mint address'); setTxStatus('error'); return false; }

    // Resolve decimals (from input or on-chain)
    const decimals = p.decimals ?? await resolveMintDecimals(connection, mintAddr);
    const rawAmount = BigInt(Math.round(Number(p.amount) * 10 ** decimals));
    if (rawAmount <= 0n) { setTxErr('Amount must be greater than 0'); setTxStatus('error'); return false; }

    // ── Native SOL path: check balance + auto-wrap to wSOL ───────────────────
    if (isNativeSol) {
      const lamportsNeeded = rawAmount + BigInt(10_000_000); // +0.01 SOL fee buffer
      const solBalance = await connection.getBalance(publicKey);

      if (BigInt(solBalance) < lamportsNeeded) {
        const have = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
        const need = (Number(lamportsNeeded) / LAMPORTS_PER_SOL).toFixed(4);
        setTxErr(
          `Insufficient SOL: wallet has ${have} SOL, need ${need} SOL.\n` +
          `Get devnet SOL: https://faucet.solana.com`
        );
        setTxStatus('error'); return false;
      }

      try {
        const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
        const wrapTx  = new Transaction();

        try { await getAccount(connection, wsolAta); }
        catch {
          wrapTx.add(createAssociatedTokenAccountInstruction(
            publicKey, wsolAta, publicKey, NATIVE_MINT,
            TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
          ));
        }
        wrapTx.add(
          SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: wsolAta, lamports: rawAmount }),
          createSyncNativeInstruction(wsolAta),
        );

        setTxStatus('approving'); setTxErr(null);
        const wrapSig = await sendTransaction(wrapTx, connection);
        setTxStatus('confirming');
        await connection.confirmTransaction(wrapSig, 'confirmed');
      } catch (e: unknown) {
        setTxErr(`SOL wrap failed: ${(e as Error)?.message ?? 'unknown'}`);
        setTxStatus('error'); return false;
      }
    } else {
      // ── SPL token path: verify ATA balance ─────────────────────────────────
      try {
        const ata  = await getAssociatedTokenAddress(mintPk, publicKey);
        const acct = await getAccount(connection, ata);
        if (acct.amount < rawAmount) {
          const have = (Number(acct.amount) / 10 ** decimals).toLocaleString();
          const need = Number(p.amount).toLocaleString();
          setTxErr(
            `Insufficient ${p.symbol}: wallet has ${have}, need ${need}.\n` +
            `Get devnet tokens via "Get Test Tokens" or fund via faucet.`
          );
          setTxStatus('error'); return false;
        }
      } catch {
        setTxErr(
          `No ${p.symbol} token account found — click "Get ${p.symbol}" in the token selector to fund your wallet, then retry.`
        );
        setTxStatus('error'); return false;
      }
    }

    // ── Create the stream ─────────────────────────────────────────────────────
    const streamId = BigInt(Date.now());
    setTxStatus('approving'); setTxErr(null); setTxSig(null);

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

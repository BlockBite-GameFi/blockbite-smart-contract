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
import { withRpcFallback } from '@/lib/solana/rpc-manager';

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
    const decimals = p.decimals ?? await resolveMintDecimals(mintAddr);
    const rawAmount = BigInt(Math.round(Number(p.amount) * 10 ** decimals));
    if (rawAmount <= 0n) { setTxErr('Amount must be greater than 0'); setTxStatus('error'); return false; }

    // ── Native SOL path: check balance + auto-wrap to wSOL ───────────────────
    if (isNativeSol) {
      const lamportsNeeded = rawAmount + BigInt(10_000_000); // +0.01 SOL fee buffer

      // Use server-side proxy for balance check — browser CORS blocks direct RPC
      let solBalance = 0;
      try {
        const res  = await fetch(`/api/solana/balance?wallet=${publicKey.toBase58()}`, { cache: 'no-store' });
        const data = await res.json() as { lamports?: number; sol?: number };
        solBalance = data.lamports ?? Math.round((data.sol ?? 0) * 1e9);
      } catch {
        // Proxy failed — try direct connection as last resort
        try { solBalance = await connection.getBalance(publicKey); } catch { solBalance = 0; }
      }

      if (BigInt(solBalance) < lamportsNeeded) {
        const have = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
        const need = (Number(lamportsNeeded) / LAMPORTS_PER_SOL).toFixed(4);
        setTxErr(
          `Insufficient SOL: wallet has ${have} SOL, need ${need} SOL. ` +
          `Use the "Airdrop 2 SOL" button in the token selector.`
        );
        setTxStatus('error'); return false;
      }

      try {
        const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
        const wrapTx  = new Transaction();

        // Check if wSOL ATA exists — CORS failure = ATA doesn't exist → create it
        let wsolExists = false;
        try {
          // First try server proxy
          const res = await fetch(`/api/solana/tokens?wallet=${publicKey.toBase58()}`, { cache: 'no-store' });
          const data = await res.json() as { accounts?: { mint: string }[] };
          wsolExists = (data.accounts ?? []).some(a => a.mint === NATIVE_MINT.toBase58());
        } catch {
          // Proxy failed — try direct (will fail on CORS too, caught below)
          try { await getAccount(connection, wsolAta); wsolExists = true; } catch { wsolExists = false; }
        }

        if (!wsolExists) {
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

        // KEY FIX: Do NOT set recentBlockhash.
        // Solflare fetches a FRESH blockhash at the exact moment the user signs.
        // Any pre-set blockhash will be stale by the time the user approves (10-60s).
        wrapTx.feePayer = publicKey;
        // wrapTx.recentBlockhash intentionally NOT set

        const wrapSig = await sendTransaction(wrapTx, connection, { skipPreflight: true });
        setTxStatus('confirming');

        // Poll for confirmation by signature (no blockhash dependency)
        const wrapDeadline = Date.now() + 90_000;
        while (Date.now() < wrapDeadline) {
          try {
            const { value } = await connection.getSignatureStatuses([wrapSig]);
            const st = value[0];
            if (st) {
              if (st.err) throw new Error(`wSOL wrap error: ${JSON.stringify(st.err)}`);
              if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') break;
            }
          } catch (pollErr: unknown) {
            const m = ((pollErr as Error)?.message ?? '').toLowerCase();
            if (!m.includes('fetch') && !m.includes('429')) throw pollErr;
          }
          await new Promise(r => setTimeout(r, 2_000));
        }
      } catch (e: unknown) {
        setTxErr(`SOL wrap failed: ${(e as Error)?.message ?? 'unknown'}`);
        setTxStatus('error'); return false;
      }
    } else {
      // ── SPL token path: verify ATA balance via server proxy ────────────────
      try {
        const res  = await fetch(`/api/solana/tokens?wallet=${publicKey.toBase58()}`, { cache: 'no-store' });
        const data = await res.json() as { accounts?: { mint: string; amount: string }[] };
        const acct = (data.accounts ?? []).find(a => a.mint === mintAddr);

        if (!acct) {
          setTxErr(
            `No ${p.symbol} token account on devnet. ` +
            `Use "Airdrop 2 SOL" then swap to ${p.symbol} via jup.ag`
          );
          setTxStatus('error'); return false;
        }

        const haveRaw = BigInt(acct.amount);
        if (haveRaw < rawAmount) {
          const have = (Number(haveRaw) / 10 ** decimals).toLocaleString();
          const need = Number(p.amount).toLocaleString();
          setTxErr(`Insufficient ${p.symbol}: have ${have}, need ${need}. Use faucet to get more.`);
          setTxStatus('error'); return false;
        }
      } catch {
        // Server proxy failed — skip balance check and try the tx (wallet will reject if insufficient)
        // Better UX than blocking with a false negative
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

'use client';

import { useState } from 'react';
import {
  PublicKey, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
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

    // ── Native SOL path: check balance + BUILD wrap instructions (no send) ────
    //    ROOT-CAUSE FIX (2026-06-04): the old code sent a SEPARATE wSOL-wrap
    //    transaction via wallet-adapter sendTransaction (single RPC, blockhash
    //    fetched from the lone useConnection node) BEFORE the create tx. On a
    //    flaky/CORS-blocked RPC that first send threw *before* Solflare could
    //    show its Approve prompt → "wallet never prompts", then the error got
    //    relabeled "Blockhash expired". FIX: do NOT send here. Collect the wrap
    //    instructions and fold them into the SAME create_stream transaction as
    //    preInstructions, so there is exactly ONE wallet prompt, routed through
    //    the robust signTransaction + withRpcFallback path below. Atomic: the
    //    wrap and the stream creation now succeed or fail together.
    const preIxs: TransactionInstruction[] = [];
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

      // Idempotent create (never errors if the wSOL ATA already exists) + fund +
      // sync. No existence probe needed → one less fragile network call.
      const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, publicKey);
      preIxs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey, wsolAta, publicKey, NATIVE_MINT,
          TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: wsolAta, lamports: rawAmount }),
        createSyncNativeInstruction(wsolAta),
      );
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
        // Fold the wSOL wrap (if native SOL) into the SAME tx → one prompt, atomic.
        preInstructions: preIxs,
        sendTransaction: async (tx, conn) => {
          // ── DEFAULT, MOST-RELIABLE PATH (2026-06-04 rewrite) ──────────────────
          // SYMPTOM we are fixing: the button reached "Approve in wallet…" but the
          // Solflare popup NEVER appeared. Cause: the old code awaited a 4-way
          // public-RPC race (withRpcFallback → getLatestBlockhash, 10s timeout
          // each) BEFORE ever calling the wallet. On a slow/429 devnet RPC that
          // await hung, so signTransaction was never reached → no prompt.
          //
          // FIX: get a blockhash FAST (short timeout), then hand the tx to the
          // wallet adapter's own sendTransaction. For Solflare this routes to its
          // native signAndSendTransaction — the wallet pops the Approve prompt
          // immediately and broadcasts via the wallet's OWN reliable RPC, instead
          // of us blocking on public RPC before the prompt.
          tx.feePayer = publicKey;

          // 1) Try the wallet's connection with a tight 4s cap — pre-setting the
          //    blockhash means the adapter won't do its own (un-timed) RPC wait.
          let haveHash = false;
          try {
            const r = await Promise.race([
              conn.getLatestBlockhash('confirmed'),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error('blockhash-timeout')), 4_000)),
            ]) as { blockhash: string; lastValidBlockHeight: number };
            tx.recentBlockhash      = r.blockhash;
            tx.lastValidBlockHeight = r.lastValidBlockHeight;
            haveHash = true;
          } catch { /* fall through to multi-RPC fallback */ }

          // 2) Last resort: the multi-RPC fallback (each endpoint self-times-out).
          if (!haveHash) {
            try {
              const r = await withRpcFallback(c => c.getLatestBlockhash('confirmed'));
              tx.recentBlockhash      = r.blockhash;
              tx.lastValidBlockHeight = r.lastValidBlockHeight;
              haveHash = true;
            } catch { /* leave unset — adapter fetches its own as a final fallback */ }
          }

          // 3) Prompt + broadcast through the wallet's native flow. maxRetries lets
          //    the wallet's RPC rebroadcast against drops (kills phantom "expired").
          const sig = await sendTransaction(tx, conn, { skipPreflight: true, maxRetries: 5 });
          setTxStatus('confirming');
          return sig;
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

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
import { withRpcFallback, sendRawToManyRpcs } from '@/lib/solana/rpc-manager';

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
  const { publicKey, sendTransaction, signTransaction, connected } = useWallet();

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
          // ── Preferred path: sign once → blast to 20+ RPCs simultaneously ──────
          // This eliminates "Transaction expired" by getting the tx on-chain fast
          // without requiring the user to approve again on each retry.
          if (signTransaction) {
            try {
              // ROOT-CAUSE FIX for "Transaction expired":
              // A blockhash is valid for only ~150 slots (~60-90s). The OLD code
              // fetched it with 'finalized' commitment — but a finalized blockhash
              // is ALREADY ~32 slots (~13s) behind the cluster tip the moment you
              // get it, so it burned ~1/5 of the validity window before the user
              // even saw the Approve prompt. Add 10-60s of human approval time and
              // the hash expires → "Transaction expired".
              //
              // FIX: fetch with 'confirmed' (newest usable hash = full window) from
              // a HEALTHY, low-latency node via withRpcFallback — the single
              // useConnection() RPC can itself lag behind the cluster, making the
              // hash even staler. signTransaction signs EXACTLY this hash (it never
              // refreshes), so we grab it as fresh as possible right before signing.
              const { blockhash, lastValidBlockHeight } =
                await withRpcFallback(c => c.getLatestBlockhash('confirmed'));
              tx.recentBlockhash      = blockhash;
              tx.lastValidBlockHeight = lastValidBlockHeight;
              tx.feePayer             = publicKey;

              // One wallet prompt — user approves here
              const signedTx = await signTransaction(tx);

              // SURFACE THE REAL ERROR: simulate before sending. With skipPreflight
              // the old code hid on-chain failures (bad accounts, insufficient
              // funds, program error) behind a generic "expired". Simulate once so
              // a genuine program error is reported instead of silently dropped.
              try {
                const sim = await withRpcFallback(c => c.simulateTransaction(signedTx));
                if (sim?.value?.err) {
                  const logs = (sim.value.logs ?? []).join('\n');
                  throw new Error(
                    `On-chain simulation failed: ${JSON.stringify(sim.value.err)}` +
                    (logs ? `\n${logs}` : ''),
                  );
                }
              } catch (simErr: unknown) {
                const sm = ((simErr as Error)?.message ?? '').toLowerCase();
                // Only abort on a real program/account error; ignore RPC noise and
                // let the durable sender try anyway.
                if (sm.includes('simulation failed') || sm.includes('custom program error') ||
                    sm.includes('insufficient')) {
                  throw simErr;
                }
              }

              const rawTx = signedTx.serialize();
              setTxStatus('confirming');

              // Durable send: rebroadcast to real nodes until confirmed or the
              // blockhash truly expires (uses lastValidBlockHeight for accuracy).
              const sig = await sendRawToManyRpcs(rawTx, lastValidBlockHeight);
              return sig;
            } catch (signErr: unknown) {
              // If user rejected, propagate immediately
              const m = ((signErr as Error)?.message ?? '').toLowerCase();
              if (m.includes('reject') || m.includes('cancel') || m.includes('denied')) throw signErr;
              // Signing/network error — fall through to standard sendTransaction
            }
          }

          // ── Fallback: standard wallet adapter sendTransaction (single RPC) ────
          const s = await sendTransaction(tx, conn, { skipPreflight: true });
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

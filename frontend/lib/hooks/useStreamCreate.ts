'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { createStream } from '@/lib/anchor/vesting-client';
import { USDC_MINT } from '@/lib/solana/config';

// ─── Token registry — devnet mint addresses ───────────────────────────────────
export const TOKEN_MINTS: Record<string, { mint: string; decimals: number }> = {
  BBT:  { mint: USDC_MINT.toBase58(), decimals: 6 }, // devnet mock — same mint
  USDC: { mint: USDC_MINT.toBase58(), decimals: 6 },
  SOL:  { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
};

export type TxStatus = 'idle' | 'approving' | 'confirming' | 'done' | 'error';

/** Input for a single createStream call. Timestamps are pre-computed unix seconds. */
export interface StreamCreateInput {
  beneficiary:   string;       // base58 wallet
  token:         string;       // token symbol: BBT | USDC | SOL
  amount:        string;       // human-readable amount (e.g. "1000")
  startTs:       number;       // unix seconds
  cliffTs:       number;       // unix seconds — same as startTs = no cliff
  endTs:         number;       // unix seconds — same as cliffTs = pure cliff
  requiredTier?: 0 | 1 | 2;   // 0 = no game gate
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

    // Validate beneficiary
    let beneficiaryPk: PublicKey;
    try { beneficiaryPk = new PublicKey(p.beneficiary); }
    catch { setTxErr('Invalid beneficiary wallet address'); setTxStatus('error'); return false; }

    // Resolve mint
    const tokenKey  = p.token.toUpperCase();
    const tokenInfo = TOKEN_MINTS[tokenKey];
    if (!tokenInfo) { setTxErr(`Unknown token "${p.token}". Use BBT, USDC, or SOL.`); setTxStatus('error'); return false; }

    let mintPk: PublicKey;
    try { mintPk = new PublicKey(tokenInfo.mint); }
    catch { setTxErr('Invalid token mint address'); setTxStatus('error'); return false; }

    const rawAmount = BigInt(Math.round(Number(p.amount) * 10 ** tokenInfo.decimals));
    if (rawAmount <= 0n) { setTxErr('Amount must be greater than 0'); setTxStatus('error'); return false; }

    if (p.endTs <= p.startTs) { setTxErr('End date must be after start date'); setTxStatus('error'); return false; }

    // Pre-flight: verify creator has enough tokens
    try {
      const ata = await getAssociatedTokenAddress(mintPk, publicKey);
      const acct = await getAccount(connection, ata);
      if (acct.amount < rawAmount) {
        const have = (Number(acct.amount) / 10 ** tokenInfo.decimals).toLocaleString();
        const need = Number(p.amount).toLocaleString();
        setTxErr(`Insufficient balance: you have ${have} ${p.token}, need ${need}`);
        setTxStatus('error');
        return false;
      }
    } catch {
      setTxErr(`No ${p.token} token account found — fund your wallet with ${p.token} first`);
      setTxStatus('error');
      return false;
    }

    // Unique stream ID — epoch ms fits safely in u64
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
        // Intercept sendTransaction to advance the loading stage
        sendTransaction: async (tx, conn) => {
          const s = await sendTransaction(tx, conn); // user approves → tx broadcast
          setTxStatus('confirming');                  // network is confirming
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

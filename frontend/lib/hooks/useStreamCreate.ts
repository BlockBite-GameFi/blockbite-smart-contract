'use client';

/**
 * useStreamCreate — Universal stream creator.
 * Supports ANY SPL token (custom mint, auto-fetch decimals).
 * Works on mainnet, devnet, testnet.
 */

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { createStream } from '@/lib/anchor/vesting-client';

export type TxStatus = 'idle' | 'approving' | 'confirming' | 'done' | 'error';

export interface StreamCreateInput {
  mintAddress: string;   // any SPL mint (custom or known)
  decimals:    number;   // fetched from chain or known registry
  symbol:      string;   // display symbol
  beneficiary: string;   // recipient wallet address
  amount:      string;   // human-readable
  startTs:     number;
  cliffTs:     number;   // 0 = no cliff
  endTs:       number;
  requiredTier?: 0 | 1 | 2;
}

export function useStreamCreate() {
  const { connection }                              = useConnection();
  const { publicKey, sendTransaction, connected }   = useWallet();

  const [txStatus,  setTxStatus]  = useState<TxStatus>('idle');
  const [txSig,     setTxSig]     = useState<string | null>(null);
  const [txErr,     setTxErr]     = useState<string | null>(null);

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

    if (beneficiaryPk.equals(publicKey)) {
      setTxErr('Recipient cannot be your own wallet');
      setTxStatus('error');
      return false;
    }

    // Validate mint
    let mintPk: PublicKey;
    try { mintPk = new PublicKey(p.mintAddress); }
    catch { setTxErr('Invalid token mint address'); setTxStatus('error'); return false; }

    // Amount
    const amountNum = parseFloat(p.amount);
    if (!p.amount || isNaN(amountNum) || amountNum <= 0) {
      setTxErr('Amount must be greater than 0');
      setTxStatus('error');
      return false;
    }
    if (p.endTs <= p.startTs) {
      setTxErr('End date must be after start date');
      setTxStatus('error');
      return false;
    }

    const rawAmount = BigInt(Math.round(amountNum * 10 ** p.decimals));

    // Pre-flight: verify creator token account exists and has enough balance
    try {
      const creatorTA = await getAssociatedTokenAddress(mintPk, publicKey);
      const acct = await getAccount(connection, creatorTA);
      if (acct.amount < rawAmount) {
        const have = (Number(acct.amount) / 10 ** p.decimals).toLocaleString();
        const need = amountNum.toLocaleString();
        setTxErr(`Insufficient balance: you have ${have} ${p.symbol}, need ${need}`);
        setTxStatus('error');
        return false;
      }
    } catch {
      setTxErr(`No ${p.symbol} token account found — fund your wallet with ${p.symbol} first`);
      setTxStatus('error');
      return false;
    }

    // Unique stream seed
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
      const msg = humanizeError(e);
      setTxErr(msg);
      setTxStatus('error');
      return false;
    }
  };

  const reset = () => { setTxStatus('idle'); setTxSig(null); setTxErr(null); };

  return { submit, txStatus, txSig, txErr, isSubmitting, reset };
}

function humanizeError(e: unknown): string {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes('user rejected') || msg.includes('user cancelled') || msg.includes('user denied'))
    return 'Transaction cancelled — you rejected the wallet prompt.';
  if (msg.includes('insufficient funds') || msg.includes('insufficient balance'))
    return 'Insufficient SOL for transaction fees. Get devnet SOL from faucet.';
  if (msg.includes('blockhash not found') || msg.includes('expired'))
    return 'Transaction expired — please try again.';
  if (msg.includes('0x1') || msg.includes('custom program error: 0x1'))
    return 'Insufficient token balance.';
  if (msg.includes('invalidamount') || msg.includes('6000'))
    return 'Amount must be greater than 0.';
  if (msg.includes('invalidtimestamp') || msg.includes('6001'))
    return 'Invalid dates — check start/end/cliff times.';
  return (e instanceof Error ? e.message : String(e)).slice(0, 160);
}

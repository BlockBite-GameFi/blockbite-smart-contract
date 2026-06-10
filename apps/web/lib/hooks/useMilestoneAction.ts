'use client';

import { useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import { RPC_URL } from '@/lib/solana/config';
import {
  submitProof,
  claimMilestone,
  verifyGame,
  deriveCampaignEscrowPDA,
  type SendTx,
} from '@/lib/anchor/campaign-client';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export type MilestoneActionStatus = 'idle' | 'submitting' | 'verifying' | 'claiming' | 'done' | 'error';

interface MilestoneActionResult {
  sig: string;
}

export function useMilestoneAction() {
  const [status, setStatus] = useState<MilestoneActionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MilestoneActionResult | null>(null);

  const submitProofAction = useCallback(async (
    recipient: PublicKey,
    milestonePDA: PublicKey,
    proofHash: Uint8Array,
    sendTransaction: SendTx,
    campaign: PublicKey = PublicKey.default,
    milestoneSeed: bigint = 0n,
  ) => {
    setStatus('submitting');
    setError(null);
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const sig = await submitProof({
        connection, recipient, campaign, milestonePDA, milestoneSeed, proofHash, sendTransaction,
      });
      setResult({ sig });
      setStatus('done');
      return sig;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
      throw e;
    }
  }, []);

  const verifyGameAction = useCallback(async (
    milestonePDA: PublicKey,
    gameProgram: PublicKey,
    sessionResultHash: Uint8Array,
    sendTransaction: SendTx,
    campaign: PublicKey = PublicKey.default,
    milestoneSeed: bigint = 0n,
  ) => {
    setStatus('verifying');
    setError(null);
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const sig = await verifyGame({
        connection, campaign, milestonePDA, gameProgram, milestoneSeed, sessionResultHash, sendTransaction,
      });
      setResult({ sig });
      setStatus('done');
      return sig;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
      throw e;
    }
  }, []);

  const claimMilestoneAction = useCallback(async (
    recipient: PublicKey,
    milestonePDA: PublicKey,
    campaignPDA: PublicKey,
    mint: PublicKey,
    milestoneSeed: bigint,
    campaignSeed: bigint,
    sendTransaction: SendTx,
  ) => {
    setStatus('claiming');
    setError(null);
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const [campaignEscrow] = deriveCampaignEscrowPDA(campaignPDA);
      const recipientTA = await getAssociatedTokenAddress(mint, recipient);

      const sig = await claimMilestone({
        connection,
        recipient,
        milestonePDA,
        campaignPDA,
        mint,
        campaignEscrow,
        recipientTA,
        milestoneSeed,
        campaignSeed,
        sendTransaction,
      });
      setResult({ sig });
      setStatus('done');
      return sig;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  return {
    status,
    error,
    result,
    submitProofAction,
    verifyGameAction,
    claimMilestoneAction,
    reset,
  };
}

'use client';

import { useState, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import { RPC_URL } from '@/lib/solana/config';
import {
  submitProof,
  verifyGame,
  type SendTx,
} from '@blockbite/clients';

export type CampaignVerificationStatus = 'none' | 'playing' | 'submitting_proof' | 'verifying' | 'verified' | 'failed';

export interface CampaignVerificationResult {
  verified: boolean;
  proofSig?: string;
  verifySig?: string;
  sessionResultHash: Uint8Array;
}

export function useCampaignGameVerification() {
  const [status, setStatus] = useState<CampaignVerificationStatus>('none');
  const [result, setResult] = useState<CampaignVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async (
    milestonePda: PublicKey,
    gameProgramId: PublicKey,
    level: number,
    score: number,
    recipient: PublicKey,
    sendTransaction: SendTx,
  ): Promise<CampaignVerificationResult> => {
    setStatus('submitting_proof');
    setError(null);

    try {
      const connection = new Connection(RPC_URL, 'confirmed');

      // Build session result hash from game data
      const sessionData = `${level}:${score}:${recipient.toBase58()}:${milestonePda.toBase58()}`;
      const encoder = new TextEncoder();
      const encoded = encoder.encode(sessionData);
      const sessionResultHash = new Uint8Array(32);
      sessionResultHash.set(encoded.slice(0, 32));

      // Step 1: Submit proof hash on-chain
      const proofSig = await submitProof({
        connection,
        recipient,
        milestonePDA: milestonePda,
        proofHash: sessionResultHash,
        sendTransaction,
      });

      // Step 2: Verify game on-chain
      setStatus('verifying');
      const verifySig = await verifyGame({
        connection,
        milestonePDA: milestonePda,
        gameProgram: gameProgramId,
        sessionResultHash,
        sendTransaction,
      });

      const res = {
        verified: true,
        proofSig,
        verifySig,
        sessionResultHash,
      };
      setResult(res);
      setStatus('verified');
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('failed');
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('none');
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, verify, reset };
}

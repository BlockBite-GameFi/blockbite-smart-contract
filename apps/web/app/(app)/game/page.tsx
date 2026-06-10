'use client';

import { useSearchParams } from 'next/navigation';
import GameCanvas from '@/components/game/GameCanvas';
import { useGameVerification } from '@/lib/hooks/useGameVerification';
import { useCampaignGameVerification } from '@/lib/hooks/useCampaignGameVerification';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useState, useCallback, useEffect } from 'react';

export default function GamePage() {
  const searchParams = useSearchParams();
  const { publicKey, sendTransaction } = useWallet();

  // Stream verification params (existing)
  const streamPda = searchParams.get('stream');
  const requiredLevel = parseInt(searchParams.get('level') || '1', 10);

  // Campaign verification params (new)
  const campaignId = searchParams.get('campaign');
  const milestonePda = searchParams.get('milestone');
  const gameProgramIdStr = searchParams.get('gameProgram');

  const { submitScore, status: streamStatus } = useGameVerification();
  const { verify, status: campaignStatus, error: campaignError } = useCampaignGameVerification();

  const [verified, setVerified] = useState(false);
  const [campaignVerified, setCampaignVerified] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);

  const isCampaignMode = !!(milestonePda && gameProgramIdStr && publicKey);

  // Stream verification handler (existing)
  const handleStreamVerified = useCallback(async (level: number, score: number) => {
    if (verified || !streamPda) return;
    const result = await submitScore(level, score, 'player', streamPda);
    if (result.verified) {
      setVerified(true);
    }
  }, [streamPda, submitScore, verified]);

  // Campaign verification handler (new)
  const handleCampaignVerified = useCallback(async (level: number, score: number) => {
    if (campaignVerified || !milestonePda || !gameProgramIdStr || !publicKey || autoTriggered) return;

    try {
      const milestonePk = new PublicKey(milestonePda);
      const gameProgramPk = new PublicKey(gameProgramIdStr);

      await verify(
        milestonePk,
        gameProgramPk,
        level,
        score,
        publicKey,
        sendTransaction,
      );
      setCampaignVerified(true);
    } catch {
      // Error handled by hook
    }
  }, [milestonePda, gameProgramIdStr, publicKey, sendTransaction, verify, campaignVerified, autoTriggered]);

  // Auto-trigger campaign verification when game completes
  useEffect(() => {
    if (!isCampaignMode || !publicKey || autoTriggered) return;

    // Listen for game completion via custom event
    const handleGameComplete = (e: Event) => {
      if (autoTriggered) return;
      setAutoTriggered(true);
      const detail = (e as CustomEvent).detail as { level: number; score: number };
      handleCampaignVerified(detail.level, detail.score);
    };

    window.addEventListener('blockbite-game-complete', handleGameComplete);
    return () => window.removeEventListener('blockbite-game-complete', handleGameComplete);
  }, [isCampaignMode, publicKey, autoTriggered, handleCampaignVerified]);

  const handleGameVerified = useCallback((level: number, score: number) => {
    if (isCampaignMode) {
      // Dispatch custom event for auto-trigger
      window.dispatchEvent(new CustomEvent('blockbite-game-complete', {
        detail: { level, score },
      }));
    } else {
      handleStreamVerified(level, score);
    }
  }, [isCampaignMode, handleStreamVerified]);

  return (
    <GameCanvas
      initialLevel={requiredLevel}
      verificationContext={
        (streamPda || isCampaignMode)
          ? {
              streamPda: streamPda || milestonePda || '',
              requiredLevel,
              onVerified: handleGameVerified,
            }
          : undefined
      }
    />
  );
}

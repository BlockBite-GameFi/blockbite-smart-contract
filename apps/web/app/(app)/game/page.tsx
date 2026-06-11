'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import GameCanvas from '@/components/game/GameCanvas';
import { useGameVerification } from '@/lib/hooks/useGameVerification';
import { useCampaignGameVerification } from '@/lib/hooks/useCampaignGameVerification';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useState, useCallback, useEffect } from 'react';

function GamePageContent() {
  const searchParams = useSearchParams();
  const { publicKey, sendTransaction } = useWallet();

  // Stream verification params (existing)
  const streamPda = searchParams.get('stream');
  const requiredLevel = parseInt(searchParams.get('level') || '1', 10);

  // Campaign verification params (new)
  const milestonePda     = searchParams.get('milestone');
  const gameProgramIdStr = searchParams.get('gameProgram');
  const campaignPdaStr   = searchParams.get('campaign');
  const milestoneSeedStr = searchParams.get('milestoneSeed');

  const { submitScore } = useGameVerification();
  const { verify, status: verifyStatus, error: verifyError } = useCampaignGameVerification();

  const [verified, setVerified] = useState(false);
  const [campaignVerified, setCampaignVerified] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);

  const isCampaignMode = !!(milestonePda && gameProgramIdStr && campaignPdaStr && publicKey);

  // Stream verification handler
  const handleStreamVerified = useCallback(async (level: number, score: number) => {
    if (verified || !streamPda) return;
    const result = await submitScore(level, score, 'player', streamPda);
    if (result.verified) {
      setVerified(true);
    }
  }, [streamPda, submitScore, verified]);

  // Campaign verification handler
  const handleCampaignVerified = useCallback(async (level: number, score: number) => {
    if (campaignVerified || !milestonePda || !gameProgramIdStr || !campaignPdaStr || !publicKey || autoTriggered) return;

    try {
      const milestonePk   = new PublicKey(milestonePda);
      const gameProgramPk = new PublicKey(gameProgramIdStr);
      const campaignPk    = new PublicKey(campaignPdaStr);
      const mSeed         = milestoneSeedStr ? BigInt(milestoneSeedStr) : 0n;

      await verify(milestonePk, gameProgramPk, level, score, publicKey, sendTransaction, campaignPk, mSeed);
      setCampaignVerified(true);
    } catch {
      // Error handled by hook
    }
  }, [milestonePda, gameProgramIdStr, campaignPdaStr, milestoneSeedStr, publicKey, sendTransaction, verify, campaignVerified, autoTriggered]);

  // Auto-trigger campaign verification when game completes
  useEffect(() => {
    if (!isCampaignMode || !publicKey || autoTriggered) return;

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
      window.dispatchEvent(new CustomEvent('blockbite-game-complete', { detail: { level, score } }));
    } else {
      handleStreamVerified(level, score);
    }
  }, [isCampaignMode, handleStreamVerified]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Campaign verification status banner */}
      {isCampaignMode && verifyStatus === 'verifying' && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, padding: '10px 22px', borderRadius: 10,
          background: 'rgba(0,194,255,0.15)', border: '1px solid rgba(0,194,255,0.4)',
          color: '#00C2FF', fontSize: 13, fontWeight: 700,
        }}>
          ◌ Submitting verification on-chain…
        </div>
      )}
      {isCampaignMode && verifyStatus === 'verified' && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, padding: '10px 22px', borderRadius: 10,
          background: 'rgba(20,241,149,0.15)', border: '1px solid rgba(20,241,149,0.4)',
          color: '#14F195', fontSize: 13, fontWeight: 700,
        }}>
          ✓ Milestone verified! Go back to claim your tokens.
        </div>
      )}
      {isCampaignMode && verifyStatus === 'failed' && verifyError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, padding: '10px 22px', borderRadius: 10,
          background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.4)',
          color: '#FF3366', fontSize: 13, fontWeight: 700, maxWidth: 400, textAlign: 'center',
        }}>
          ✗ Verification failed: {verifyError}
        </div>
      )}
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
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense>
      <GamePageContent />
    </Suspense>
  );
}

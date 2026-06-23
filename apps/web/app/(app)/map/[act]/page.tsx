'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { MapScreen, type Layout } from '@/lib/components/MapScreen';
import { BIOMES } from '@/lib/game/biomes';
import { getPlayerProgress } from '@/lib/api/progress';

function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>('desktop');
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setLayout(w >= 900 ? 'desktop' : w >= 600 ? 'tablet' : 'mobile');
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return layout;
}

function MapActPageContent() {
  const { act } = useParams<{ act: string }>();
  const router = useRouter();
  const layout = useLayout();
  const { publicKey } = useWallet();
  const searchParams = useSearchParams();

  // Campaign-mode params (set by /campaigns/[id] when gameGate is on)
  const maxLevelParam  = searchParams.get('maxLevel');
  const campaignId     = searchParams.get('campaignId') ?? undefined;
  const maxLevel       = maxLevelParam ? Math.max(1, Math.min(50, parseInt(maxLevelParam, 10))) : undefined;

  const actNum = Math.max(1, Math.min(8, parseInt(act ?? '1', 10)));
  const biome = BIOMES[actNum - 1];
  const [currentLevel, setCurrentLevel] = useState(biome.range[0]);

  useEffect(() => {
    const walletAddr = publicKey?.toBase58() ?? '';
    getPlayerProgress(walletAddr).then(p => {
      const capEnd = maxLevel != null ? biome.range[0] + maxLevel - 1 : biome.range[1];
      const clamped = Math.max(biome.range[0], Math.min(capEnd, p.currentLevel));
      setCurrentLevel(clamped);
    });
  }, [biome, publicKey, maxLevel]);

  return (
    <>
      <MapScreen
        biome={biome}
        currentLevel={currentLevel}
        layout={layout}
        onEnterLevel={(lvl) => router.push(`/play/${lvl}`)}
        walletAddress={publicKey?.toBase58()}
        topOffset={64}
        maxLevel={maxLevel}
        campaignId={campaignId}
      />
    </>
  );
}

export default function MapActPage() {
  return (
    <Suspense>
      <MapActPageContent />
    </Suspense>
  );
}

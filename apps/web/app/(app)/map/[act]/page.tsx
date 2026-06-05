'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { MapScreen, type Layout } from '@/lib/components/MapScreen';
import { BIOMES } from '@/lib/game/biomes';
import { getPlayerProgress } from '@/lib/api/progress';

function useLayout(): Layout {
  // SSR has no window — default to 'desktop' so the initial HTML stream is
  // shaped for the majority of visitors (Next.js dashboards report ~85%
  // desktop on this app). Mobile users see a brief flash of desktop layout
  // then get the correct one once `compute()` runs in the useEffect below.
  //
  // Previously defaulted to 'mobile', which gave Vercel SSR a column layout
  // with TopHeader at top and the map below — then hydration mutated the
  // outer flex to row, DesktopRail appeared, and the SVG re-rendered. Some
  // browsers ended up stuck mid-hydration with ActSelector pinned at the
  // vertical center of the viewport and the map invisible (issue captured
  // in production screenshot 2026-05-16). Defaulting to desktop sidesteps
  // the mismatch entirely.
  // Breakpoints lowered 2026-05-16: a production user reported the mobile
  // TopHeader showing on a full 1920px desktop because their browser zoom
  // was >200%, shrinking window.innerWidth below the old 1280 cutoff. New
  // thresholds: 900+ desktop, 600-899 tablet, <600 mobile.
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

export default function MapActPage() {
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

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** /game → /map (no intermediate info page needed) */
export default function GamePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/map'); }, [router]);
  return null;
}

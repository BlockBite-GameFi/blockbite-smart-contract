'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /campaigns → /campaigns/create (future: list existing campaigns)
export default function CampaignsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/campaigns/create'); }, [router]);
  return null;
}

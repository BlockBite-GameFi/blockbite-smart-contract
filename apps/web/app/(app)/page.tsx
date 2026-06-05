'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AppPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/');
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <p className="text-[15px] text-[#8b92a5]">Redirecting to homepage...</p>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import '../styles/globals.css';
import './globals.css';
import AppWalletProvider from "@/components/AppWalletProvider";
import { AppProvider } from '@/lib/useApp';
import { Analytics } from '@vercel/analytics/next';
import { PageTracker } from '@/components/PageTracker';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://blockbite.vercel.app';

// app/opengraph-image.png + app/twitter-image.png are static PNG files.
// Next.js App Router auto-serves them and injects correct absolute URLs.
// No Edge runtime, no cold start — Twitter/X bots get the image instantly.
export const metadata: Metadata = {
  title: 'BlockBite TDP — Token Distribution Protocol on Solana',
  description: 'Stop distributing tokens blindly. Programmable cliff, linear, and milestone vesting with gamified anti-bot verification. 100% on-chain on Solana.',
  keywords: ['BlockBite', 'TDP', 'Token Distribution Protocol', 'Vesting', 'Solana', 'Web3', 'Cliff', 'Milestone', 'Streaming', 'Anti-bot'],
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: 'BlockBite TDP — Token Distribution Protocol',
    description: 'Stop distributing tokens blindly. Cliff, linear, and milestone vesting with gamified anti-bot verification. 100% on-chain on Solana.',
    type: 'website',
    url: APP_URL,
    siteName: 'BlockBite TDP',
    // Next.js auto-resolves opengraph-image.png → absolute URL via metadataBase
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BlockBite TDP — Token Distribution Protocol',
    description: 'Stop distributing tokens blindly. Programmable vesting streams with gamified anti-bot verification. Anti-dump by default. 100% on-chain.',
    site: '@BlockBite_Sol',
    creator: '@BlockBite_Sol',
    // Next.js auto-resolves twitter-image.png → absolute URL via metadataBase
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700;800;900&family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
        {/* favicon is auto-injected from app/icon.png by Next.js Metadata Files convention */}
      </head>
      <body style={{ fontFamily: "'Montserrat', 'Nunito', 'DM Sans', system-ui, sans-serif" }}>
        <AppProvider>
          <AppWalletProvider>
            {children}
          </AppWalletProvider>
        </AppProvider>
        <Analytics />
        <PageTracker />
      </body>
    </html>
  );
}

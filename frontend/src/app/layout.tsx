import type { Metadata } from 'next';
import './globals.css';
import SolanaWalletProvider from '@/components/WalletProvider';

export const metadata: Metadata = {
  title: 'BlockBite TDP — Token Distribution Protocol',
  description:
    'Programmable token vesting and distribution infrastructure for Solana. ' +
    'Cliff, milestone, and linear vesting enforced by audited smart contracts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body style={{ height: '100%', margin: 0, padding: 0 }}>
        <SolanaWalletProvider>{children}</SolanaWalletProvider>
      </body>
    </html>
  );
}

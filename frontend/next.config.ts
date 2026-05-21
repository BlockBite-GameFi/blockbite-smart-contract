import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile wallet-adapter-react-ui so Next.js processes its CSS/ESM correctly
  transpilePackages: ['@solana/wallet-adapter-react-ui'],

  // Turbopack is enabled by default in Next.js 16.
  // An empty `turbopack` key tells Next.js we're aware of Turbopack
  // and suppresses the "webpack config without turbopack config" warning.
  turbopack: {},
};

export default nextConfig;

/**
 * Next.js App Router OG image — served at /opengraph-image
 * Uses next/og (Satori) which generates Twitter-compatible PNG every time.
 * Edge runtime = <50ms response, no cold start.
 */
import { ImageResponse } from 'next/og';

export const runtime     = 'edge';
export const alt         = 'BlockBite TDP — Token Distribution Protocol on Solana';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

const LOGO = 'https://blockbite.vercel.app/logo.png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200, height: 630,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#03000A',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Purple glow — top-left */}
        <div style={{
          position: 'absolute', top: -140, left: -100,
          width: 560, height: 560, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(153,69,255,0.22) 0%, transparent 68%)',
          display: 'flex',
        }} />

        {/* Green glow — bottom-right */}
        <div style={{
          position: 'absolute', bottom: -100, right: -80,
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20,241,149,0.15) 0%, transparent 68%)',
          display: 'flex',
        }} />

        {/* Top gradient bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg,#9945FF,#14F195,#9945FF)',
          display: 'flex',
        }} />

        {/* Content */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 0,
          position: 'relative', zIndex: 2,
        }}>
          {/* Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO}
            width={108} height={108}
            style={{ borderRadius: 22, marginBottom: 28 }}
          />

          {/* Kicker badge */}
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '7px 22px', borderRadius: 999, marginBottom: 22,
            border: '1px solid rgba(153,69,255,0.40)',
            background: 'rgba(153,69,255,0.12)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: '#9945FF' }}>
              POWERED BY SOLANA
            </span>
          </div>

          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 78, fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>
              BlockBite
            </span>
            <span style={{ fontSize: 46, fontWeight: 800, color: '#14F195', letterSpacing: '-0.01em', lineHeight: 1 }}>
              TDP
            </span>
          </div>

          {/* Subtitle */}
          <div style={{ fontSize: 24, fontWeight: 400, color: 'rgba(200,196,220,0.85)', marginBottom: 40, letterSpacing: '0.01em' }}>
            Token Distribution Protocol
          </div>

          {/* Feature pills */}
          <div style={{ display: 'flex', gap: 12 }}>
            {['Linear Vesting', 'Cliff Schedule', 'Milestone Unlock', 'Anti-Bot Gate'].map(tag => (
              <div key={tag} style={{
                display: 'flex', padding: '9px 20px', borderRadius: 999,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(153,69,255,0.30)',
                fontSize: 13, fontWeight: 600, color: 'rgba(200,196,220,0.80)',
              }}>
                {tag}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 52px',
          borderTop: '1px solid rgba(153,69,255,0.16)',
          background: 'rgba(3,0,10,0.70)',
        }}>
          <span style={{ fontSize: 14, color: 'rgba(200,196,220,0.50)', fontWeight: 500 }}>
            blockbite.vercel.app
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#14F195', display: 'flex' }} />
            <span style={{ fontSize: 14, color: 'rgba(200,196,220,0.50)', fontWeight: 500 }}>
              Live on Solana Devnet
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

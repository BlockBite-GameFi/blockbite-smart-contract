/**
 * Dynamic OG image for Twitter/X + Open Graph cards.
 * Served at /opengraph-image — auto-detected by Next.js metadata.
 *
 * Design: BlockBite brand — dark void background, Solana purple/green
 * gradient accents, logo, tagline. 1200×630 (Twitter large card standard).
 */
import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs'; // needs fs for logo read

export const alt = 'BlockBite TDP — Token Distribution Protocol on Solana';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // Load logo as base64 so it embeds into the image
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoB64  = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          // Deep void background matching site theme
          background: 'linear-gradient(145deg, #03000A 0%, #0A0714 45%, #0F0A1E 100%)',
          fontFamily: "'Montserrat', 'Nunito', system-ui, sans-serif",
        }}
      >
        {/* ── Ambient glow blobs ── */}
        <div style={{
          position: 'absolute', top: -120, left: -80,
          width: 520, height: 520, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(153,69,255,0.18) 0%, transparent 70%)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -100, right: -60,
          width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20,241,149,0.12) 0%, transparent 70%)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '20%',
          width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(153,69,255,0.10) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* ── Subtle grid lines ── */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(rgba(153,69,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(153,69,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          display: 'flex',
        }} />

        {/* ── Top accent border ── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #9945FF, #14F195, #9945FF)',
          display: 'flex',
        }} />

        {/* ── Main content ── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
          position: 'relative',
          zIndex: 2,
          padding: '0 80px',
        }}>
          {/* Logo */}
          <img
            src={logoB64}
            width={100}
            height={100}
            style={{ marginBottom: 28, borderRadius: 20 }}
          />

          {/* Kicker badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            padding: '6px 18px',
            borderRadius: 999,
            border: '1px solid rgba(153,69,255,0.35)',
            background: 'rgba(153,69,255,0.10)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: '#9945FF', textTransform: 'uppercase' }}>
              POWERED BY SOLANA
            </span>
          </div>

          {/* Main title */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            marginBottom: 16,
          }}>
            <span style={{
              fontSize: 72,
              fontWeight: 900,
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>
              BlockBite
            </span>
            <span style={{
              fontSize: 42,
              fontWeight: 700,
              background: 'linear-gradient(90deg, #9945FF, #14F195)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}>
              TDP
            </span>
          </div>

          {/* Subtitle */}
          <div style={{
            fontSize: 24,
            fontWeight: 500,
            color: 'rgba(160,154,191,0.90)',
            marginBottom: 36,
            letterSpacing: '0.01em',
            textAlign: 'center',
          }}>
            Token Distribution Protocol
          </div>

          {/* Feature pills row */}
          <div style={{ display: 'flex', gap: 12 }}>
            {['Linear Vesting', 'Cliff Schedule', 'Milestone Unlock', 'Anti-Bot Gate'].map(tag => (
              <div key={tag} style={{
                padding: '8px 20px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(153,69,255,0.25)',
                fontSize: 13,
                fontWeight: 600,
                color: 'rgba(160,154,191,0.85)',
                display: 'flex',
              }}>
                {tag}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 48px',
          borderTop: '1px solid rgba(153,69,255,0.15)',
          background: 'rgba(3,0,10,0.60)',
        }}>
          <span style={{ fontSize: 13, color: 'rgba(160,154,191,0.60)', fontWeight: 500 }}>
            blockbite.vercel.app
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#14F195',
              display: 'flex',
            }} />
            <span style={{ fontSize: 13, color: 'rgba(160,154,191,0.60)', fontWeight: 500 }}>
              Live on Solana Devnet
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

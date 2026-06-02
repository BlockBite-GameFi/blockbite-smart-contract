import { ImageResponse } from 'next/og';

export const runtime     = 'edge';
export const alt         = 'BlockBite TDP';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
          gap: 0,
        }}
      >
        {/* Purple glow */}
        <div style={{
          position: 'absolute', top: -180, left: -120,
          width: 620, height: 620, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(153,69,255,0.20) 0%, transparent 65%)',
          display: 'flex',
        }} />
        {/* Green glow */}
        <div style={{
          position: 'absolute', bottom: -140, right: -100,
          width: 560, height: 560, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20,241,149,0.13) 0%, transparent 65%)',
          display: 'flex',
        }} />
        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg,#9945FF,#14F195,#9945FF)',
          display: 'flex',
        }} />

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://blockbite.vercel.app/logo.png"
          width={160} height={160}
          style={{ borderRadius: 32, marginBottom: 36 }}
        />

        {/* BlockBite */}
        <div style={{
          fontSize: 96, fontWeight: 900, color: '#FFFFFF',
          letterSpacing: '-0.03em', lineHeight: 1,
          marginBottom: 16,
        }}>
          BlockBite
        </div>

        {/* Tagline */}
        <div style={{
          fontSize: 26, fontWeight: 400,
          color: 'rgba(200,196,220,0.70)',
          letterSpacing: '0.01em',
        }}>
          Token Distribution Protocol
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

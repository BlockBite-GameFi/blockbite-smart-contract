import { ImageResponse } from 'next/og';

export const runtime     = 'edge';
export const alt         = 'BlockBite TDP';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // Load font — required by Satori/next/og to render text
  // Without this, all text renders as empty grey rectangles
  const fontRes = await fetch(
    'https://fonts.gstatic.com/s/montserrat/v26/JTUSjIg1_i6t8kCHKm459WlhyyTh89Y.woff2'
  );
  const fontBold = await fontRes.arrayBuffer();

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
          fontFamily: 'Montserrat',
        }}
      >
        {/* Purple glow */}
        <div style={{
          position: 'absolute', top: -180, left: -120,
          width: 620, height: 620, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(153,69,255,0.22) 0%, transparent 65%)',
          display: 'flex',
        }} />
        {/* Green glow */}
        <div style={{
          position: 'absolute', bottom: -140, right: -100,
          width: 560, height: 560, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20,241,149,0.14) 0%, transparent 65%)',
          display: 'flex',
        }} />
        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 5,
          background: 'linear-gradient(90deg,#9945FF,#14F195,#9945FF)',
          display: 'flex',
        }} />

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://blockbite.vercel.app/logo.png"
          width={150} height={150}
          style={{ borderRadius: 30, marginBottom: 32 }}
        />

        {/* BlockBite — big bold text */}
        <div style={{
          display: 'flex',
          fontSize: 100,
          fontWeight: 900,
          color: '#FFFFFF',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          marginBottom: 18,
          fontFamily: 'Montserrat',
        }}>
          BlockBite
        </div>

        {/* Subtitle */}
        <div style={{
          display: 'flex',
          fontSize: 26,
          fontWeight: 400,
          color: 'rgba(200,196,220,0.65)',
          letterSpacing: '0.02em',
          fontFamily: 'Montserrat',
        }}>
          Token Distribution Protocol
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Montserrat',
          data: fontBold,
          style: 'normal',
          weight: 700,
        },
      ],
    },
  );
}

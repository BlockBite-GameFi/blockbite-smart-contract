import { ImageResponse } from 'next/og';

export const runtime     = 'edge';
export const alt         = 'BlockBite TDP';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // Font from our own CDN — never fails
  // Buffer is NOT available in Edge runtime, so font must be fetched as ArrayBuffer only
  const fontData = await fetch(
    'https://blockbite.vercel.app/montserrat-900.woff2'
  ).then(r => r.arrayBuffer());

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
        {/* Purple glow top-left */}
        <div style={{
          position: 'absolute', top: -180, left: -120,
          width: 640, height: 640, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(153,69,255,0.22) 0%, transparent 65%)',
          display: 'flex',
        }} />
        {/* Green glow bottom-right */}
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

        {/* Logo — Satori fetches img src URLs internally */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://blockbite.vercel.app/logo.png"
          width={148}
          height={148}
          style={{ borderRadius: 28, marginBottom: 30 }}
        />

        {/* BlockBite — 100px Montserrat 900, white */}
        <div style={{
          display: 'flex',
          fontSize: 100,
          fontWeight: 900,
          color: '#FFFFFF',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          marginBottom: 20,
          fontFamily: 'Montserrat',
        }}>
          BlockBite
        </div>

        {/* Token Distribution Protocol */}
        <div style={{
          display: 'flex',
          fontSize: 26,
          fontWeight: 700,
          color: 'rgba(200,196,220,0.60)',
          letterSpacing: '0.04em',
          fontFamily: 'Montserrat',
        }}>
          Token Distribution Protocol
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{
        name: 'Montserrat',
        data: fontData,
        style: 'normal',
        weight: 900,
      }],
    },
  );
}

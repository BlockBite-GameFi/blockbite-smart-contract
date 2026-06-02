import { ImageResponse } from 'next/og';

export const runtime     = 'edge';
export const alt         = 'BlockBite TDP';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // Font served from our own CDN — no external dependency, never fails
  const [fontData, logoData] = await Promise.all([
    fetch('https://blockbite.vercel.app/montserrat-900.woff2').then(r => r.arrayBuffer()),
    fetch('https://blockbite.vercel.app/logo.png').then(r => r.arrayBuffer()),
  ]);

  // Convert logo to base64 data URL for img tag
  const logoB64 = `data:image/png;base64,${Buffer.from(logoData).toString('base64')}`;

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
          width: 640, height: 640, borderRadius: '50%',
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
        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 5,
          background: 'linear-gradient(90deg,#9945FF,#14F195,#9945FF)',
          display: 'flex',
        }} />

        {/* Logo — loaded as base64 to avoid img fetch issues */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoB64} width={150} height={150} style={{ borderRadius: 30, marginBottom: 32 }} />

        {/* BlockBite text */}
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
          fontWeight: 700,
          color: 'rgba(200,196,220,0.65)',
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

/**
 * /api/og — OG image generation via Next.js API route (nodejs runtime).
 * Avoids the Edge runtime limitations and Vercel CDN immutable-cache poisoning
 * that plagued /opengraph-image (which cached an empty 200 response for 1 year).
 *
 * nodejs runtime: Buffer + fs.readFileSync are available, no 1MB size limit.
 */
import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

// nodejs runtime — full Node.js API available
export const runtime = 'nodejs';

// Load font from public/ at module initialisation (cold start, not per-request)
const FONT_DATA: ArrayBuffer = (() => {
  const buf = readFileSync(path.join(process.cwd(), 'public', 'montserrat-900.woff2'));
  // Convert Buffer to ArrayBuffer (required by ImageResponse fonts API)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
})();

const LOGO_DATA: string = (() => {
  const buf = readFileSync(path.join(process.cwd(), 'public', 'logo.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
})();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
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

        {/* BlockBite logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_DATA}
          width={148} height={148}
          style={{ borderRadius: 28, marginBottom: 30 }}
        />

        {/* BlockBite text */}
        <div style={{
          display: 'flex', fontSize: 100, fontWeight: 900, color: '#FFFFFF',
          letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 20,
          fontFamily: 'Montserrat',
        }}>
          BlockBite
        </div>

        {/* Subtitle */}
        <div style={{
          display: 'flex', fontSize: 26, fontWeight: 700,
          color: 'rgba(200,196,220,0.60)', letterSpacing: '0.04em',
          fontFamily: 'Montserrat',
        }}>
          Token Distribution Protocol
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Montserrat', data: FONT_DATA, style: 'normal', weight: 900 }],
      headers: {
        // Short cache — lets Twitter re-fetch after fixes without 1-year poison
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Content-Type': 'image/png',
      },
    },
  );
}

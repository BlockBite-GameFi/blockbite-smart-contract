import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  try {
    return new ImageResponse(
      (
        <div style={{
          width: 1200, height: 630,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#03000A',
        }}>
          <span style={{ color: '#FFFFFF', fontSize: 80, fontWeight: 900 }}>
            BlockBite
          </span>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`OG Error: ${msg}`, {
      status: 500, headers: { 'Content-Type': 'text/plain' },
    });
  }
}

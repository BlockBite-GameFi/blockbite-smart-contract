import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  try {
    // Load co-located files — no self-HTTP fetch, works reliably on Vercel edge
    const [fontData, logoData] = await Promise.all([
      fetch(new URL('./montserrat-900.woff2', import.meta.url)).then(r => r.arrayBuffer()),
      fetch(new URL('./logo.png', import.meta.url)).then(r => r.arrayBuffer()),
    ]);

    const logoBytes = new Uint8Array(logoData);
    let bin = '';
    for (let i = 0; i < logoBytes.length; i++) bin += String.fromCharCode(logoBytes[i]);
    const logoSrc = `data:image/png;base64,${btoa(bin)}`;

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200, height: 630,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#03000A', position: 'relative',
            overflow: 'hidden', fontFamily: 'Montserrat',
          }}
        >
          {/* Purple glow */}
          <div style={{ position:'absolute', top:-180, left:-120, width:640, height:640, borderRadius:'50%', background:'radial-gradient(circle,rgba(153,69,255,0.22) 0%,transparent 65%)', display:'flex' }} />
          {/* Green glow */}
          <div style={{ position:'absolute', bottom:-140, right:-100, width:560, height:560, borderRadius:'50%', background:'radial-gradient(circle,rgba(20,241,149,0.14) 0%,transparent 65%)', display:'flex' }} />
          {/* Top bar */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:5, background:'linear-gradient(90deg,#9945FF,#14F195,#9945FF)', display:'flex' }} />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={150} height={150} style={{ borderRadius:30, marginBottom:32 }} />

          <div style={{ display:'flex', fontSize:100, fontWeight:900, color:'#FFFFFF', letterSpacing:'-0.03em', lineHeight:1, marginBottom:20, fontFamily:'Montserrat' }}>
            BlockBite
          </div>

          <div style={{ display:'flex', fontSize:26, fontWeight:700, color:'rgba(200,196,220,0.60)', letterSpacing:'0.04em', fontFamily:'Montserrat' }}>
            Token Distribution Protocol
          </div>
        </div>
      ),
      {
        width: 1200, height: 630,
        headers: { 'Cache-Control': 'public, max-age=86400' },
        fonts: [{ name: 'Montserrat', data: fontData, style: 'normal', weight: 900 }],
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`OG Error: ${msg}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

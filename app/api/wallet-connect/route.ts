import { NextRequest, NextResponse } from 'next/server';
import { sbTrackWalletConnect } from '@/lib/supabase-rest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const anon       = typeof body?.anon       === 'string' ? body.anon.slice(0, 20)       : 'unknown';
    const walletName = typeof body?.walletName === 'string' ? body.walletName.slice(0, 40) : 'unknown';
    const path       = typeof body?.path       === 'string' ? body.path.slice(0, 200)      : '/';

    // Fire-and-forget — don't block response
    sbTrackWalletConnect(anon, walletName, path).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

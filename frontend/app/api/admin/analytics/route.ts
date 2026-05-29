/**
 * GET /api/admin/analytics — Admin analytics endpoint.
 * Requires: x-admin-token header.
 * Returns page stats, wallet stats from in-memory store.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'blockbite-admin-2026';

// Shared analytics store
const g = globalThis as typeof globalThis & {
  _bbPageViews?: Map<string, number>;    // path → view count
  _bbSessions?:  Map<string, number>;   // path → session count
  _bbWallets?:   Map<string, number>;   // wallet name → connect count
  _bbDailyViews?:Map<string, number>;   // date → views
};
if (!g._bbPageViews)  g._bbPageViews  = new Map();
if (!g._bbSessions)   g._bbSessions   = new Map();
if (!g._bbWallets)    g._bbWallets    = new Map();
if (!g._bbDailyViews) g._bbDailyViews = new Map();

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-admin-token') ?? '';
  if (token !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Build page stats
  const pageStats = Array.from(g._bbPageViews!.entries())
    .map(([path, views]) => ({ path, views, sessions: g._bbSessions!.get(path) ?? 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);

  // Total stats
  const totalViews = Array.from(g._bbPageViews!.values()).reduce((a, b) => a + b, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayViews = g._bbDailyViews!.get(today) ?? 0;

  // 7-day chart
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const date = d.toISOString().slice(0, 10);
    return { date, views: g._bbDailyViews!.get(date) ?? 0, visitors: 0 };
  });

  // Wallet stats
  const byWallet = Array.from(g._bbWallets!.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const totalWallets = byWallet.reduce((a, b) => a + b.count, 0);

  return NextResponse.json({
    pageStats,
    totalStats: {
      totalViews,
      uniqueVisitors: Math.round(totalViews * 0.7), // estimate
      today: todayViews,
      tableReady: true,
      byDay,
    },
    walletStats: {
      total: totalWallets,
      unique: byWallet.length,
      today: 0,
      byWallet,
    },
  });
}

export async function POST(req: NextRequest) {
  // Track page view (called by PageTracker component)
  try {
    const body = await req.json().catch(() => ({}));
    const { path } = body as { path?: string };
    if (!path) return NextResponse.json({ ok: false });

    g._bbPageViews!.set(path, (g._bbPageViews!.get(path) ?? 0) + 1);
    const today = new Date().toISOString().slice(0, 10);
    g._bbDailyViews!.set(today, (g._bbDailyViews!.get(today) ?? 0) + 1);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

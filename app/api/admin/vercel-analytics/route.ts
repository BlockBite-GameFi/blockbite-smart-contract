/**
 * /api/admin/vercel-analytics
 *
 * Server-side proxy to Vercel Web Analytics REST API.
 * Requires two env vars (set in Vercel dashboard → Settings → Environment Variables):
 *   VERCEL_API_TOKEN  — Personal Access Token from https://vercel.com/account/tokens
 *   VERCEL_PROJECT_ID — Project ID from Vercel dashboard → Project → Settings → General
 *
 * Returns combined data: { available, stats, pages, byDay }
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

function checkToken(provided: string): boolean {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) return false;
  try {
    return provided.length === secret.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch { return false; }
}

export const runtime = 'nodejs';

// ── Vercel Analytics REST API wrapper ─────────────────────────────────────────

const VERCEL_API = 'https://api.vercel.com';

interface VercelStat {
  value: number;
  previousValue?: number;
  isSensitive?: boolean;
}

interface VercelStatsResponse {
  data?: {
    pageViews?: VercelStat;
    visitors?: VercelStat;
    bounceRate?: VercelStat;
    avgDuration?: VercelStat;
  };
}

interface VercelPageRow {
  path: string;
  visitors: number;
  pageViews: number;
}

interface VercelDataResponse {
  data?: {
    rows?: VercelPageRow[];
  };
}

interface VercelTimeseriesRow {
  timestamp: string;
  visitors: number;
  pageViews: number;
}

interface VercelTimeseriesResponse {
  data?: {
    rows?: VercelTimeseriesRow[];
  };
}

async function vercelFetch<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${VERCEL_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[vercel-analytics] API error', res.status, path);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (e) {
    console.error('[vercel-analytics] fetch error', e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const adminToken = req.headers.get('x-admin-token') ?? '';
  if (!checkToken(adminToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const vercelToken = process.env.VERCEL_API_TOKEN;
  const projectId   = process.env.VERCEL_PROJECT_ID;

  if (!vercelToken || !projectId) {
    return NextResponse.json({
      available: false,
      reason: !vercelToken
        ? 'VERCEL_API_TOKEN not set — add it in Vercel → Settings → Environment Variables'
        : 'VERCEL_PROJECT_ID not set — add it in Vercel → Settings → Environment Variables',
    });
  }

  // ── Time range: last 30 days ───────────────────────────────────────────────
  const endAt   = Date.now();
  const startAt = endAt - 30 * 24 * 60 * 60 * 1000;
  const base    = `/v1/web/insights`;

  const qp = new URLSearchParams({
    projectId,
    startAt:     String(startAt),
    endAt:       String(endAt),
    environment: 'production',
    filter:      '{}',
  });

  // ── Fetch in parallel: aggregate stats + page breakdown + time-series ──────
  const [statsRaw, pagesRaw, tsRaw] = await Promise.all([
    vercelFetch<VercelStatsResponse>(`${base}/stats?${qp}`, vercelToken),
    vercelFetch<VercelDataResponse>(`${base}/data?${qp}&type=pages&limit=50`, vercelToken),
    vercelFetch<VercelTimeseriesResponse>(`${base}/data?${qp}&type=timeseries`, vercelToken),
  ]);

  // ── Normalise aggregate stats ──────────────────────────────────────────────
  const stats = {
    pageViews:  statsRaw?.data?.pageViews?.value  ?? null,
    visitors:   statsRaw?.data?.visitors?.value   ?? null,
    bounceRate: statsRaw?.data?.bounceRate?.value  ?? null,
  };

  // ── Normalise per-page breakdown ──────────────────────────────────────────
  const pages: { path: string; visitors: number; pageViews: number }[] =
    (pagesRaw?.data?.rows ?? []).map(r => ({
      path:      r.path ?? '?',
      visitors:  r.visitors ?? 0,
      pageViews: r.pageViews ?? 0,
    }));

  // ── Normalise time-series (daily) ─────────────────────────────────────────
  const byDay: { date: string; visitors: number; pageViews: number }[] =
    (tsRaw?.data?.rows ?? []).map(r => ({
      date:      r.timestamp ? r.timestamp.slice(0, 10) : '?',
      visitors:  r.visitors  ?? 0,
      pageViews: r.pageViews ?? 0,
    }));

  return NextResponse.json({
    available: true,
    stats,
    pages,
    byDay,
    fetchedAt: new Date().toISOString(),
  });
}

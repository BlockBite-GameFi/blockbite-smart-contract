/**
 * Supabase REST API helpers (no extra npm package needed).
 * Uses service-role key so it bypasses RLS — server-side only.
 */

const SB_URL = process.env.SUPABASE_URL ?? '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function h(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    ...extra,
  };
}

export function supabaseReady(): boolean {
  return Boolean(SB_URL && SB_KEY);
}

/** Insert email. Returns 'inserted' | 'duplicate' | 'error:STATUS'.
 *  Strict: with Prefer:return=representation the response body MUST contain the
 *  inserted row. If RLS or a trigger silently drops the row, PostgREST returns
 *  201 with [] — we treat that as a silent failure instead of "inserted".
 */
export async function sbInsertEmail(
  email: string,
): Promise<'inserted' | 'duplicate' | string> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/waitlist`, {
      method: 'POST',
      headers: h({ Prefer: 'return=representation' }),
      body: JSON.stringify({ email }),
      cache: 'no-store',
    });
    if (res.status === 409) return 'duplicate';
    const bodyText = await res.text().catch(() => '');
    if (res.status === 200 || res.status === 201) {
      // representation should return the inserted row. Empty array = silent RLS drop.
      try {
        const parsed = JSON.parse(bodyText);
        if (Array.isArray(parsed) && parsed.length === 0) {
          return `error:silent-rls:body=[]:status=${res.status}`;
        }
      } catch { /* not JSON — accept as inserted */ }
      return 'inserted';
    }
    if (res.status === 204) return 'inserted'; // minimal — can't verify, trust status
    return `error:${res.status}:${bodyText.slice(0, 200)}`;
  } catch (e) {
    return `error:exception:${String(e).slice(0, 120)}`;
  }
}

/** Decode JWT payload without verifying — used only for diagnostics so we can
 *  tell the user whether the key in Vercel is the anon key vs service_role.
 */
export function sbKeyRole(): { role?: string; ref?: string; error?: string } {
  if (!SB_KEY) return { error: 'no-key' };
  const parts = SB_KEY.split('.');
  if (parts.length !== 3) return { error: 'not-jwt' };
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    return { role: decoded?.role, ref: decoded?.ref };
  } catch (e) {
    return { error: `decode:${String(e).slice(0, 60)}` };
  }
}

/** Probe Supabase with a raw SELECT and return the response details. */
export async function sbProbe(): Promise<{
  status: number;
  bodyHead: string;
  rowCount: number | null;
}> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/waitlist?select=email&limit=5`,
      { headers: h({ Prefer: 'count=exact' }), cache: 'no-store' },
    );
    const txt = await res.text().catch(() => '');
    let rowCount: number | null = null;
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) rowCount = parsed.length;
    } catch { /* ignore */ }
    return { status: res.status, bodyHead: txt.slice(0, 300), rowCount };
  } catch (e) {
    return { status: -1, bodyHead: `exception:${String(e).slice(0, 200)}`, rowCount: null };
  }
}

/** Return total row count. */
export async function sbGetCount(): Promise<number | null> {
  // Always use sbGetList() — the HEAD+count=exact approach returns unreliable
  // zeros from this PostgREST instance. List length is the authoritative count.
  const list = await sbGetList();
  if (list !== null) return list.length;
  return null;
}

export type SbEntry = { email: string; created_at: string };

/** Delete a single email from waitlist. Returns true on success. */
export async function sbDeleteEmail(email: string): Promise<boolean> {
  try {
    const encoded = encodeURIComponent(email);
    const res = await fetch(
      `${SB_URL}/rest/v1/waitlist?email=eq.${encoded}`,
      { method: 'DELETE', headers: h({ Prefer: 'return=minimal' }), cache: 'no-store' },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Return all entries ordered newest first.
 *  cache:no-store is REQUIRED — Next.js 14 caches server-side fetch() by
 *  default, so without it every GET sees the same frozen snapshot of rows
 *  even when force-dynamic is set on the route. That bug caused the public
 *  counter to stick at 2 while new signups kept landing in Supabase.
 */
export async function sbGetList(): Promise<SbEntry[] | null> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/waitlist?select=email,created_at&order=created_at.desc&limit=50000`,
      { headers: h(), cache: 'no-store' },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Page-view analytics via Supabase Storage ────────────────────────────────
// Uses service_role key only — zero DDL, zero manual setup, zero new env vars.
// Bucket: "analytics" | Objects: "pv/{YYYY-MM-DD}/{ts}-{rand}.json"

const ANA_BUCKET = 'analytics';

/** Ensure analytics bucket exists (idempotent). */
async function sbEnsureBucket(): Promise<void> {
  if (!supabaseReady()) return;
  try {
    await fetch(`${SB_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({ id: ANA_BUCKET, name: ANA_BUCKET, public: false }),
      cache: 'no-store',
    });
    // 200 = created, 409 = already exists — both are fine
  } catch { /* ignore */ }
}

// Keep provision export for backwards compat (no-op now — storage needs no provisioning)
export async function sbAutoProvisionPageViews(): Promise<boolean> {
  await sbEnsureBucket();
  return true;
}

/** Write one page view event to storage. Fire-and-forget. */
export async function sbTrackView(path: string, sid: string): Promise<void> {
  if (!supabaseReady()) return;
  const date  = new Date().toISOString().slice(0, 10);
  const ts    = Date.now();
  const rand  = Math.random().toString(36).slice(2, 8);
  const key   = `pv/${date}/${ts}-${rand}.json`;
  const body  = JSON.stringify({ path, sid, ts });
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/${ANA_BUCKET}/${key}`, {
      method: 'POST',
      headers: h({ 'Content-Type': 'application/json', 'x-upsert': 'true' }),
      body,
      cache: 'no-store',
    });
    // Bucket might not exist yet — create it then retry
    if (!res.ok && (res.status === 404 || res.status === 400)) {
      await sbEnsureBucket();
      await fetch(`${SB_URL}/storage/v1/object/${ANA_BUCKET}/${key}`, {
        method: 'POST',
        headers: h({ 'Content-Type': 'application/json', 'x-upsert': 'true' }),
        body,
        cache: 'no-store',
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}

/** List all page-view objects and aggregate by path. */
export type PageViewStat = { path: string; views: number; sessions: number };

export async function sbGetViewStats(): Promise<PageViewStat[] | null> {
  if (!supabaseReady()) return null;
  try {
    const items = await sbListAllPvObjects();
    if (!items) return null;
    const reads = await Promise.all(
      items.slice(0, 2000).map(name =>
        fetch(`${SB_URL}/storage/v1/object/${ANA_BUCKET}/${name}`, { headers: h(), cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    const map = new Map<string, { views: number; sessions: Set<string> }>();
    for (const ev of reads) {
      if (!ev?.path) continue;
      if (!map.has(ev.path)) map.set(ev.path, { views: 0, sessions: new Set() });
      const s = map.get(ev.path)!;
      s.views++;
      if (ev.sid) s.sessions.add(ev.sid);
    }
    return Array.from(map.entries())
      .map(([path, s]) => ({ path, views: s.views, sessions: s.sessions.size }))
      .sort((a, b) => b.views - a.views);
  } catch { return null; }
}

/**
 * List all pv/ event files in the bucket — returns array of full storage paths.
 *
 * Supabase Storage lists only ONE level at a time (virtual directories).
 * Our objects live at  pv/{YYYY-MM-DD}/{ts}-{rand}.json  (two levels below root).
 * Listing with prefix="pv/" returns the date-folder entries, NOT the files.
 * We must:
 *   Step 1 — list pv/ → get date folders  e.g. { name: '2025-05-25' }
 *   Step 2 — for each folder, list pv/{date}/ → get actual files  e.g. { name: '1748888000-abc.json' }
 */
async function sbListAllPvObjects(): Promise<string[] | null> {
  if (!supabaseReady()) return null;
  const all: string[] = [];

  // ── Step 1: enumerate date folders ─────────────────────────────────────
  let dateFolders: { name: string }[];
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/list/${ANA_BUCKET}`, {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({ prefix: 'pv/', limit: 365, offset: 0,
        sortBy: { column: 'name', order: 'desc' } }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    dateFolders = await res.json();
    if (!Array.isArray(dateFolders)) return null;
  } catch { return null; }

  // ── Step 2: for each date folder, enumerate the event files ────────────
  for (const folder of dateFolders.slice(0, 60)) { // at most 60 days
    const datePrefix = `pv/${folder.name}/`;
    let offset = 0;
    for (;;) {
      try {
        const res = await fetch(`${SB_URL}/storage/v1/object/list/${ANA_BUCKET}`, {
          method: 'POST',
          headers: h(),
          body: JSON.stringify({ prefix: datePrefix, limit: 1000, offset,
            sortBy: { column: 'created_at', order: 'desc' } }),
          cache: 'no-store',
        });
        if (!res.ok) break;
        const items: { name: string }[] = await res.json();
        if (!Array.isArray(items) || items.length === 0) break;
        // items[n].name is relative to the prefix, so full path = datePrefix + name
        // Filter to .json only — Supabase Storage can create .emptyFolderPlaceholder files
        all.push(...items.filter(i => i.name.endsWith('.json')).map(i => `${datePrefix}${i.name}`));
        if (items.length < 1000 || all.length >= 5000) break;
        offset += 1000;
      } catch { break; }
    }
    if (all.length >= 5000) break;
  }

  return all;
}

// ─── Wallet-connection analytics via Supabase Storage ────────────────────────
// Same bucket "analytics", prefix: wc/{YYYY-MM-DD}/{ts}-{rand}.json
// Payload: { anon, walletName, path, ts }

/** Write one wallet-connect event to storage. Fire-and-forget. */
export async function sbTrackWalletConnect(
  anon: string, walletName: string, path: string,
): Promise<void> {
  if (!supabaseReady()) return;
  const date = new Date().toISOString().slice(0, 10);
  const ts   = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const key  = `wc/${date}/${ts}-${rand}.json`;
  const body = JSON.stringify({ anon, walletName, path, ts });
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/${ANA_BUCKET}/${key}`, {
      method: 'POST',
      headers: h({ 'Content-Type': 'application/json', 'x-upsert': 'true' }),
      body,
      cache: 'no-store',
    });
    if (!res.ok && (res.status === 404 || res.status === 400)) {
      await sbEnsureBucket();
      await fetch(`${SB_URL}/storage/v1/object/${ANA_BUCKET}/${key}`, {
        method: 'POST',
        headers: h({ 'Content-Type': 'application/json', 'x-upsert': 'true' }),
        body,
        cache: 'no-store',
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}

export type WalletStat = {
  total:      number;   // total wallet-connect events
  unique:     number;   // unique anonymised addresses
  today:      number;   // events today
  byWallet:   { name: string; count: number }[];  // breakdown by wallet app
};

/** Aggregate wallet-connect events from Supabase Storage. */
export async function sbGetWalletStats(): Promise<WalletStat> {
  const empty: WalletStat = { total: 0, unique: 0, today: 0, byWallet: [] };
  if (!supabaseReady()) return empty;
  try {
    // List wc/ date folders
    const res1 = await fetch(`${SB_URL}/storage/v1/object/list/${ANA_BUCKET}`, {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({ prefix: 'wc/', limit: 365, offset: 0, sortBy: { column: 'name', order: 'desc' } }),
      cache: 'no-store',
    });
    if (!res1.ok) return empty;
    const dateFolders: { name: string }[] = await res1.json();
    if (!Array.isArray(dateFolders) || dateFolders.length === 0) return empty;

    // List files in each date folder
    const all: string[] = [];
    for (const folder of dateFolders.slice(0, 60)) {
      const prefix = `wc/${folder.name}/`;
      const res2 = await fetch(`${SB_URL}/storage/v1/object/list/${ANA_BUCKET}`, {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
        cache: 'no-store',
      });
      if (!res2.ok) continue;
      const items: { name: string }[] = await res2.json();
      // Filter to .json only — Supabase Storage can create .emptyFolderPlaceholder files
      if (Array.isArray(items)) all.push(...items.filter(i => i.name.endsWith('.json')).map(i => `${prefix}${i.name}`));
      if (all.length >= 2000) break;
    }

    if (all.length === 0) return empty;

    const todayStr = new Date().toISOString().slice(0, 10);
    const uniqueSet = new Set<string>();
    const walletMap = new Map<string, number>();
    let today = 0;

    const reads = await Promise.all(
      all.slice(0, 500).map(name =>
        fetch(`${SB_URL}/storage/v1/object/${ANA_BUCKET}/${name}`, { headers: h(), cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ),
    );

    for (const ev of reads) {
      if (!ev) continue;
      if (ev.anon) uniqueSet.add(ev.anon);
      const wName = ev.walletName ?? 'Unknown';
      walletMap.set(wName, (walletMap.get(wName) ?? 0) + 1);
      const evDate = ev.ts ? new Date(ev.ts).toISOString().slice(0, 10) : '';
      if (evDate === todayStr) today++;
    }

    const byWallet = Array.from(walletMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { total: all.length, unique: uniqueSet.size, today, byWallet };
  } catch { return empty; }
}

export type DayStat = { date: string; views: number; visitors: number };

export type TotalViewStats = {
  totalViews:     number;
  uniqueVisitors: number;
  today:          number;
  tableReady:     boolean;
  byDay:          DayStat[];  // last 7 calendar days, oldest → newest
};

function emptyTotalStats(): TotalViewStats {
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), views: 0, visitors: 0 };
  });
  return { totalViews: 0, uniqueVisitors: 0, today: 0, tableReady: true, byDay };
}

/** Count .json event objects under a storage prefix. Paginates so the result
 *  is exact regardless of how many objects the folder holds. */
async function sbCountObjects(prefix: string): Promise<number> {
  let count = 0;
  let offset = 0;
  for (;;) {
    let items: { name: string }[];
    try {
      const res = await fetch(`${SB_URL}/storage/v1/object/list/${ANA_BUCKET}`, {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
        cache: 'no-store',
      });
      if (!res.ok) break;
      items = await res.json();
    } catch { break; }
    if (!Array.isArray(items) || items.length === 0) break;
    // .emptyFolderPlaceholder objects must not be counted as views
    count += items.filter(i => i.name.endsWith('.json')).length;
    if (items.length < 1000) break;
    offset += 1000;
  }
  return count;
}

export async function sbGetTotalViewStats(): Promise<TotalViewStats> {
  if (!supabaseReady()) return emptyTotalStats();
  try {
    // ── 7-day chart + "today": count each date folder DIRECTLY. ──────────────
    // Every event is stored at  pv/{YYYY-MM-DD}/{ts}-{rand}.json  so the date is
    // already in the key — counting a day's folder gives an exact, uncapped daily
    // total. The previous version derived these from only the 500 NEWEST event
    // files, so as today's traffic grew it pushed earlier days out of the sample
    // and their bars collapsed to 0 (the "loses yesterday's data" bug). Folder
    // counts never slide out of a window, so historical days stay put forever.
    const todayStr = new Date().toISOString().slice(0, 10);
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    const dayCounts = await Promise.all(last7.map(date => sbCountObjects(`pv/${date}/`)));
    const byDay: DayStat[] = last7.map((date, i) => ({ date, views: dayCounts[i], visitors: 0 }));
    const today = byDay.find(d => d.date === todayStr)?.views ?? 0;

    // ── All-time total + unique visitors from the full object listing. ───────
    const items = await sbListAllPvObjects();
    if (!items) {
      // Listing failed (bucket missing/inaccessible) — try to create it, but the
      // per-folder counts above may still be valid, so return those.
      sbEnsureBucket().catch(() => {});
      return {
        totalViews:     byDay.reduce((s, d) => s + d.views, 0),
        uniqueVisitors: 0,
        today,
        tableReady:     true,
        byDay,
      };
    }

    // Unique visitors needs the session id from file contents → recent sample.
    // This metric is approximate by design; the daily chart above is exact.
    const sample = items.slice(0, 500);
    const reads = await Promise.all(
      sample.map(name =>
        fetch(`${SB_URL}/storage/v1/object/${ANA_BUCKET}/${name}`, { headers: h(), cache: 'no-store' })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ),
    );
    const sessions = new Set<string>();
    for (const ev of reads) if (ev?.sid) sessions.add(ev.sid);

    return {
      totalViews:     items.length,     // exact count from storage listing (cap 5000)
      uniqueVisitors: sessions.size,    // from sample (accurate for devnet traffic)
      today,
      tableReady:     true,
      byDay,
    };
  } catch {
    return emptyTotalStats();
  }
}

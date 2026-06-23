'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useConnection } from '@solana/wallet-adapter-react';
import { VESTING_PROGRAM_ID } from '@/lib/anchor/vesting-client';
import { ConfirmedSignatureInfo } from '@solana/web3.js';
import { T } from '@/lib/theme';
import { I18N } from '@/lib/i18n';
import { useApp } from '@/lib/useApp';

// Map Anchor instruction discriminator prefix (8 bytes) to human name.
// These are the sha256("global:<ix_name>") discriminators from the IDL.
// We detect them by matching the base64-encoded first 8 bytes of each
// instruction's data field in the parsed transaction logs.
const IX_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  create_stream:       { label: 'create_stream',       color: T.accent,  icon: '＋' },
  withdraw:            { label: 'withdraw',             color: T.green,   icon: '↓'  },
  cancel:              { label: 'cancel',               color: T.red,     icon: '✗'  },
  configure_milestones:{ label: 'configure_milestones', color: T.blue,    icon: '◉'  },
  verify_milestone:    { label: 'verify_milestone',     color: T.gold,    icon: '✓'  },
  fund_vault:          { label: 'fund_vault',           color: '#c084fc', icon: '↑'  },
  update_proof:        { label: 'update_proof',         color: T.blue,    icon: '◈'  },
};

function formatTs(blockTime: number | null | undefined): string {
  if (!blockTime) return '—';
  return new Date(blockTime * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '16px 20px', ...style }}>{children}</div>;
}

interface TxRow {
  sig:       string;
  blockTime: number | null;
  err:       boolean;
  label:     string;
  color:     string;
  icon:      string;
}

export default function AuditPage() {
  const tx = I18N.audit as any;

  const { connection } = useConnection();
  const [txRows,   setTxRows]   = useState<TxRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<'all' | string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch most recent 50 confirmed transactions for the program
      const sigs: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(
        VESTING_PROGRAM_ID,
        { limit: 50 },
        'confirmed',
      );

      // We can't cheaply decode the exact instruction name without fetching
      // full tx data, so we use the memo / log approach: fetch in batches.
      // For the first 20 sigs, fetch parsed tx to extract instruction logs.
      const first20 = sigs.slice(0, 20);
      const parsedBatch = await Promise.allSettled(
        first20.map(s => connection.getParsedTransaction(s.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })),
      );

      const rows: TxRow[] = sigs.map((s, i) => {
        let label = 'program_ix';
        let color: string = T.textDim;
        let icon  = '◦';

        // Try to identify from logs
        if (i < parsedBatch.length) {
          const res = parsedBatch[i];
          if (res.status === 'fulfilled' && res.value) {
            const logs = res.value.meta?.logMessages ?? [];
            // Anchor logs: "Program log: Instruction: CreateStream"
            for (const log of logs) {
              if (log.includes('Instruction:')) {
                const match = log.match(/Instruction:\s*(\w+)/);
                if (match) {
                  // Convert CamelCase → snake_case for lookup
                  const snake = match[1].replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();
                  const known = IX_LABELS[snake];
                  if (known) { label = known.label; color = known.color; icon = known.icon; }
                  else        { label = snake; color = T.textDim; icon = '◦'; }
                  break;
                }
              }
            }
          }
        } else if (i >= 20) {
          // For sigs beyond first 20, show generically
          label = 'program_ix';
        }

        return { sig: s.signature, blockTime: s.blockTime ?? null, err: s.err != null, label, color, icon };
      });

      setTxRows(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RPC error');
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? txRows : txRows.filter(r => r.label === filter);
  const actionTypes = [...new Set(txRows.map(r => r.label))];

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text }}>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(88px,12vw,108px) clamp(16px,5vw,40px) 80px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>
            {tx.badge}
          </div>
          <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(24px,5vw,36px)', fontWeight: 800, color: T.text, margin: 0 }}>
            {tx.title}
          </h1>
          <p style={{ fontSize: 12.5, color: T.textDim, margin: '6px 0 0' }}>
            {tx.subtitle}
          </p>
        </div>
        <button onClick={load} style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)', color: T.accent, cursor: 'pointer', fontSize: 12, fontFamily: T.serif, alignSelf: 'flex-start' }}>
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ margin: '16px 40px', background: T.redA1, border: `1px solid ${T.red}`, borderRadius: 10, padding: '12px 16px', fontSize: 12, color: T.red }}>
          RPC error: {error}
        </div>
      )}

      <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Summary KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { label: 'Transactions Fetched', val: String(txRows.length),                                    col: T.accent },
            { label: 'Successful',           val: String(txRows.filter(r => !r.err).length),                col: T.green  },
            { label: 'Failed / Reverted',    val: String(txRows.filter(r => r.err).length),                 col: T.red    },
            { label: 'Unique Instruction',   val: String(actionTypes.length),                               col: T.blue   },
          ].map(s => (
            <Card key={s.label} style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 9.5, color: T.textDim, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>{s.label}</div>
              <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, color: s.col, lineHeight: 1 }}>{loading ? '…' : s.val}</div>
            </Card>
          ))}
        </div>

        {/* ── Filter tabs ── */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: filter === 'all' ? T.accent : 'rgba(255,255,255,.06)', color: filter === 'all' ? T.text : T.textDim }}>All</button>
          {actionTypes.map(t => {
            const meta = IX_LABELS[t];
            return (
              <button key={t} onClick={() => setFilter(t)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: filter === t ? (meta?.color ?? T.accent) : 'rgba(255,255,255,.06)', color: filter === t ? T.text : T.textDim }}>
                {meta?.icon ?? '◦'} {t}
              </button>
            );
          })}
        </div>

        {/* ── Transaction log ── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: T.serif, fontSize: 13, fontWeight: 700, color: T.text }}>
              {loading ? tx.loading : `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`}
            </span>
            <span style={{ fontSize: 10, color: T.textDim }}>Most recent first</span>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 140px 160px 100px', padding: '8px 20px', background: 'rgba(255,255,255,.03)', borderBottom: `1px solid ${T.border}` }}>
            {['', 'SIGNATURE', 'INSTRUCTION', 'TIMESTAMP (UTC)', 'STATUS'].map(h => (
              <div key={h} style={{ fontSize: 9.5, color: T.textDim, fontWeight: 700, letterSpacing: '.06em' }}>{h}</div>
            ))}
          </div>

          {loading && <div style={{ padding: '40px 20px', textAlign: 'center', color: T.textDim, fontSize: 13 }}>Fetching from Solana devnet…</div>}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: T.textDim, fontSize: 13 }}>
              {txRows.length === 0
                ? <>{tx.noEvents} <Link href="/new" style={{ color: T.accent }}>Create a stream</Link> to populate this log.</>
                : 'No transactions match this filter.'
              }
            </div>
          )}

          {filtered.map((row, i) => (
            <div key={row.sig} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 140px 160px 100px',
              padding: '11px 20px', borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
              background: row.err ? T.redA1 : (i % 2 ? 'rgba(255,255,255,.01)' : 'transparent'),
              alignItems: 'center',
            }}>
              {/* Icon */}
              <div style={{ fontSize: 14, color: row.color, textAlign: 'center' }}>{row.icon}</div>
              {/* Signature */}
              <div>
                <a
                  href={`https://explorer.solana.com/tx/${row.sig}?cluster=devnet`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, textDecoration: 'none' }}
                >
                  {row.sig.slice(0, 16)}…{row.sig.slice(-8)}
                </a>
              </div>
              {/* Instruction */}
              <div>
                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700, background: T.accentA2, border: `1px solid ${T.accentA4}`, color: row.color, fontFamily: T.mono }}>
                  {row.label}
                </span>
              </div>
              {/* Timestamp */}
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim }}>{formatTs(row.blockTime)}</div>
              {/* Status */}
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: row.err ? T.red : T.green }}>
                  {row.err ? '✗ FAILED' : '✓ OK'}
                </span>
              </div>
            </div>
          ))}
        </Card>

        <div style={{ fontSize: 11, color: T.textDim, textAlign: 'center' }}>
          Showing last 50 transactions · Full history on{' '}
          <a href={`https://explorer.solana.com/address/${VESTING_PROGRAM_ID.toBase58()}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>
            Solana Explorer ↗
          </a>
          {' '}·{' '}
          <Link href="/demo#audit" style={{ color: T.textDim }}>View demo log</Link>
        </div>
      </div>
      </div>
    </div>
  );
}

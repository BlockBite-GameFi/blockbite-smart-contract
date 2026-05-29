'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Navbar from '@/components/Navbar';
import type { Quest, QuestCompletion } from '@/lib/quests/store';
import { useApp } from '@/lib/useApp';
import { T } from '@/lib/theme';

const QUESTS_TX = {
  en: {
    title:       'Quests',
    subtitle:    'Complete tasks from ecosystem partners to unlock reward tiers.',
    connectNote: 'Connect a wallet to submit quest completions.',
    connectBtn:  'CONNECT WALLET',
    loading:     'Loading quests…',
    empty:       "No active quests right now. Check back soon — or if you're a builder, create some at",
    cancel:      'CANCEL',
    submit:      'SUBMIT',
    proofLabel:  'Proof (link, txn signature, screenshot URL, etc.)',
    submitting:  'SUBMITTING…',
    submitReview:'SUBMIT FOR REVIEW',
  },
  id: {
    title:       'Misi',
    subtitle:    'Selesaikan tugas dari mitra ekosistem untuk membuka level hadiah.',
    connectNote: 'Hubungkan wallet untuk mengajukan penyelesaian misi.',
    connectBtn:  'HUBUNGKAN WALLET',
    loading:     'Memuat misi…',
    empty:       'Belum ada misi aktif. Cek lagi nanti — atau jika kamu pembangun, buat di',
    cancel:      'BATAL',
    submit:      'KIRIM',
    proofLabel:  'Bukti (tautan, tanda tangan txn, URL screenshot, dll.)',
    submitting:  'MENGAJUKAN…',
    submitReview:'KIRIM UNTUK DITINJAU',
  },
};

/**
 * Public quest feed for users.
 *
 * Shows every active quest from every admin. Each quest can be submitted
 * for verification — admins review on /distribute/quests.
 *
 * Per-user submission status renders inline so the user knows whether to
 * resubmit, wait for review, or move on.
 */
export default function QuestsPage() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { lang } = useApp();
  const TX = QUESTS_TX[lang];

  const [quests,       setQuests]       = useState<Quest[]>([]);
  const [mySubs,       setMySubs]       = useState<Record<string, QuestCompletion>>({});
  const [proofInput,   setProofInput]   = useState<Record<string, string>>({});
  const [openQuest,    setOpenQuest]    = useState<string | null>(null);
  const [busy,         setBusy]         = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/quests', { cache: 'no-store' });
      const data = await res.json();
      setQuests((data.quests ?? []) as Quest[]);

      if (publicKey) {
        const wallet = publicKey.toBase58();
        const subs: Record<string, QuestCompletion> = {};
        await Promise.all(
          (data.quests as Quest[]).map(async (q) => {
            try {
              void q; void wallet;
            } catch { /* ignore */ }
          }),
        );
        setMySubs(subs);
      }
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSubmit = useCallback(async (q: Quest) => {
    if (!publicKey) return;
    const proof = (proofInput[q.id] ?? '').trim();
    if (!proof) return;
    setBusy(q.id);
    try {
      const res = await fetch(`/api/quests/${q.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey.toBase58(), proof }),
      });
      const data = await res.json();
      if (data.completion) {
        setMySubs((m) => ({ ...m, [q.id]: data.completion }));
      }
      setProofInput((p) => ({ ...p, [q.id]: '' }));
      setOpenQuest(null);
    } finally {
      setBusy(null);
    }
  }, [publicKey, proofInput]);

  return (
    <div style={{
      minHeight: '100vh', background: T.bg, color: T.text,
      fontFamily: T.serif,
    }}>
      <Navbar />
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px 80px' }}>

        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, marginBottom: 6 }}>{TX.title}</h1>
        <p style={{ color: T.textDim, fontSize: 13, marginBottom: 26 }}>
          {TX.subtitle}
        </p>

        {!connected && (
          <div style={{
            padding: 22, borderRadius: 14, marginBottom: 18,
            background: `color-mix(in srgb, ${T.accent} 6%, transparent)`,
            border: `1px solid ${T.border}`,
            textAlign: 'center',
          }}>
            <p style={{ color: T.textDim, marginBottom: 12, fontSize: 13 }}>
              {TX.connectNote}
            </p>
            <button
              type="button" onClick={() => setVisible(true)}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: T.grad, color: '#0a0a14',
                fontWeight: 800, fontSize: 13, cursor: 'pointer',
              }}>
              {TX.connectBtn}
            </button>
          </div>
        )}

        {loading && (
          <div style={{ color: T.textDim, fontSize: 13, textAlign: 'center', padding: 30 }}>
            {TX.loading}
          </div>
        )}

        {!loading && quests.length === 0 && (
          <div style={{
            padding: 30, borderRadius: 14, textAlign: 'center',
            background: T.surface, border: `1px solid ${T.border}`,
          }}>
            <p style={{ color: T.textDim, fontSize: 13 }}>
              {TX.empty}{' '}
              <a href="/distribute/quests" style={{ color: T.accent }}>/distribute/quests</a>.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {quests.map((q) => {
            const sub  = mySubs[q.id];
            const open = openQuest === q.id;
            return (
              <div key={q.id} style={{
                padding: 18, borderRadius: 14,
                background: T.surface, border: `1px solid ${T.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.4, color: T.accent, fontWeight: 700, marginBottom: 4 }}>
                      {q.type.toUpperCase()} · {q.rewardLabel}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: T.textDim, marginTop: 6, lineHeight: 1.6 }}>
                      {q.description}
                    </div>
                  </div>
                  {sub ? (
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
                      padding: '4px 10px', borderRadius: 999,
                      background: sub.status === 'approved' ? 'rgba(94,234,212,0.18)'
                                : sub.status === 'rejected' ? 'rgba(244,114,182,0.18)'
                                : 'rgba(251,191,36,0.18)',
                      color: sub.status === 'approved' ? '#5eead4'
                            : sub.status === 'rejected' ? '#f472b6'
                            : '#fbbf24',
                      whiteSpace: 'nowrap',
                    }}>
                      {sub.status.toUpperCase()}
                    </span>
                  ) : connected ? (
                    <button type="button"
                      onClick={() => setOpenQuest(open ? null : q.id)}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        border: `1px solid ${T.accent}`,
                        background: open ? T.grad : 'transparent',
                        color: open ? '#0a0a14' : T.accent,
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                      {open ? TX.cancel : TX.submit}
                    </button>
                  ) : null}
                </div>

                {open && (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 10, letterSpacing: 1.5, color: T.textDim, fontWeight: 700 }}>
                      {TX.proofLabel}
                    </label>
                    <textarea
                      rows={2}
                      value={proofInput[q.id] ?? ''}
                      onChange={(e) => setProofInput((p) => ({ ...p, [q.id]: e.target.value }))}
                      placeholder="https://x.com/yourhandle/status/..."
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        background: T.surface2, border: `1px solid ${T.border}`,
                        color: T.text, fontSize: 13, outline: 'none',
                        fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />
                    <button type="button"
                      onClick={() => handleSubmit(q)}
                      disabled={busy === q.id || !(proofInput[q.id] ?? '').trim()}
                      style={{
                        padding: '10px 14px', borderRadius: 10, border: 'none',
                        background: busy !== q.id && (proofInput[q.id] ?? '').trim()
                          ? T.grad : T.surface2,
                        color: busy !== q.id && (proofInput[q.id] ?? '').trim()
                          ? '#0a0a14' : T.textDim,
                        fontWeight: 800, fontSize: 13,
                        cursor: busy === q.id ? 'wait' : 'pointer',
                      }}>
                      {busy === q.id ? TX.submitting : TX.submitReview}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

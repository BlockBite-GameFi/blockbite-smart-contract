'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import Navbar from '@/components/Navbar';
import type { Quest, QuestCompletion, QuestType } from '@/lib/quests/store';
import { useApp } from '@/lib/useApp';
import { T } from '@/lib/theme';

const TYPE_OPTIONS_EN: { value: QuestType; label: string; example: string }[] = [
  { value: 'follow',   label: 'Social follow',   example: 'Follow @blockbite_gg on X' },
  { value: 'onchain',  label: 'On-chain action',  example: 'Hold ≥ 100 BLOCK' },
  { value: 'gameplay', label: 'Gameplay',         example: 'Reach Level 100' },
  { value: 'referral', label: 'Referral',         example: 'Refer 3 users' },
  { value: 'custom',   label: 'Custom',           example: 'Submit a demo video' },
];
const TYPE_OPTIONS_ID: { value: QuestType; label: string; example: string }[] = [
  { value: 'follow',   label: 'Ikuti sosial',     example: 'Ikuti @blockbite_gg di X' },
  { value: 'onchain',  label: 'Aksi on-chain',    example: 'Pegang ≥ 100 BLOCK' },
  { value: 'gameplay', label: 'Gameplay',          example: 'Capai Level 100' },
  { value: 'referral', label: 'Referral',          example: 'Referensikan 3 pengguna' },
  { value: 'custom',   label: 'Kustom',            example: 'Kirim video demo' },
];

export default function DistributeQuestsPage() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { lang } = useApp();
  const id = lang === 'id';

  const TYPE_OPTIONS = id ? TYPE_OPTIONS_ID : TYPE_OPTIONS_EN;

  const [quests,      setQuests]      = useState<Quest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [type,        setType]        = useState<QuestType>('follow');
  const [reward,      setReward]      = useState('');
  const [maxComps,    setMaxComps]    = useState('0');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [reviewQuest, setReviewQuest] = useState<Quest | null>(null);
  const [completions, setCompletions] = useState<QuestCompletion[]>([]);
  const [reviewBusy,  setReviewBusy]  = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quests', { cache: 'no-store' });
      const data = await res.json();
      const mine = publicKey
        ? (data.quests ?? []).filter((q: Quest) => q.adminWallet === publicKey.toBase58())
        : [];
      setQuests(mine);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (!publicKey) return;
    if (!title.trim() || !description.trim() || !reward.trim()) {
      setError(id ? 'Judul, deskripsi, dan label hadiah wajib diisi.' : 'Title, description, and reward label are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminWallet: publicKey.toBase58(),
          title, description, type,
          rewardLabel: reward,
          maxCompletions: parseInt(maxComps) || 0,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setTitle(''); setDescription(''); setReward(''); setMaxComps('0');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [publicKey, title, description, type, reward, maxComps, refresh, id]);

  const openReview = useCallback(async (quest: Quest) => {
    if (!publicKey) return;
    setReviewQuest(quest);
    setCompletions([]);
    try {
      const url = `/api/quests/${quest.id}/review?adminWallet=${encodeURIComponent(publicKey.toBase58())}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      setCompletions(data.completions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [publicKey]);

  const handleReview = useCallback(async (wallet: string, approve: boolean) => {
    if (!publicKey || !reviewQuest) return;
    setReviewBusy(wallet);
    try {
      const res = await fetch(`/api/quests/${reviewQuest.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminWallet: publicKey.toBase58(), wallet, approve }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await openReview(reviewQuest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewBusy(null);
    }
  }, [publicKey, reviewQuest, openReview]);

  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, letterSpacing: 1.5, color: T.textDim,
    fontWeight: 700, marginBottom: 6,
  };
  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: T.surface2, border: `1px solid ${T.border}`,
    color: T.text, fontSize: 13, outline: 'none',
  };
  const miniBtn: React.CSSProperties = {
    padding: '5px 10px', borderRadius: 8, border: '1px solid',
    background: 'transparent', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      <Navbar />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '120px 24px 80px' }}>

        <Link href="/distribute" style={{ color: T.textDim, fontSize: 12, textDecoration: 'none' }}>
          ← {id ? 'Kembali ke distribusi' : 'Back to distribute'}
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '6px 0 6px' }}>{id ? 'Misi' : 'Quests'}</h1>
        <p style={{ color: T.textDim, fontSize: 13, marginBottom: 30 }}>
          {id
            ? 'Tetapkan tugas untuk audiens distribusi Anda. Saring bot melalui keterlibatan nyata, bukan captcha. Lapisan kompetisi gaya Zealy.'
            : 'Set tasks for your distribution audience. Filter bots through real engagement, not captchas. Zealy-style competition layer.'}
        </p>

        {!connected && (
          <div style={{
            padding: 24, borderRadius: 14, textAlign: 'center',
            background: `color-mix(in srgb, ${T.accent} 6%, transparent)`, border: `1px solid ${T.border}`,
            marginBottom: 24,
          }}>
            <p style={{ color: T.textDim, marginBottom: 14 }}>
              {id ? 'Hubungkan wallet untuk membuat dan meninjau misi.' : 'Connect your wallet to create and review quests.'}
            </p>
            <button
              type="button"
              onClick={() => setVisible(true)}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: T.grad, color: '#0a0a14',
                fontWeight: 800, fontSize: 13, cursor: 'pointer',
              }}
            >
              {id ? 'HUBUNGKAN WALLET' : 'CONNECT WALLET'}
            </button>
          </div>
        )}

        {connected && (
          <>
            {/* Create form */}
            <section style={{
              padding: 22, borderRadius: 16, marginBottom: 24,
              background: T.surface, border: `1px solid ${T.border}`,
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px' }}>{id ? 'Buat Misi' : 'Create Quest'}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={lbl}>{id ? 'Judul' : 'Title'}</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder={id ? 'Ikuti @blockbite_gg di X' : 'Follow @blockbite_gg on X'} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>{id ? 'Deskripsi' : 'Description'}</label>
                  <textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)}
                    placeholder={id ? 'Apa yang perlu dilakukan pengguna?' : 'What does the user need to do?'}
                    style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }}/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <div>
                    <label style={lbl}>{id ? 'Tipe' : 'Type'}</label>
                    <select value={type} onChange={(e) => setType(e.target.value as QuestType)} style={inp}>
                      {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <small style={{ fontSize: 10, color: T.textDim }}>
                      {id ? 'Contoh' : 'Example'}: {TYPE_OPTIONS.find((o) => o.value === type)?.example}
                    </small>
                  </div>
                  <div>
                    <label style={lbl}>{id ? 'Label hadiah' : 'Reward label'}</label>
                    <input type="text" value={reward} onChange={(e) => setReward(e.target.value)}
                      placeholder="+50 pts" style={inp}/>
                  </div>
                  <div>
                    <label style={lbl}>{id ? 'Maks penyelesaian (0 = tak terbatas)' : 'Max completions (0 = unlimited)'}</label>
                    <input type="number" min="0" value={maxComps}
                      onChange={(e) => setMaxComps(e.target.value)} style={inp}/>
                  </div>
                </div>
                <button
                  type="button" onClick={handleCreate} disabled={busy}
                  style={{
                    padding: '12px 18px', borderRadius: 10, border: 'none', marginTop: 6,
                    background: !busy ? T.grad : T.surface2,
                    color: !busy ? '#0a0a14' : T.textDim,
                    fontWeight: 900, fontSize: 13, cursor: !busy ? 'pointer' : 'wait',
                    letterSpacing: 0.5,
                  }}>
                  {busy ? (id ? 'MENERBITKAN…' : 'PUBLISHING…') : (id ? 'TERBITKAN MISI' : 'PUBLISH QUEST')}
                </button>
                {error && (
                  <div style={{ fontSize: 12, color: '#f472b6' }}>{error}</div>
                )}
              </div>
            </section>

            {/* My quests */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{id ? 'Misi Saya' : 'My Quests'}</h2>
              {loading && <div style={{ color: T.textDim, fontSize: 13 }}>{id ? 'Memuat…' : 'Loading…'}</div>}
              {!loading && quests.length === 0 && (
                <div style={{ color: T.textDim, fontSize: 13 }}>{id ? 'Belum ada misi.' : 'No quests yet.'}</div>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {quests.map((q) => (
                  <div key={q.id} style={{
                    padding: 16, borderRadius: 12,
                    background: T.surface, border: `1px solid ${T.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{q.title}</div>
                      <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                        {q.type.toUpperCase()} · {id ? 'hadiah' : 'reward'}: {q.rewardLabel}
                      </div>
                    </div>
                    <button
                      type="button" onClick={() => openReview(q)}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        border: `1px solid ${T.border}`,
                        background: 'transparent', color: T.accent,
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>
                      {id ? 'TINJAU' : 'REVIEW'}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Review modal-ish */}
            {reviewQuest && (
              <section style={{
                padding: 22, borderRadius: 16,
                background: T.surface, border: `1px solid ${T.accent}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{reviewQuest.title}</h3>
                    <div style={{ fontSize: 11, color: T.textDim }}>
                      {completions.length} {id ? 'pengajuan' : 'submission(s)'}
                    </div>
                  </div>
                  <button
                    type="button" onClick={() => setReviewQuest(null)}
                    style={{
                      padding: '6px 12px', borderRadius: 8,
                      border: `1px solid ${T.border}`, background: 'transparent',
                      color: T.textDim, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>{id ? 'TUTUP' : 'CLOSE'}</button>
                </div>
                {completions.length === 0 && (
                  <div style={{ color: T.textDim, fontSize: 13 }}>{id ? 'Belum ada pengajuan.' : 'No submissions yet.'}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {completions.map((c) => (
                    <div key={c.wallet} style={{
                      padding: 12, borderRadius: 10,
                      background: T.surface2, border: `1px solid ${T.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {c.wallet.slice(0, 6)}…{c.wallet.slice(-4)}
                          <span style={{
                            marginLeft: 8, fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
                            padding: '2px 7px', borderRadius: 999,
                            background: c.status === 'approved' ? 'rgba(94,234,212,0.18)'
                                      : c.status === 'rejected' ? 'rgba(244,114,182,0.18)'
                                      : 'rgba(251,191,36,0.18)',
                            color: c.status === 'approved' ? '#5eead4'
                                  : c.status === 'rejected' ? '#f472b6'
                                  : '#fbbf24',
                          }}>{c.status.toUpperCase()}</span>
                        </div>
                        {c.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" disabled={reviewBusy === c.wallet}
                              onClick={() => handleReview(c.wallet, true)}
                              style={{ ...miniBtn, color: '#5eead4', borderColor: '#5eead4' }}>
                              {reviewBusy === c.wallet ? '…' : (id ? 'Setujui' : 'Approve')}
                            </button>
                            <button type="button" disabled={reviewBusy === c.wallet}
                              onClick={() => handleReview(c.wallet, false)}
                              style={{ ...miniBtn, color: '#f472b6', borderColor: '#f472b6' }}>
                              {id ? 'Tolak' : 'Reject'}
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, color: T.textDim, wordBreak: 'break-word' }}>
                        {id ? 'Bukti' : 'Proof'}: {c.proof}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

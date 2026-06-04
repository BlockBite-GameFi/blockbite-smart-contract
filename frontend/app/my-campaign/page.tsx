'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { T } from '@/lib/theme';
import { useApp } from '@/lib/useApp';

// ─── Mock stream lookup — replace with on-chain fetch in production ───────────
interface StreamInfo {
  pda: string;
  campaignName: string;
  tokenSymbol: string;
  participants: { address: string; allocated: number; distributionDate: string }[];
  gameGate: boolean;
  gameUnlocked: boolean;
  claimable: boolean;
}

function mockLookup(pda: string): StreamInfo | null {
  const trimmed = pda.trim();
  if (!trimmed) return null;
  return {
    pda: trimmed,
    campaignName: 'Token Distribution Campaign',
    tokenSymbol: 'BBT',
    participants: [
      { address: trimmed.slice(0, 8) + '…' + trimmed.slice(-6), allocated: 10_000, distributionDate: '2026-07-01 00:00 UTC' },
    ],
    gameGate: trimmed.length % 2 === 0,
    gameUnlocked: false,
    claimable: false,
  };
}

export default function MyCampaignPage() {
  const { lang } = useApp();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const [streamInput, setStreamInput] = useState('');
  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [lookupErr, setLookupErr] = useState('');
  const [gameUnlocked, setGameUnlocked] = useState(false);

  const id = lang === 'id';

  function handleLink() {
    setLookupErr('');
    const result = mockLookup(streamInput);
    if (!result) {
      setLookupErr(id ? 'Alamat stream tidak valid.' : 'Invalid stream address.');
      return;
    }
    setStream(result);
    setGameUnlocked(false);
  }

  const canClaim = stream && (!stream.gameGate || gameUnlocked);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.serif }}>
      <Navbar />

      <main style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(88px,12vw,108px) clamp(16px,5vw,40px) 80px' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase' }}>
            {id ? 'PORTAL PENERIMA TOKEN' : 'RECIPIENT PORTAL'}
          </div>
          <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(26px,5vw,38px)', fontWeight: 800, color: T.text, margin: '0 0 10px' }}>
            {id ? 'Kampanye Saya' : 'My Campaign'}
          </h1>
          <p style={{ fontSize: 13, color: T.textDim, maxWidth: 520, lineHeight: 1.7, margin: 0 }}>
            {id
              ? 'Hubungkan stream distribusi token untuk memantau alokasi dan menyelesaikan verifikasi.'
              : 'Link a token distribution stream to track your allocation and complete verification.'}
          </p>
        </div>

        {/* ── Wallet gate ── */}
        {!publicKey ? (
          <div style={{
            background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16,
            padding: '36px 28px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>◎</div>
            <div style={{ fontFamily: T.serif, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              {id ? 'Hubungkan Wallet' : 'Connect Your Wallet'}
            </div>
            <p style={{ fontSize: 13, color: T.textDim, marginBottom: 20 }}>
              {id
                ? 'Wallet diperlukan untuk melihat alokasi token kamu.'
                : 'A wallet is required to view your token allocation.'}
            </p>
            <button
              onClick={() => setVisible(true)}
              style={{
                padding: '11px 28px', borderRadius: 10,
                background: T.grad, color: '#fff', fontWeight: 700, fontSize: 14,
                border: 'none', cursor: 'pointer', fontFamily: T.serif,
              }}
            >
              {id ? 'Hubungkan Wallet' : 'Connect Wallet'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── Stream Linker ── */}
            <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '24px 24px' }}>
              <div style={{ fontFamily: T.serif, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                {id ? 'Hubungkan Stream' : 'Stream Linker'}
              </div>
              <p style={{ fontSize: 12.5, color: T.textDim, marginBottom: 16, margin: '0 0 16px' }}>
                {id
                  ? 'Masukkan alamat PDA stream untuk menghubungkan akun kamu ke kampanye tertentu.'
                  : 'Enter the stream PDA address to link your account to a specific campaign.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  value={streamInput}
                  onChange={e => setStreamInput(e.target.value)}
                  placeholder={id ? 'Alamat Stream Address (PDA)…' : 'Stream Address (PDA)…'}
                  style={{
                    flex: '1 1 300px', padding: '10px 14px', borderRadius: 10,
                    background: T.bg2, border: `1px solid ${lookupErr ? T.red : T.border}`,
                    color: T.text, fontSize: 13, fontFamily: T.mono, outline: 'none',
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleLink()}
                />
                <button
                  onClick={handleLink}
                  style={{
                    padding: '10px 22px', borderRadius: 10,
                    background: T.grad, color: '#fff', fontWeight: 700, fontSize: 13,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: T.serif,
                  }}
                >
                  {id ? 'Hubungkan →' : 'Link →'}
                </button>
              </div>
              {lookupErr && (
                <p style={{ fontSize: 12, color: T.red, marginTop: 8, margin: '8px 0 0' }}>{lookupErr}</p>
              )}
            </div>

            {/* ── Transparency Table + Actions ── */}
            {stream && (
              <>
                {/* Campaign info header */}
                <div style={{
                  background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 24px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
                      {id ? 'KAMPANYE TERHUBUNG' : 'LINKED CAMPAIGN'}
                    </div>
                    <div style={{ fontFamily: T.serif, fontSize: 17, fontWeight: 700, color: T.text }}>{stream.campaignName}</div>
                    <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 3, fontFamily: T.mono }}>{stream.pda}</div>
                  </div>
                  <button
                    onClick={() => { setStream(null); setStreamInput(''); }}
                    style={{
                      padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: 'transparent', border: `1px solid ${T.border}`,
                      color: T.textDim, cursor: 'pointer',
                    }}
                  >
                    {id ? 'Putuskan' : 'Unlink'}
                  </button>
                </div>

                {/* Transparency Table */}
                <div style={{ background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontFamily: T.serif, fontSize: 14, fontWeight: 700, color: T.text }}>
                      {id ? 'Detail Alokasi' : 'Allocation Details'}
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: T.bg2 }}>
                          {[
                            id ? 'Alamat Peserta'     : 'Participant Address',
                            id ? 'Token Dialokasikan' : 'Token Allocated',
                            id ? 'Tanggal & Waktu Distribusi' : 'Distribution Date & Time',
                          ].map(h => (
                            <th key={h} style={{
                              padding: '10px 16px', textAlign: 'left',
                              color: T.textDim, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                              fontSize: 10, whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stream.participants.map((p, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                            <td style={{ padding: '12px 16px', fontFamily: T.mono, color: T.text, fontSize: 12 }}>{p.address}</td>
                            <td style={{ padding: '12px 16px', color: T.green, fontWeight: 700, fontFamily: T.mono }}>
                              {p.allocated.toLocaleString()} {stream.tokenSymbol}
                            </td>
                            <td style={{ padding: '12px 16px', color: T.textDim }}>{p.distributionDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Action Footer Panel — Verify (bottom-left) | Claim (bottom-right) */}
                <div style={{
                  background: T.bg1, border: `1px solid ${T.border}`, borderRadius: 16,
                  padding: '16px 24px 20px',
                }}>
                  {/* Status line */}
                  <div style={{ fontSize: 12.5, color: T.textDim, lineHeight: 1.6, marginBottom: 14 }}>
                    {stream.gameGate && !gameUnlocked
                      ? (id
                          ? '🔒 Stream ini membutuhkan verifikasi game. Mainkan BlockBlast hingga target level tercapai, lalu klik Verifikasi di dalam game.'
                          : '🔒 This stream requires game verification. Play BlockBlast until the target level is reached, then click Verify inside the game.')
                      : (id
                          ? '✅ Token kamu siap untuk diklaim sesuai jadwal distribusi.'
                          : '✅ Your tokens are ready to claim according to the distribution schedule.')}
                  </div>
                  {/* Button row: Verify LEFT — Claim RIGHT */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {/* Bottom-left: Verify Game — only visible when game gate is active and not yet unlocked */}
                    <div>
                      {stream.gameGate && !gameUnlocked && (
                        <Link
                          href="/game"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '11px 22px', borderRadius: 10,
                            background: `color-mix(in srgb, ${T.blue} 14%, transparent)`,
                            border: `1.5px solid color-mix(in srgb, ${T.blue} 40%, transparent)`,
                            color: T.blue, fontWeight: 700, fontSize: 13,
                            textDecoration: 'none', fontFamily: T.serif, whiteSpace: 'nowrap',
                          }}
                        >
                          ▶ {id ? 'Verifikasi Game' : 'Verify Game'}
                        </Link>
                      )}
                    </div>
                    {/* Bottom-right: Claim / Withdraw — active when direct claim or game is unlocked */}
                    <button
                      disabled={!canClaim}
                      style={{
                        padding: '11px 26px', borderRadius: 10,
                        background: canClaim ? T.grad : 'rgba(255,255,255,.04)',
                        border: `1.5px solid ${canClaim ? T.accent : T.border}`,
                        color: canClaim ? '#fff' : T.textDim,
                        fontWeight: 700, fontSize: 13,
                        cursor: canClaim ? 'pointer' : 'not-allowed',
                        fontFamily: T.serif, whiteSpace: 'nowrap',
                        opacity: canClaim ? 1 : 0.5,
                        boxShadow: canClaim ? `0 0 20px ${T.accentA4}` : 'none',
                        transition: 'all .2s',
                      }}
                    >
                      ◎ {id ? 'Klaim / Tarik Token' : 'Claim / Withdraw'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { TICKET_PACKAGES } from '@/lib/game/constants';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { purchaseTickets, getUsdcBalance, InsufficientFundsError, NoTokenAccountError } from '@/lib/solana/usdc';
import { autoconvertSolForUsdc, SwapUnavailableError, SwapFailedError } from '@/lib/solana/jupiter-swap';
import { explorerTx, IS_DEVNET } from '@/lib/solana/config';
import { useApp } from '@/lib/useApp';
import { T } from '@/lib/theme';

const TIER_COLORS: Record<string, { from: string; to: string; glow: string }> = {
  starter:   { from: '#444466', to: '#333355', glow: 'rgba(100,100,200,0.3)' },
  explorer:  { from: '#00C3FF', to: '#0040FF', glow: 'rgba(0,195,255,0.3)' },
  warrior:   { from: '#00FF88', to: '#00AA44', glow: 'rgba(0,255,136,0.3)' },
  hunter:    { from: '#FFD700', to: '#FF8C00', glow: 'rgba(255,215,0,0.3)' },
  champion:  { from: '#AA00FF', to: '#5500AA', glow: 'rgba(170,0,255,0.3)' },
  legendary: { from: '#FF00FF', to: '#AA0066', glow: 'rgba(255,0,255,0.35)' },
  godmode:   { from: '#00F5FF', to: '#FF00FF', glow: 'rgba(0,245,255,0.4)' },
};

const TIER_ICONS: Record<string, string> = {
  starter: '', explorer: '', warrior: '',
  hunter: '', champion: '', legendary: '', godmode: '',
};

const SHOP_TX = {
  en: {
    shopKicker:     'BLOCKBITE SHOP',
    pageTitle:      'Tickets · USDC',
    pageDesc:       '70% prize pool · 15% team · 10% dev · 5% referral · split on-chain',
    subDesc:        'Buy tickets to compete on the leaderboard. More tickets = more chances to top the board.',
    ticketsBal:     'Tickets',
    usdcBal:        'USDC Balance',
    devnet:         'DEVNET —',
    devnetLink:     'Get test USDC',
    purchaseOk:     'Purchase confirmed! Tickets added.',
    viewExplorer:   'View on Solana Explorer',
    saleBanner:     'WEEKEND WARRIORS SALE',
    saleDesc:       'Extra 5% off all packages this Friday & Saturday · Use referral for additional discount',
    popular:        'POPULAR',
    bestValue:      'BEST VALUE',
    tickets:        'tickets',
    toPrizePool:    'to prize pool',
    processing:     'Processing...',
    buyTickets: (n: number) => `Buy ${n} Ticket${n > 1 ? 's' : ''}`,
    noWallet:       'Please connect your wallet first.',
    notEnoughUsdc: (have: number, need: number) =>
      `Not enough USDC. You have ${have.toFixed(2)} USDC, need ${need.toFixed(2)} USDC.`,
    notEnoughDevnet: 'Get devnet USDC from faucet.solana.com.',
    noTokenAcct:    'No USDC account found.',
    noTokenDevnet:  'Airdrop devnet USDC first at faucet.solana.com.',
    txFailed:       'Transaction failed',
    infoCards: [
      { title: 'Secure Payments',  desc: 'All transactions are processed on-chain via Solana. We never hold your funds.' },
      { title: 'No Expiry',        desc: 'Tickets never expire. Buy now, play whenever you want.' },
      { title: 'Referral Rewards', desc: 'Share your referral link and earn 5% of every ticket your friends buy — forever.' },
    ],
  },
  id: {
    shopKicker:     'TOKO BLOCKBITE',
    pageTitle:      'Tiket · USDC',
    pageDesc:       '70% kolam hadiah · 15% tim · 10% dev · 5% referral · dibagi on-chain',
    subDesc:        'Beli tiket untuk bersaing di papan peringkat. Lebih banyak tiket = lebih banyak kesempatan memimpin.',
    ticketsBal:     'Tiket',
    usdcBal:        'Saldo USDC',
    devnet:         'DEVNET —',
    devnetLink:     'Dapatkan USDC uji coba',
    purchaseOk:     'Pembelian dikonfirmasi! Tiket ditambahkan.',
    viewExplorer:   'Lihat di Solana Explorer',
    saleBanner:     'DISKON AKHIR PEKAN',
    saleDesc:       'Diskon 5% untuk semua paket Jumat & Sabtu · Gunakan referral untuk diskon tambahan',
    popular:        'POPULER',
    bestValue:      'TERBAIK',
    tickets:        'tiket',
    toPrizePool:    'ke kolam hadiah',
    processing:     'Memproses...',
    buyTickets: (n: number) => `Beli ${n} Tiket`,
    noWallet:       'Hubungkan wallet Anda terlebih dahulu.',
    notEnoughUsdc: (have: number, need: number) =>
      `USDC tidak cukup. Anda punya ${have.toFixed(2)} USDC, perlu ${need.toFixed(2)} USDC.`,
    notEnoughDevnet: 'Dapatkan USDC devnet di faucet.solana.com.',
    noTokenAcct:    'Akun USDC tidak ditemukan.',
    noTokenDevnet:  'Airdrop USDC devnet dulu di faucet.solana.com.',
    txFailed:       'Transaksi gagal',
    infoCards: [
      { title: 'Pembayaran Aman',     desc: 'Semua transaksi diproses on-chain via Solana. Kami tidak pernah menyimpan dana Anda.' },
      { title: 'Tidak Kadaluarsa',    desc: 'Tiket tidak pernah kadaluarsa. Beli sekarang, main kapan saja.' },
      { title: 'Hadiah Referral',     desc: 'Bagikan tautan referral Anda dan dapatkan 5% dari setiap tiket yang dibeli teman Anda — selamanya.' },
    ],
  },
};

export default function ShopPage() {
  const { lang } = useApp();
  const TX = SHOP_TX[lang];

  const [hoveredPkg, setHoveredPkg]   = useState<string | null>(null);
  const [buying, setBuying]           = useState<string | null>(null);
  const [txSig, setTxSig]             = useState<string | null>(null);
  const [txError, setTxError]         = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [ticketBalance, setTicketBalance] = useState<number>(0);

  useEffect(() => {
    if (publicKey) {
      const saved = localStorage.getItem(`tickets_${publicKey.toBase58()}`);
      if (saved) setTicketBalance(parseInt(saved));
    }
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey || !connection) return;
    getUsdcBalance(connection, publicKey).then(setUsdcBalance);
  }, [publicKey, connection]);

  const handleBuy = useCallback(async (pkg: typeof TICKET_PACKAGES[0]) => {
    if (!connected || !publicKey) {
      setTxError(TX.noWallet);
      return;
    }
    setTxError(null);
    setTxSig(null);
    setBuying(pkg.id);

    try {
      const currentUsdc = (usdcBalance ?? 0);
      const deficit = pkg.price - currentUsdc;
      if (deficit > 0 && !IS_DEVNET) {
        try {
          const swapSig = await autoconvertSolForUsdc({
            connection,
            payer: publicKey,
            usdcDeficit: deficit + 0.1,
            sendTransaction: sendTransaction as Parameters<typeof autoconvertSolForUsdc>[0]['sendTransaction'],
          });
          if (swapSig) {
            const fresh = await getUsdcBalance(connection, publicKey);
            setUsdcBalance(fresh);
          }
        } catch (swapErr) {
          if (swapErr instanceof SwapUnavailableError) {
            // Expected on devnet — silent fallthrough.
          } else if (swapErr instanceof SwapFailedError) {
            setTxError(swapErr.message);
            setBuying(null);
            return;
          } else {
            throw swapErr;
          }
        }
      }

      const sig = await purchaseTickets({
        connection,
        payer: publicKey,
        usdcAmount: pkg.price,
        sendTransaction,
      });

      const newBal = ticketBalance + pkg.tickets;
      setTicketBalance(newBal);
      localStorage.setItem(`tickets_${publicKey.toBase58()}`, newBal.toString());
      setTxSig(sig);

      const newUsdc = await getUsdcBalance(connection, publicKey);
      setUsdcBalance(newUsdc);
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        setTxError(`${TX.notEnoughUsdc(err.have, err.need)}${IS_DEVNET ? ` ${TX.notEnoughDevnet}` : ''}`);
      } else if (err instanceof NoTokenAccountError) {
        setTxError(`${TX.noTokenAcct}${IS_DEVNET ? ` ${TX.noTokenDevnet}` : ''}`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setTxError(`${TX.txFailed}: ${msg}`);
      }
    } finally {
      setBuying(null);
    }
  }, [connected, publicKey, connection, sendTransaction, ticketBalance, TX]);

  return (
    <>
      <Navbar />
      <main style={{ minHeight: '100vh', paddingBottom: 80, background: T.bg, color: T.text }}>
        {/* Page header band */}
        <div style={{ padding: '80px 24px 32px', background: `linear-gradient(180deg, ${T.bg1} 0%, ${T.bg} 100%)`, borderBottom: `1px solid ${T.border}` }}>
          <div className="container">
            <div style={{ fontSize: 11, letterSpacing: 2, color: T.accent, fontWeight: 800, marginBottom: 6 }}>{TX.shopKicker}</div>
            <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(26px, 5vw, 42px)', fontWeight: 900, marginBottom: 8, letterSpacing: '-0.5px' }}>
              {TX.pageTitle}
            </h1>
            <p style={{ fontFamily: T.serif, fontSize: 13, color: T.textDim, marginBottom: 0 }}>
              {TX.pageDesc}
            </p>
          </div>
        </div>
        <div className="container" style={{ paddingTop: 32 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <p style={{ fontFamily: T.serif, fontSize: 15, color: T.textDim, maxWidth: 500, margin: '0 auto 24px', lineHeight: 1.6 }}>
              {TX.subDesc}
            </p>
          </div>

          {/* Wallet USDC balance + network badge */}
          {connected && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(0,245,255,0.07)', border: '1px solid rgba(0,245,255,0.2)', borderRadius: 10, padding: '8px 20px', fontSize: 13, color: T.textDim }}>
                {TX.ticketsBal}: <b style={{ color: '#00F5FF' }}>{ticketBalance}</b>
              </div>
              <div style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 10, padding: '8px 20px', fontSize: 13, color: T.textDim }}>
                {TX.usdcBal}: <b style={{ color: '#FFD700' }}>{usdcBalance !== null ? usdcBalance.toFixed(2) : '...'}</b>
              </div>
              {IS_DEVNET && (
                <div style={{ background: 'rgba(153,69,255,0.1)', border: '1px solid rgba(153,69,255,0.3)', borderRadius: 10, padding: '8px 20px', fontSize: 12, color: '#CC88FF' }}>
                  {TX.devnet}{' '}<a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" style={{ color: '#9945FF' }}>{TX.devnetLink}</a>
                </div>
              )}
            </div>
          )}

          {/* Tx feedback */}
          {txSig && (
            <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 10, padding: '12px 20px', marginBottom: 20, textAlign: 'center', fontSize: 14, color: '#00FF88' }}>
              {TX.purchaseOk}{' '}
              <a href={explorerTx(txSig)} target="_blank" rel="noopener noreferrer" style={{ color: '#00F5FF', textDecoration: 'underline' }}>{TX.viewExplorer}</a>
            </div>
          )}
          {txError && (
            <div style={{ background: 'rgba(255,34,68,0.08)', border: '1px solid rgba(255,34,68,0.25)', borderRadius: 10, padding: '12px 20px', marginBottom: 20, textAlign: 'center', fontSize: 14, color: '#FF5577' }}>
              {txError}
            </div>
          )}

          {/* Flash sale banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,140,0,0.08))',
            border: `1px solid ${T.border}`,
            borderRadius: 12, padding: '12px 20px', marginBottom: 32,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: '#FFD700' }}>
                {TX.saleBanner}
              </span>
              <span style={{ fontFamily: T.serif, fontSize: 13, color: T.textDim, marginLeft: 12 }}>
                {TX.saleDesc}
              </span>
            </div>
          </div>

          {/* Packages grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20, marginBottom: 48,
          }}>
            {TICKET_PACKAGES.map(pkg => {
              const colors = TIER_COLORS[pkg.id];
              const isGodmode = pkg.id === 'godmode';
              const isHovered = hoveredPkg === pkg.id;
              const isBuying = buying === pkg.id;

              return (
                <div
                  key={pkg.id}
                  id={`shop-pkg-${pkg.id}`}
                  onMouseEnter={() => setHoveredPkg(pkg.id)}
                  onMouseLeave={() => setHoveredPkg(null)}
                  style={{
                    position: 'relative',
                    background: isGodmode
                      ? undefined
                      : isHovered
                        ? `color-mix(in srgb, ${T.surface} 90%, ${colors.from} 10%)`
                        : T.surface,
                    backdropFilter: 'blur(16px)',
                    border: isGodmode
                      ? `2px solid transparent`
                      : isHovered
                        ? `1px solid ${colors.from}60`
                        : `1px solid ${T.border}`,
                    backgroundImage: isGodmode
                      ? `linear-gradient(${T.surface}, ${T.surface}), linear-gradient(135deg, ${colors.from}, ${colors.to})`
                      : undefined,
                    backgroundOrigin: isGodmode ? 'border-box' : undefined,
                    backgroundClip: isGodmode ? 'padding-box, border-box' : undefined,
                    borderRadius: 20, padding: '28px 24px',
                    transition: 'all 0.25s ease',
                    transform: isHovered ? 'translateY(-6px)' : 'none',
                    boxShadow: isHovered
                      ? `0 20px 60px rgba(0,0,0,0.2), 0 0 40px ${colors.glow}`
                      : `0 4px 20px rgba(0,0,0,0.1)`,
                    cursor: 'pointer', overflow: 'hidden',
                  }}
                >
                  {/* Popular badge */}
                  {pkg.id === 'hunter' && (
                    <div style={{
                      position: 'absolute', top: 16, right: 16,
                      background: 'linear-gradient(135deg, #FFD700, #FF8C00)',
                      color: '#000', fontSize: 10, fontWeight: 700,
                      fontFamily: T.mono, padding: '3px 10px', borderRadius: 99, letterSpacing: '0.06em',
                    }}>
                      {TX.popular}
                    </div>
                  )}

                  {isGodmode && (
                    <div style={{
                      position: 'absolute', top: 16, right: 16,
                      background: 'linear-gradient(135deg, #00F5FF, #FF00FF)',
                      color: '#000', fontSize: 10, fontWeight: 700,
                      fontFamily: T.mono, padding: '3px 10px', borderRadius: 99, letterSpacing: '0.06em',
                    }}>
                      {TX.bestValue}
                    </div>
                  )}

                  {/* Icon + Name */}
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{TIER_ICONS[pkg.id]}</div>
                  <div style={{
                    fontFamily: T.mono, fontSize: 16, fontWeight: 800,
                    background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                    marginBottom: 4,
                  }}>
                    {pkg.name.toUpperCase()}
                  </div>

                  {/* Ticket count */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                    <span style={{ fontFamily: T.mono, fontSize: 40, fontWeight: 900, color: T.text, lineHeight: 1 }}>{pkg.tickets}</span>
                    <span style={{ fontFamily: T.serif, fontSize: 14, color: T.textDim }}>{TX.tickets}</span>
                    {pkg.discount > 0 && (
                      <span style={{
                        fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: '#00FF88',
                        background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.2)',
                        borderRadius: 99, padding: '2px 8px', marginLeft: 4,
                      }}>
                        -{pkg.discount}%
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 16, padding: '10px 0',
                    borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
                  }}>
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: 24, fontWeight: 900, color: T.text }}>
                        {pkg.price} <span style={{ fontSize: 14, color: T.textDim }}>USDC</span>
                      </div>
                      <div style={{ fontFamily: T.serif, fontSize: 12, color: T.textDim }}>
                        {pkg.pricePerTicket.toFixed(2)} USDC/{TX.tickets}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: '#00FF88' }}>
                        +{(pkg.price * 0.7).toFixed(2)}
                      </div>
                      <div style={{ fontFamily: T.serif, fontSize: 10, color: T.textDim }}>
                        {TX.toPrizePool}
                      </div>
                    </div>
                  </div>

                  {/* Bonuses */}
                  {pkg.bonuses.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      {pkg.bonuses.map(bonus => (
                        <div key={bonus} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ color: colors.from, fontSize: 13 }}>-</span>
                          <span style={{ fontFamily: T.serif, fontSize: 13, color: T.textDim }}>{bonus}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Buy button */}
                  <button
                    type="button"
                    onClick={() => handleBuy(pkg)}
                    disabled={!!buying}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 10,
                      background: isBuying
                        ? 'rgba(0,245,255,0.1)'
                        : `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                      color: isGodmode || pkg.id === 'explorer' || pkg.id === 'starter' ? '#000' : '#fff',
                      fontFamily: T.mono, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
                      border: 'none', cursor: buying ? 'wait' : 'pointer', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {isBuying ? (
                      <>{<span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}{TX.processing}</>
                    ) : (
                      TX.buyTickets(pkg.tickets)
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Info section */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {TX.infoCards.map(item => (
              <div key={item.title} style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12,
              }}>
                <div>
                  <div style={{ fontFamily: T.serif, fontWeight: 700, color: T.text, marginBottom: 4, fontSize: 14 }}>{item.title}</div>
                  <div style={{ fontFamily: T.serif, fontSize: 13, color: T.textDim, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

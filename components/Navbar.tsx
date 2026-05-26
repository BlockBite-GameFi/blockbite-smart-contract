'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import styles from './Navbar.module.css';
import { useApp } from '@/lib/useApp';

const CustomWalletButton = dynamic(
  () => import('./CustomWalletButton'),
  { ssr: false, loading: () => <div className={styles.walletPlaceholder} /> }
);

// ─── Design tokens — matches site-wide Space Grotesk theme ───────────────────
const DS = {
  accent:   '#a78bff',
  accentDk: '#5e35d4',
  border:   'rgba(167,139,255,.13)',
  bg1:      '#09071a',
  muted:    'rgba(232,225,248,.5)',
  font:     "'Space Grotesk', system-ui, sans-serif",
};

const TDP_LINKS = [
  { name: 'Streams Dashboard', href: '/streams',     desc: 'All active vesting streams',        icon: '◈' },
  { name: 'Create Stream',     href: '/streams/new', desc: 'Lock tokens into a PDA vault',      icon: '＋' },
  { name: 'Claim Portal',      href: '/claim',       desc: 'Withdraw vested tokens',            icon: '◎' },
  { name: 'Milestones',        href: '/milestones',  desc: 'Verify milestone unlocks on-chain', icon: '◉' },
  { name: 'Calculator',        href: '/calculator',  desc: 'Model your vesting schedule',       icon: '∿' },
  { name: 'Analytics',         href: '/analytics',   desc: 'Protocol-wide on-chain metrics',    icon: '✦' },
  { name: 'Audit Trail',       href: '/audit',       desc: 'Immutable event log on Solana',     icon: '◇' },
  { name: 'Protocol',          href: '/protocol',    desc: 'TDP overview & comparison',         icon: '⬡' },
  { name: 'Partners',          href: '/partners',    desc: 'Partnership program & tiers',       icon: '◆' },
];

const NAV_LINKS = [
  { name: 'PRODUCT',      href: '/protocol' },
  { name: 'HOW IT WORKS', href: '/how-to-play' },
  { name: 'GAME',         href: '/game' },
  { name: 'WAITLIST',     href: '/waitlist' },
] as const;

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  useApp(); // keep context alive for child components

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.inner}>

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <Link href="/" className={styles.logo}>
          <Image
            src="/logo.png"
            alt="BlockBite"
            width={38}
            height={38}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            priority
          />
          <div className={styles.logoText}>
            BLOCK<span className={styles.logoAccent}>BITE</span>
          </div>
        </Link>

        {/* ── Desktop links — Veztra clean style ────────────────────────── */}
        <ul className={styles.links}>
          {NAV_LINKS.map((link) => (
            <li key={link.name}>
              <Link
                href={link.href}
                className={`${styles.link} ${
                  (link.href === '/game' && (pathname === '/game' || pathname?.startsWith('/tutorial')))
                  || (link.href !== '/game' && (pathname === link.href || pathname?.startsWith(link.href + '/')))
                    ? styles.active : ''
                }`}
                style={{ fontFamily: DS.font }}
              >
                {link.name}
              </Link>
            </li>
          ))}
        </ul>

        {/* ── Right controls — Veztra clean: Launch App + Wallet only ── */}
        <div className={styles.right}>
          <CustomWalletButton />

          {/* Launch App primary CTA — rounded-full like Veztra */}
          <Link href="/streams/new" style={{
            padding: '8px 20px', borderRadius: 9999,
            background: `linear-gradient(90deg, #9945FF, #00C2FF)`,
            color: '#fff', fontWeight: 700, fontSize: 13,
            textDecoration: 'none', letterSpacing: '.03em',
            fontFamily: DS.font, whiteSpace: 'nowrap',
            boxShadow: '0 0 20px rgba(153,69,255,.35)',
          }}>
            Launch App
          </Link>

          <button
            type="button"
            className={styles.menuToggle}
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            <span className={menuOpen ? styles.menuOpen : ''} />
            <span className={menuOpen ? styles.menuOpen : ''} />
            <span className={menuOpen ? styles.menuOpen : ''} />
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ──────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className={styles.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className={`${styles.mobileLink} ${pathname === link.href || pathname?.startsWith(link.href + '/') ? styles.active : ''}`}
              onClick={() => setMenuOpen(false)}
              style={{ fontFamily: DS.font }}
            >
              <span className={styles.mobileLinkInner}>{link.name}</span>
            </Link>
          ))}

          <div className={styles.mobileWalletWrap}>
            <CustomWalletButton />
          </div>
        </div>
      )}
    </nav>
  );
}

'use client';
/**
 * WalletTracker — fires once per session whenever a Solana wallet is connected.
 * Must be rendered inside WalletProvider (i.e. inside AppWalletProvider).
 *
 * Privacy: only the first 6 + last 4 chars of the address are stored
 * (e.g. "Ab3xYz…kR9q"). Full address is never logged.
 */
import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePathname } from 'next/navigation';

export function WalletTracker() {
  const { connected, publicKey, wallet } = useWallet();
  const pathname = usePathname();
  const firedRef = useRef<string | null>(null); // track last fired address so we fire once per address per session

  useEffect(() => {
    if (!connected || !publicKey) return;

    const address = publicKey.toBase58();
    const sessionKey = `bb_wc_${address.slice(0, 8)}`;

    // Fire only once per address per browser session
    if (firedRef.current === address) return;
    if (typeof sessionStorage !== 'undefined') {
      try {
        if (sessionStorage.getItem(sessionKey)) return;
        sessionStorage.setItem(sessionKey, '1');
      } catch { /* ignore */ }
    }
    firedRef.current = address;

    // Anonymised address: first 6 + "…" + last 4
    const anon = `${address.slice(0, 6)}…${address.slice(-4)}`;

    fetch('/api/wallet-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anon,
        walletName: wallet?.adapter?.name ?? 'unknown',
        path: pathname,
      }),
    }).catch(() => {}); // fire-and-forget, never crash the page
  }, [connected, publicKey, wallet, pathname]);

  return null;
}

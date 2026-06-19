'use client';
import { createContext, useContext, ReactNode } from 'react';

export type Lang = 'en' | 'id';
export type Theme = 'dark' | 'light';

const DICT_EN: Record<string, string> = {
  nav_home: 'Home', nav_play: 'Play', nav_map: 'Map',
  nav_shop: 'Shop', nav_leader: 'Leaderboard', nav_profile: 'Profile',
  nav_admin: 'Admin', nav_history: 'History', nav_claim: 'Claim',
  settings_title: 'Settings', language: 'Language', theme: 'Theme',
  dark: 'Dark', light: 'Light',
  sound: 'Sound Effects', music: 'Background Music',
  motion: 'Reduce Motion', notif: 'Notifications',
  rpc: 'RPC ENDPOINT', disconnect: 'Disconnect Wallet',
  connect: 'Connect Wallet',
  tickets: 'Tickets', level: 'Level', claimed: 'Claimed', vault: 'Vault',
  no_data: 'No data', backend_off: 'Backend offline',
  empty_lb: 'No entries yet. Connect wallet to appear.',
  empty_hist: 'No history yet.',
  nav_quests: 'Quests', nav_season: 'Season Pass',
  nav_friends: 'Friends', nav_daily: 'Daily Login',
  join_waitlist: 'Join Waitlist',
  waitlist_note: 'No spam. Unsubscribe anytime.',
  waitlist_success: "You're on the list! We'll notify you when BlockBite launches.",
  /* ── Navbar links & CTAs ── */
  nav_product:       'PRODUCT',
  nav_how_it_works:  'HOW IT WORKS',
  nav_token_streams: 'TOKEN STREAMS',
  nav_play_game:     'PLAY GAME',
  nav_waitlist:      'WAITLIST',
  nav_faq:           'FAQ',
  nav_demo:          'DEMO',
  nav_my_campaign:   'MY CAMPAIGN',
  nav_back:          '← Home',
  cta_play:         '▶ Play Game',
  cta_launch:       'Launch App',
  /* ── Theme toggle labels (kept for backward compat; no UI uses them) ── */
  theme_to_light: 'Switch to Light Mode',
  theme_to_dark:  'Switch to Dark Mode',
};

type AppCtx = {
  lang: Lang;
  theme: Theme;
  t: (k: string) => string;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <Ctx.Provider value={{
      lang: 'en',
      theme: 'dark',
      t: (k) => DICT_EN[k] ?? k,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be inside AppProvider');
  return c;
};

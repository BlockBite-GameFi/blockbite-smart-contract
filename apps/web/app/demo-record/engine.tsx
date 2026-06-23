'use client';

/**
 * engine.tsx — Autoplay walkthrough engine for the screen-record demo.
 *
 * Provides a synthetic, natural-feeling "human" cursor that glides between
 * registered DOM targets with easing, performs click ripples, types into
 * fields character-by-character, and scrolls the content pane — all driven by
 * an async script. Nothing here touches the wallet or RPC; it is a pure
 * presentation layer so the recording is deterministic and offline.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ── easing ──────────────────────────────────────────────────────────────────
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Pt = { x: number; y: number };

interface EngineApi {
  registerTarget: (name: string, el: HTMLElement | null) => void;
  getEl: (name: string) => HTMLElement | null;
}
const EngineCtx = createContext<EngineApi | null>(null);
export const useEngine = () => {
  const ctx = useContext(EngineCtx);
  if (!ctx) throw new Error('useEngine outside provider');
  return ctx;
};

export interface Cursor {
  /** Glide the cursor to the center of a registered target. */
  moveTo: (name: string, opts?: { dur?: number; offX?: number; offY?: number }) => Promise<void>;
  /** Glide to absolute viewport coordinates. */
  moveToXY: (x: number, y: number, dur?: number) => Promise<void>;
  /** Visual click ripple at current position. */
  click: () => Promise<void>;
  /** Move to a target then click it. */
  clickOn: (name: string, opts?: { dur?: number; offX?: number; offY?: number }) => Promise<void>;
  /** Type text into a controlled field via its setter, char-by-char. */
  type: (setter: (v: string) => void, text: string, opts?: { cps?: number; from?: string }) => Promise<void>;
  /** Animate a numeric slider value from current to target. */
  slide: (setter: (n: number) => void, from: number, to: number, dur?: number) => Promise<void>;
  /** Smoothly scroll the scroll container to a y offset. */
  scrollTo: (y: number, dur?: number) => Promise<void>;
  /** Scroll a registered target into comfortable view. */
  scrollToTarget: (name: string, dur?: number) => Promise<void>;
  /** Move the cursor to a descendant (querySelector) of a registered target. */
  moveInside: (name: string, selector: string, dur?: number) => Promise<void>;
  /** Move to a descendant of a registered target, then click it. */
  clickInside: (name: string, selector: string, dur?: number) => Promise<void>;
}

export function DemoEngine({
  scrollRef,
  children,
  script,
}: {
  scrollRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  script: (c: Cursor) => Promise<void>;
}) {
  const targets = useRef<Map<string, HTMLElement>>(new Map());
  const [cursor, setCursor] = useState<Pt>({ x: 960, y: 560 });
  const [pressed, setPressed] = useState(false);
  const [ripple, setRipple] = useState<Pt | null>(null);
  const posRef = useRef<Pt>({ x: 960, y: 560 });

  const registerTarget = useCallback((name: string, el: HTMLElement | null) => {
    if (el) targets.current.set(name, el);
    else targets.current.delete(name);
  }, []);
  const getEl = useCallback((name: string) => targets.current.get(name) ?? null, []);

  const setPos = (p: Pt) => { posRef.current = p; setCursor(p); };

  const tween = (from: number, to: number, dur: number, ease: (t: number) => number, onStep: (v: number) => void) =>
    new Promise<void>((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        onStep(from + (to - from) * ease(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

  const centerOf = (name: string, offX = 0, offY = 0): Pt | null => {
    const el = targets.current.get(name);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 + offX, y: r.top + r.height / 2 + offY };
  };

  const cursorApi: Cursor = {
    moveToXY: async (x, y, dur = 650) => {
      const from = { ...posRef.current };
      await tween(0, 1, dur, easeInOut, (k) => setPos({ x: from.x + (x - from.x) * k, y: from.y + (y - from.y) * k }));
    },
    moveTo: async (name, opts = {}) => {
      const p = centerOf(name, opts.offX, opts.offY);
      if (!p) return;
      await cursorApi.moveToXY(p.x, p.y, opts.dur ?? 650);
    },
    click: async () => {
      setPressed(true);
      await wait(90);
      setRipple({ ...posRef.current });
      setPressed(false);
      await wait(280);
      setRipple(null);
    },
    clickOn: async (name, opts = {}) => {
      await cursorApi.moveTo(name, opts);
      await wait(120);
      await cursorApi.click();
    },
    type: async (setter, text, opts = {}) => {
      const cps = opts.cps ?? 22;
      let cur = opts.from ?? '';
      for (const ch of text) {
        cur += ch;
        setter(cur);
        await wait(1000 / cps + (Math.random() * 36 - 12));
      }
    },
    slide: async (setter, from, to, dur = 900) => {
      await tween(from, to, dur, easeOut, (v) => setter(Math.round(v)));
    },
    scrollTo: async (y, dur = 700) => {
      const el = scrollRef.current;
      if (!el) return;
      const from = el.scrollTop;
      await tween(from, y, dur, easeInOut, (v) => { el.scrollTop = v; });
    },
    scrollToTarget: async (name, dur = 700) => {
      const el = targets.current.get(name);
      const sc = scrollRef.current;
      if (!el || !sc) return;
      const r = el.getBoundingClientRect();
      const scRect = sc.getBoundingClientRect();
      const target = sc.scrollTop + (r.top - scRect.top) - scRect.height * 0.32;
      await cursorApi.scrollTo(Math.max(0, target), dur);
    },
    moveInside: async (name, selector, dur = 650) => {
      const host = targets.current.get(name);
      const el = host?.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      await cursorApi.moveToXY(r.left + r.width / 2, r.top + r.height / 2, dur);
    },
    clickInside: async (name, selector, dur = 650) => {
      await cursorApi.moveInside(name, selector, dur);
      await wait(120);
      await cursorApi.click();
    },
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      await wait(700);
      try { await script(cursorApi); } catch (e) { /* eslint-disable-line */ console.error('demo script error', e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EngineCtx.Provider value={{ registerTarget, getEl }}>
      {children}
      {/* Click ripple */}
      {ripple && (
        <div style={{
          position: 'fixed', left: ripple.x, top: ripple.y, width: 8, height: 8,
          marginLeft: -4, marginTop: -4, borderRadius: '50%', pointerEvents: 'none', zIndex: 99998,
          background: 'rgba(153,69,255,.5)', animation: 'demoRipple .42s ease-out forwards',
        }} />
      )}
      {/* Synthetic cursor */}
      <div style={{
        position: 'fixed', left: cursor.x, top: cursor.y, zIndex: 99999, pointerEvents: 'none',
        transform: `translate(-3px,-2px) scale(${pressed ? 0.82 : 1})`, transition: 'transform .09s ease-out',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.55))',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M5 3l5.5 16.5 2.3-6.7 6.7-2.3L5 3z" fill="#fff" stroke="#1a1320" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </div>
      <style>{`
        @keyframes demoRipple { 0%{transform:scale(1);opacity:.85} 100%{transform:scale(9);opacity:0} }
      `}</style>
    </EngineCtx.Provider>
  );
}

/** Attach this to any element you want the cursor to be able to target. */
export function Target({ name, children, style }: { name: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const { registerTarget } = useEngine();
  return (
    <div ref={(el) => registerTarget(name, el)} style={style}>
      {children}
    </div>
  );
}

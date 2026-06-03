import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont();

/* ── Brand palette (mirror of app DS in app/page.tsx) ───────────────── */
const C = {
  void: "#03000A",
  bg: "#0A0714",
  card: "#13101F",
  cardHi: "#1A1530",
  purple: "#9945FF",
  purpleDk: "#7733CC",
  green: "#14F195",
  blue: "#00C2FF",
  gold: "#F5C66A",
  text: "#FFFFFF",
  muted: "rgba(176,170,206,0.82)",
  faint: "rgba(176,170,206,0.5)",
  border: "rgba(153,69,255,0.22)",
};

/* ── Helpers ────────────────────────────────────────────────────────── */
const fadeInOut = (frame: number, dur: number, fIn = 14, fOut = 14) => {
  const a = interpolate(frame, [0, fIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const b = interpolate(frame, [dur - fOut, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return Math.min(a, b);
};

const comma = (n: number) => Math.round(n).toLocaleString("en-US");

/* ── Persistent background (constant across all scenes) ─────────────── */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  const drift2 = Math.cos(frame / 110) * 50;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at 50% -10%, #15102A 0%, ${C.bg} 45%, ${C.void} 100%)` }}>
      {/* glow blobs */}
      <div style={{ position: "absolute", top: 80 + drift, left: 120 + drift2, width: 620, height: 620, borderRadius: "50%", background: C.purple, filter: "blur(180px)", opacity: 0.16 }} />
      <div style={{ position: "absolute", bottom: 40 - drift, right: 120 - drift2, width: 560, height: 560, borderRadius: "50%", background: C.green, filter: "blur(190px)", opacity: 0.1 }} />
      {/* grid */}
      <AbsoluteFill style={{
        backgroundImage:
          `linear-gradient(rgba(153,69,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(153,69,255,0.06) 1px, transparent 1px)`,
        backgroundSize: "64px 64px",
        maskImage: "radial-gradient(circle at 50% 45%, black 0%, transparent 78%)",
        WebkitMaskImage: "radial-gradient(circle at 50% 45%, black 0%, transparent 78%)",
      }} />
      {/* vignette */}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 300px 80px rgba(0,0,0,0.65)" }} />
    </AbsoluteFill>
  );
};

/* ── Official BlockBite logo (RULE-G11: always public/logo.png) ─────── */
const LogoMark: React.FC<{ size?: number }> = ({ size = 84 }) => (
  <Img
    src={staticFile("logo.png")}
    style={{ width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 6px 22px rgba(153,69,255,0.35))" }}
  />
);

/* ── Reusable kicker + step badge ──────────────────────────────────── */
const StepKicker: React.FC<{ step: string; label: string; color: string; frame: number }> = ({ step, label, color, frame }) => {
  const t = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>
      <div style={{
        fontFamily, fontWeight: 800, fontSize: 22, letterSpacing: 2, color,
        border: `1.5px solid ${color}66`, borderRadius: 999, padding: "8px 18px",
        background: `${color}14`,
      }}>{step}</div>
      <div style={{ fontFamily, fontWeight: 700, fontSize: 22, letterSpacing: 5, textTransform: "uppercase", color: C.muted }}>{label}</div>
    </div>
  );
};

/* ── Browser-style card frame ──────────────────────────────────────── */
const CardFrame: React.FC<{ title: string; children: React.ReactNode; accent: string; w?: number }> = ({ title, children, accent, w = 1080 }) => (
  <div style={{
    width: w, borderRadius: 24, overflow: "hidden", background: C.card,
    border: `1px solid ${C.border}`, boxShadow: `0 30px 90px rgba(0,0,0,0.55), 0 0 60px ${accent}22`,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", background: C.cardHi, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#ff5f57" }} />
      <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#febc2e" }} />
      <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#28c840" }} />
      <div style={{ marginLeft: 18, fontFamily, fontWeight: 600, fontSize: 18, color: C.faint }}>{title}</div>
    </div>
    <div style={{ padding: 40 }}>{children}</div>
  </div>
);

/* ════════════════════════════════════════════════════════════════════
   SCENE 1 — HERO
   ════════════════════════════════════════════════════════════════════ */
const Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = fadeInOut(frame, 110);
  const s = spring({ frame, fps, config: { damping: 200 } });
  const titleY = interpolate(frame, [10, 40], [40, 0], { extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [28, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: op }}>
      <div style={{ transform: `scale(${0.9 + s * 0.1})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <LogoMark size={96} />
          <div style={{ fontFamily, fontWeight: 900, fontSize: 92, color: C.text, letterSpacing: -1 }}>BlockBite</div>
        </div>
      </div>
      <div style={{ transform: `translateY(${titleY}px)`, marginTop: 36, textAlign: "center" }}>
        <div style={{ fontFamily, fontWeight: 800, fontSize: 46, color: C.text }}>
          Token distribution,{" "}
          <span style={{ background: `linear-gradient(90deg, ${C.purple}, ${C.green})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>done responsibly.</span>
        </div>
      </div>
      <div style={{ opacity: subOp, marginTop: 22, fontFamily, fontWeight: 600, fontSize: 26, color: C.muted, letterSpacing: 3 }}>
        Cliff · Linear · Milestone vesting on Solana
      </div>
    </AbsoluteFill>
  );
};

/* ════════════════════════════════════════════════════════════════════
   SCENE 2 — STEP 01: Create a campaign
   ════════════════════════════════════════════════════════════════════ */
const fieldName = "Genesis Airdrop";
const Step1: React.FC = () => {
  const frame = useCurrentFrame();
  const op = fadeInOut(frame, 180);
  const typed = Math.floor(interpolate(frame, [40, 95], [0, fieldName.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const caret = Math.floor(frame / 8) % 2 === 0;
  const row = (i: number, label: string, value: React.ReactNode) => {
    const t = spring({ frame: frame - 30 - i * 12, fps: 30, config: { damping: 200 } });
    return (
      <div style={{ opacity: t, transform: `translateX(${(1 - t) * 30}px)`, marginBottom: 24 }}>
        <div style={{ fontFamily, fontWeight: 600, fontSize: 19, color: C.faint, marginBottom: 10 }}>{label}</div>
        <div style={{ fontFamily, fontWeight: 700, fontSize: 28, color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 22px" }}>{value}</div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: op }}>
      <div style={{ position: "absolute", top: 150 }}>
        <StepKicker step="STEP 01" label="Create a campaign" color={C.purple} frame={frame} />
      </div>
      <CardFrame title="blockbite.app / distribute / new" accent={C.purple} w={920}>
        {row(0, "Campaign name", <span>{fieldName.slice(0, typed)}<span style={{ opacity: caret && typed < fieldName.length ? 1 : 0, color: C.purple }}>|</span></span>)}
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>{row(1, "Token", <span style={{ color: C.green }}>$BITE</span>)}</div>
          <div style={{ flex: 1 }}>{row(2, "Total supply", "1,000,000")}</div>
        </div>
      </CardFrame>
    </AbsoluteFill>
  );
};

/* ════════════════════════════════════════════════════════════════════
   SCENE 3 — STEP 02: Configure vesting (animated curve)
   ════════════════════════════════════════════════════════════════════ */
const Step2: React.FC = () => {
  const frame = useCurrentFrame();
  const op = fadeInOut(frame, 210);
  const W = 980, H = 360;
  // vesting path: flat cliff → linear ramp → milestone steps
  const path = `M 40 ${H - 40} L 240 ${H - 40} L 560 110 L 700 110 L 700 70 L 980 70`;
  const dashOffset = interpolate(frame, [30, 140], [1600, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const areaOp = interpolate(frame, [120, 160], [0, 0.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pills = ["Cliff", "Linear", "Milestone"];
  const active = frame < 80 ? 0 : frame < 120 ? 1 : 2;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: op }}>
      <div style={{ position: "absolute", top: 150 }}>
        <StepKicker step="STEP 02" label="Configure vesting" color={C.green} frame={frame} />
      </div>
      <CardFrame title="blockbite.app / vesting schedule" accent={C.green} w={1120}>
        <div style={{ display: "flex", gap: 14, marginBottom: 28 }}>
          {pills.map((p, i) => (
            <div key={p} style={{
              fontFamily, fontWeight: 700, fontSize: 22, padding: "12px 26px", borderRadius: 999,
              color: i === active ? C.void : C.muted,
              background: i === active ? C.green : "transparent",
              border: `1.5px solid ${i === active ? C.green : C.border}`,
              transition: "none",
            }}>{p}</div>
          ))}
        </div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.green} />
              <stop offset="100%" stopColor={C.green} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* axes */}
          <line x1="40" y1={H - 40} x2={W} y2={H - 40} stroke={C.border} strokeWidth="2" />
          <line x1="40" y1="20" x2="40" y2={H - 40} stroke={C.border} strokeWidth="2" />
          {/* filled area */}
          <path d={`${path} L 980 ${H - 40} L 40 ${H - 40} Z`} fill="url(#area)" opacity={areaOp} />
          {/* curve */}
          <path d={path} fill="none" stroke={C.green} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="1600" strokeDashoffset={dashOffset} />
        </svg>
      </CardFrame>
    </AbsoluteFill>
  );
};

/* ════════════════════════════════════════════════════════════════════
   SCENE 4 — STEP 03: Recipients claim
   ════════════════════════════════════════════════════════════════════ */
const recipients = [
  { addr: "7xKq…9fLm", amt: "214,000", color: C.purple },
  { addr: "Bz3w…Qa1t", amt: "186,500", color: C.blue },
  { addr: "Fk9p…2Vne", amt: "241,500", color: C.gold },
];
const Step3: React.FC = () => {
  const frame = useCurrentFrame();
  const op = fadeInOut(frame, 180);
  const counter = comma(interpolate(frame, [40, 130], [0, 642000], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: op }}>
      <div style={{ position: "absolute", top: 150 }}>
        <StepKicker step="STEP 03" label="Recipients claim" color={C.blue} frame={frame} />
      </div>
      <CardFrame title="blockbite.app / claim" accent={C.blue} w={1000}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
          <div style={{ fontFamily, fontWeight: 600, fontSize: 20, color: C.faint }}>Unlocked so far</div>
          <div style={{ fontFamily, fontWeight: 900, fontSize: 40, color: C.green }}>{counter} <span style={{ fontSize: 24, color: C.muted }}>$BITE</span></div>
        </div>
        {recipients.map((r, i) => {
          const t = spring({ frame: frame - 45 - i * 16, fps: 30, config: { damping: 200 } });
          const claimed = frame > 110 + i * 14;
          return (
            <div key={r.addr} style={{
              opacity: t, transform: `translateY(${(1 - t) * 24}px)`,
              display: "flex", alignItems: "center", gap: 20, padding: "20px 24px", marginBottom: 16,
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16,
            }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg, ${r.color}, ${r.color}88)` }} />
              <div style={{ fontFamily, fontWeight: 700, fontSize: 24, color: C.text }}>{r.addr}</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontFamily, fontWeight: 700, fontSize: 24, color: C.muted }}>{r.amt}</div>
              <div style={{
                fontFamily, fontWeight: 800, fontSize: 20, padding: "12px 24px", borderRadius: 12,
                color: claimed ? C.green : C.void,
                background: claimed ? `${C.green}1f` : C.green,
                border: `1.5px solid ${C.green}`, minWidth: 130, textAlign: "center",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {claimed && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {claimed ? "Claimed" : "Claim"}
              </div>
            </div>
          );
        })}
      </CardFrame>
    </AbsoluteFill>
  );
};

/* ════════════════════════════════════════════════════════════════════
   SCENE 5 — CTA
   ════════════════════════════════════════════════════════════════════ */
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = fadeInOut(frame, 160, 14, 20);
  const s = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const btn = spring({ frame: frame - 30, fps, config: { damping: 180 } });
  const pulse = 1 + Math.sin(frame / 12) * 0.015;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: op }}>
      <div style={{ transform: `scale(${0.92 + s * 0.08})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
        <LogoMark size={72} />
        <div style={{ fontFamily, fontWeight: 900, fontSize: 64, color: C.text, textAlign: "center", maxWidth: 1100, lineHeight: 1.1 }}>
          Ready to distribute{" "}
          <span style={{ background: `linear-gradient(90deg, ${C.purple}, ${C.green})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>responsibly?</span>
        </div>
        <div style={{ transform: `scale(${btn * pulse})`, opacity: btn }}>
          <div style={{
            fontFamily, fontWeight: 800, fontSize: 34, color: C.void, padding: "22px 56px", borderRadius: 999,
            background: `linear-gradient(90deg, ${C.purple}, ${C.blue}, ${C.green})`,
            boxShadow: `0 16px 50px ${C.purple}55`,
          }}>Launch App →</div>
        </div>
        <div style={{ fontFamily, fontWeight: 600, fontSize: 26, color: C.muted, letterSpacing: 2, marginTop: 6 }}>blockbite.vercel.app</div>
      </div>
    </AbsoluteFill>
  );
};

/* ── Progress dots (constant overlay) ──────────────────────────────── */
const Progress: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / durationInFrames;
  return (
    <div style={{ position: "absolute", bottom: 56, left: "50%", transform: "translateX(-50%)", width: 360, height: 5, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
      <div style={{ width: `${p * 100}%`, height: "100%", background: `linear-gradient(90deg, ${C.purple}, ${C.green})` }} />
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   ROOT COMPOSITION
   ════════════════════════════════════════════════════════════════════ */
export const Walkthrough: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.void }}>
      <Background />
      <Sequence from={0} durationInFrames={110}><Hero /></Sequence>
      <Sequence from={110} durationInFrames={180}><Step1 /></Sequence>
      <Sequence from={290} durationInFrames={210}><Step2 /></Sequence>
      <Sequence from={500} durationInFrames={180}><Step3 /></Sequence>
      <Sequence from={680} durationInFrames={160}><CTA /></Sequence>
      <Progress />
    </AbsoluteFill>
  );
};

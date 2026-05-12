// Shared design tokens + tiny atoms for the Solo Endless screens.
// Palette and typography come from the design HTML in
// `~/Downloads/Solo Mode.html` (the "Twilight palette"). Keeping the
// tokens in one module means the hub and the run pages stay visually
// locked together as the design evolves.

import type { CSSProperties, ReactNode } from "react";

export const SOLO = {
  bg: "#0c0a14",
  bg2: "#15121f",
  bg3: "#1d1929",
  line: "#26223a",
  line2: "#36314e",
  fg: "#ece8f5",
  fg2: "#bcb4cf",
  fg3: "#7a7295",
  fg4: "#524c6a",
  accent: "#a78bfa",
  accentDim: "#7c5cf2",
  ok: "#7dd38f",
  warn: "#e8b84a",
  danger: "#ff6b7a",
  mono: "'Geist Mono', ui-monospace, Menlo, monospace",
  sans: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
};

interface EyebrowProps {
  children: ReactNode;
  color?: string;
  dotColor?: string;
  style?: CSSProperties;
}

export function Eyebrow({ children, color = SOLO.fg3, dotColor = SOLO.accent, style }: EyebrowProps) {
  return (
    <div style={{
      fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.16em",
      textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 8,
      ...style,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, boxShadow: `0 0 10px ${dotColor}` }} />
      {children}
    </div>
  );
}

interface HeartProps {
  filled?: boolean;
  broken?: boolean;
  size?: number;
}

export function Heart({ filled = true, broken = false, size = 22 }: HeartProps) {
  const stroke = filled ? SOLO.danger : SOLO.line2;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <path
        d="M12 21s-7-4.5-9.5-9C.8 8.3 3 4 7 4c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 4 0 6.2 4.3 4.5 8-2.5 4.5-9.5 9-9.5 9z"
        fill={filled ? SOLO.danger : "none"}
        stroke={stroke}
        strokeWidth={1.6}
        opacity={filled ? 1 : 0.45}
      />
      {broken && (
        <path d="M12 4l-1.5 5 3-1 -2 4 1.5 4" stroke={SOLO.bg} strokeWidth={1.4} fill="none" />
      )}
    </svg>
  );
}

interface BigNumProps {
  value: ReactNode;
  label?: string;
  color?: string;
  size?: number;
  align?: "left" | "right" | "center";
}

export function BigNum({ value, label, color = SOLO.accent, size = 88, align = "right" }: BigNumProps) {
  return (
    <div style={{ textAlign: align, lineHeight: 1 }}>
      <div style={{
        fontFamily: SOLO.mono, fontWeight: 500, fontSize: size, color,
        letterSpacing: "-0.04em", lineHeight: 0.9,
        textShadow: `0 0 30px ${color}55`,
      }}>{value}</div>
      {label && (
        <div style={{
          fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.16em",
          textTransform: "uppercase", color: SOLO.fg3, marginTop: 6,
        }}>{label}</div>
      )}
    </div>
  );
}

interface TimerBarProps {
  pct: number; // 0–1, played fraction
  danger?: boolean;
}

export function TimerBar({ pct, danger = false }: TimerBarProps) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ height: 3, background: SOLO.line, position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0, right: `${(1 - clamped) * 100}%`,
        background: danger ? SOLO.danger : SOLO.accent,
        boxShadow: `0 0 14px ${danger ? SOLO.danger : SOLO.accent}`,
        transition: "right .15s linear",
      }} />
    </div>
  );
}

interface WaveformProps {
  played: number; // 0–1
  bars?: number;
}

// Deterministic bar heights — index → height via a stable hash so the
// shape doesn't shuffle between renders.
export function Waveform({ played, bars = 64 }: WaveformProps) {
  const data = Array.from({ length: bars }, (_, i) => {
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    return 0.18 + (seed - Math.floor(seed)) * 0.82;
  });
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 4, height: 180, padding: "0 32px",
    }}>
      {data.map((h, i) => {
        const playedBar = i / bars < played;
        return (
          <div key={i} style={{
            width: 4, height: `${h * 100}%`,
            background: playedBar ? SOLO.accent : SOLO.line2,
            borderRadius: 2,
            boxShadow: playedBar ? `0 0 8px ${SOLO.accent}88` : "none",
            opacity: playedBar ? 0.5 + h * 0.5 : 0.6,
          }} />
        );
      })}
    </div>
  );
}

import React from 'react';
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { C, FONT } from './theme';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const useLayout = () => {
  const { width, height } = useVideoConfig();
  return { width, height, V: height > width };
};

export const useSpring = (delay: number, config: any = { damping: 16, mass: 0.8 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

/** Fade/rise/blur-in reveal driven by local frame. */
export const Reveal: React.FC<{ delay?: number; dur?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  dur = 18,
  y = 24,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, filter: `blur(${(1 - p) * 8}px)`, ...style }}>{children}</div>
  );
};

/** Highlights "Zcash" / "ZEC" in zec-gold — Zcash is the core message. */
export const hl = (s: string) =>
  s.split(/(Zcash|\$SPROUT\/ZEC|ZEC)/g).map((part, i) =>
    /^(Zcash|ZEC)$/.test(part) ? (
      <span key={i} style={{ color: C.gold }}>
        {part}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );

/** Bilingual line: English (display serif) above Simplified Chinese (Noto Serif SC). */
export const Bi: React.FC<{
  en: string;
  zh: string;
  size?: number;
  zhScale?: number;
  delay?: number;
  zhDelay?: number;
  align?: 'center' | 'left' | 'right';
  color?: string;
  zhColor?: string;
  maxWidth?: number;
  weight?: number;
  gap?: number;
  style?: React.CSSProperties;
}> = ({ en, zh, size = 64, zhScale = 0.78, delay = 0, zhDelay = 8, align = 'center', color = C.paper, zhColor, maxWidth, weight = 600, gap, style }) => {
  const { V } = useLayout();
  return (
  <div style={{ textAlign: align, maxWidth, ...style }}>
    <Reveal delay={delay}>
      <div style={{ fontFamily: FONT.display, fontWeight: weight, fontSize: size, lineHeight: 1.12, color, letterSpacing: '-0.01em', textWrap: 'balance' as any }}>
        {lines(en, V)}
      </div>
    </Reveal>
    <Reveal delay={delay + zhDelay}>
      <div
        style={{
          fontFamily: FONT.zhSerif,
          fontWeight: 600,
          fontSize: size * zhScale,
          lineHeight: 1.3,
          marginTop: gap ?? size * 0.22,
          color: zhColor ?? 'rgba(244,238,220,0.78)',
          letterSpacing: '0.06em',
          textWrap: 'balance' as any,
        }}
      >
        {lines(zh, V)}
      </div>
    </Reveal>
  </div>
  );
};

/** "|" in copy marks a preferred line break used only in the vertical cut. */
const lines = (s: string, V: boolean) =>
  V && s.includes('|') ? s.split('|').map((l, i) => <div key={i}>{hl(l)}</div>) : hl(s.replace(/\|/g, ''));

/** Small bilingual UI label (sans), EN + ZH on one line or stacked. */
export const BiSmall: React.FC<{ en: string; zh: string; size?: number; color?: string; stacked?: boolean; align?: any; weight?: number }> = ({
  en,
  zh,
  size = 26,
  color = C.paper,
  stacked = false,
  align = 'left',
  weight = 500,
}) => (
  <div style={{ fontFamily: FONT.ui, fontSize: size, color, textAlign: align, lineHeight: 1.25, fontWeight: weight }}>
    <span>{en}</span>
    {stacked ? <br /> : <span style={{ opacity: 0.45 }}>{'  ·  '}</span>}
    <span style={{ fontFamily: FONT.zhSans, opacity: 0.75, fontSize: size * 0.92, letterSpacing: '0.04em' }}>{zh}</span>
  </div>
);

/* ------------------------------------------------------------------ */
/* Sprout mark — paths inlined from public/brand/sprout-mark.svg, layers grow in sequence.             */
/* ------------------------------------------------------------------ */
export const SproutMark: React.FC<{ size: number; delay?: number; speed?: number; glow?: number; style?: React.CSSProperties }> = ({
  size,
  delay = 0,
  speed = 1,
  glow = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (frame - delay) * speed;
  const sp = (d: number, cfg: any = { damping: 13, mass: 0.7 }) => spring({ frame: f - d, fps, config: cfg });
  const soil = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const l1 = sp(6);
  const l2 = sp(14);
  const l3 = sp(22);
  const leaf = sp(30, { damping: 9, mass: 0.6 });
  const nodes = interpolate(f, [34, 50], [0, 1], clamp);
  const sway = Math.sin((frame / fps) * 1.4) * 1.2 * leaf;
  const grow = (s: number, ox: number, oy: number) => `translate(${ox} ${oy}) scale(${0.6 + 0.4 * s} ${s}) translate(${-ox} ${-oy})`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ overflow: 'visible', ...style }}>
      <defs>
        <radialGradient id="markGlow" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor={C.gold} stopOpacity={0.55} />
          <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
        </radialGradient>
      </defs>
      {glow > 0 && <ellipse cx={32} cy={34} rx={34} ry={30} fill="url(#markGlow)" opacity={glow * Math.min(1, l1)} />}
      <path d="M10 56 Q32 50 54 56" stroke={C.soil} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - soil} opacity={soil > 0.02 ? 1 : 0} />
      <g transform={`rotate(${sway * 0.3} 32 55)`}>
        <path d="M15 55 Q32 47 49 55 L43.5 37 Q32 32.5 20.5 37 Z" fill={C.bamboo700} transform={grow(l1, 32, 55)} opacity={Math.min(1, l1 * 3)} />
        <g transform={grow(l1, 32, 55)}>
          <path d="M20.5 38.5 Q32 33.5 43.5 38.5 L38.5 23 Q32 19.8 25.5 23 Z" fill={C.bamboo500} transform={grow(l2, 32, 38.5)} opacity={Math.min(1, l2 * 3)} />
          <g transform={grow(l2, 32, 38.5)}>
            <path d="M25.6 24.6 Q32 21.6 38.4 24.6 L32 8.5 Z" fill={C.shoot300} transform={grow(l3, 32, 24.6)} opacity={Math.min(1, l3 * 3)} />
            <g transform={grow(l3, 32, 24.6)}>
              <path
                d="M32.6 12.4 Q41 3.5 51 7.2 Q44.5 14.6 33.6 13.6 Z"
                fill={C.leaf200}
                transform={`rotate(${(1 - leaf) * -70 + sway} 33 13)`}
                opacity={Math.min(1, leaf * 2)}
              />
            </g>
          </g>
        </g>
        <path
          d="M32 47.5 L32 38.2 M32 35 L32 25.5"
          stroke={C.paper}
          strokeOpacity={0.35}
          strokeWidth={1.4}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - nodes}
          opacity={nodes > 0.02 ? 1 : 0}
        />
      </g>
    </svg>
  );
};

/* Static mark (no animation) for forests/stages, scaled by `grow` 0..1 */
export const StaticShoot: React.FC<{ size: number; grow?: number; tint?: number }> = ({ size, grow = 1, tint = 0 }) => {
  const g = Math.max(0.001, grow);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ overflow: 'visible' }}>
      <g transform={`translate(32 56) scale(${0.5 + 0.5 * g} ${g}) translate(-32 -56)`}>
        <path d="M15 55 Q32 47 49 55 L43.5 37 Q32 32.5 20.5 37 Z" fill={C.bamboo700} />
        <path d="M20.5 38.5 Q32 33.5 43.5 38.5 L38.5 23 Q32 19.8 25.5 23 Z" fill={C.bamboo500} />
        <path d="M25.6 24.6 Q32 21.6 38.4 24.6 L32 8.5 Z" fill={tint ? C.gold : C.shoot300} opacity={tint ? 0.5 + 0.5 * tint : 1} />
        <path d="M32.6 12.4 Q41 3.5 51 7.2 Q44.5 14.6 33.6 13.6 Z" fill={C.leaf200} />
        <path d="M32 47.5 L32 38.2 M32 35 L32 25.5" stroke={C.paper} strokeOpacity={0.35} strokeWidth={1.4} strokeLinecap="round" />
      </g>
    </svg>
  );
};

/** Generic gold ZEC coin (Ⓩ-style glyph, not the official logo). `spin` in radians flips it around Y. */
export const Coin: React.FC<{ size: number; spin?: number; shield?: number; style?: React.CSSProperties }> = ({ size, spin = 0, shield = 0, style }) => {
  const sx = Math.max(0.08, Math.abs(Math.cos(spin)));
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible', ...style }}>
      <defs>
        <radialGradient id="coinFace" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#FFE7A3" />
          <stop offset="45%" stopColor={C.gold} />
          <stop offset="100%" stopColor="#B07A0C" />
        </radialGradient>
        <radialGradient id="coinHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C.gold} stopOpacity={0.45} />
          <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={50} cy={50} r={78} fill="url(#coinHalo)" />
      <g transform={`translate(50 50) scale(${sx} 1) translate(-50 -50)`}>
        <circle cx={50} cy={50} r={46} fill="#9A6A08" />
        <circle cx={50} cy={48} r={45} fill="url(#coinFace)" />
        <circle cx={50} cy={48} r={36} fill="none" stroke="#8A5E05" strokeOpacity={0.55} strokeWidth={2.5} />
        {/* stylised Z glyph */}
        <path d="M35 31 H65 V37 L44 59 H65 V65 H35 V59 L56 37 H35 Z" fill="#5C3D02" />
        <path d="M47.5 24 h5 v7 h-5 z M47.5 65 h5 v7 h-5 z" fill="#5C3D02" />
      </g>
      {shield > 0 && (
        <g opacity={shield} transform={`translate(${62} ${58}) scale(${0.4 + 0.6 * shield})`}>
          <path d="M0 -26 L22 -18 V0 C22 16 10 25 0 30 C-10 25 -22 16 -22 0 V-18 Z" fill={C.bamboo900} stroke={C.leaf200} strokeWidth={3} />
          <path d="M-9 1 L-2 8 L11 -7" stroke={C.leaf200} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
};

/** ZEC ticker chip */
export const ZecChip: React.FC<{ size?: number; label?: string }> = ({ size = 26, label = 'ZEC' }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.3,
      padding: `${size * 0.18}px ${size * 0.5}px ${size * 0.18}px ${size * 0.2}px`,
      borderRadius: 999,
      background: 'rgba(244,183,40,0.14)',
      border: `1.5px solid rgba(244,183,40,0.6)`,
      color: C.gold,
      fontFamily: FONT.ui,
      fontWeight: 600,
      fontSize: size,
      lineHeight: 1,
      verticalAlign: 'middle',
    }}
  >
    <Coin size={size * 1.15} />
    {label}
  </span>
);

/** Red seal stamp with 春笋 */
export const Seal: React.FC<{ size: number; rot?: number; opacity?: number }> = ({ size, rot = -4, opacity = 1 }) => (
  <div
    style={{
      width: size,
      height: size,
      background: C.seal,
      borderRadius: size * 0.1,
      transform: `rotate(${rot}deg)`,
      opacity,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: 'inset 0 0 0 3px rgba(244,238,220,0.18), 0 6px 24px rgba(0,0,0,0.35)',
    }}
  >
    <div
      style={{
        fontFamily: FONT.zhSerif,
        fontWeight: 700,
        color: C.paper,
        fontSize: size * 0.4,
        lineHeight: 1.0,
        writingMode: 'vertical-rl',
        letterSpacing: '0.04em',
      }}
    >
      春笋
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Backgrounds                                                          */
/* ------------------------------------------------------------------ */

export const InkBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 30;
  const blobs = [
    { x: 0.2, y: 0.25, r: 0.55, c: 'rgba(31,107,67,0.20)', dx: 0.02, sp: 0.07 },
    { x: 0.8, y: 0.7, r: 0.6, c: 'rgba(14,42,27,0.65)', dx: -0.03, sp: 0.05 },
    { x: 0.55, y: 0.15, r: 0.4, c: 'rgba(124,195,110,0.07)', dx: 0.03, sp: 0.09 },
    { x: 0.35, y: 0.85, r: 0.5, c: 'rgba(107,79,42,0.10)', dx: 0.02, sp: 0.06 },
  ];
  const m = Math.max(width, height);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, #14301F 0%, ${C.bg} 55%, #060C08 100%)` }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: (b.x + Math.sin(t * b.sp * 6 + i) * b.dx) * width - (b.r * m) / 2,
            top: b.y * height - (b.r * m) / 2,
            width: b.r * m,
            height: b.r * m,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${b.c} 0%, rgba(0,0,0,0) 70%)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** Distant ink bamboo stalks with node rings; slow parallax sway. */
export const DistantBamboo: React.FC<{ opacity?: number; count?: number; seed?: string }> = ({ opacity = 1, count = 16, seed = 'bamboo' }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const stalks = new Array(count).fill(0).map((_, i) => {
    const depth = random(`${seed}-d-${i}`);
    return {
      x: ((i + random(`${seed}-x-${i}`) * 0.8) / count) * width,
      w: 6 + depth * 18,
      depth,
      lean: (random(`${seed}-l-${i}`) - 0.5) * 3,
      seg: 120 + random(`${seed}-s-${i}`) * 120,
    };
  });
  stalks.sort((a, b) => a.depth - b.depth);
  return (
    <AbsoluteFill style={{ opacity }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="stalkFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0} />
            <stop offset="0.35" stopColor="#fff" stopOpacity={1} />
            <stop offset="1" stopColor="#fff" stopOpacity={0.6} />
          </linearGradient>
          <mask id="stalkMask">
            <rect width={width} height={height} fill="url(#stalkFade)" />
          </mask>
        </defs>
        <g mask="url(#stalkMask)">
          {stalks.map((s, i) => {
            const sway = Math.sin(frame / 50 + i) * (1 + s.depth * 2);
            const drift = (frame * (0.05 + s.depth * 0.25)) % width;
            const x = s.x - drift * 0.2;
            const op = 0.05 + s.depth * 0.13;
            const nodes = [];
            for (let y = (i * 37) % s.seg; y < height; y += s.seg) nodes.push(y);
            return (
              <g key={i} transform={`rotate(${s.lean + sway * 0.15} ${x} ${height})`} opacity={op}>
                <rect x={x - s.w / 2} y={-20} width={s.w} height={height + 40} fill={s.depth > 0.6 ? C.bamboo500 : C.bamboo700} rx={s.w / 2} />
                {nodes.map((y, k) => (
                  <rect key={k} x={x - s.w / 2 - 2} y={y} width={s.w + 4} height={Math.max(2, s.w * 0.22)} fill={C.leaf200} opacity={0.5} rx={2} />
                ))}
              </g>
            );
          })}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

export const Rain: React.FC<{ intensity: number; count?: number }> = ({ intensity, count = 170 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (intensity <= 0.001) return null;
  const drops = new Array(count).fill(0).map((_, i) => {
    const sp = 28 + random(`r-s-${i}`) * 30;
    const len = 40 + random(`r-l-${i}`) * 90;
    const x0 = random(`r-x-${i}`) * (width + 200) - 100;
    const ph = random(`r-p-${i}`) * (height + len);
    const y = ((frame * sp + ph) % (height + len * 2)) - len;
    const z = random(`r-z-${i}`);
    return { x: x0 - y * 0.12, y, len, z };
  });
  return (
    <AbsoluteFill style={{ opacity: intensity }}>
      <svg width={width} height={height}>
        {drops.map((d, i) => (
          <line
            key={i}
            x1={d.x}
            y1={d.y}
            x2={d.x - d.len * 0.12}
            y2={d.y + d.len}
            stroke={d.z > 0.85 ? C.leaf200 : C.paper}
            strokeOpacity={0.08 + d.z * 0.22}
            strokeWidth={0.8 + d.z * 1.6}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

/** Vignette + very light paper grain */
export const Finish: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)' }} />
    <AbsoluteFill style={{ opacity: 0.06, mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  </AbsoluteFill>
);

/** Glass card used for illustrative UI */
export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; gold?: boolean }> = ({ children, style, gold }) => (
  <div
    style={{
      background: 'linear-gradient(160deg, rgba(31,107,67,0.22), rgba(14,42,27,0.72))',
      border: `1.5px solid ${gold ? 'rgba(244,183,40,0.55)' : 'rgba(168,220,122,0.22)'}`,
      borderRadius: 28,
      boxShadow: '0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(244,238,220,0.08)',
      backdropFilter: 'blur(6px)',
      ...style,
    }}
  >
    {children}
  </div>
);

/** Bamboo-node divider line */
export const StalkLine: React.FC<{ width: number; progress?: number; color?: string }> = ({ width, progress = 1, color = C.bamboo500 }) => (
  <svg width={width} height={14} style={{ overflow: 'visible' }}>
    <rect x={0} y={5} width={width * progress} height={4} rx={2} fill={color} opacity={0.7} />
    {[0.25, 0.5, 0.75].map((p) => (p <= progress ? <rect key={p} x={width * p - 1.5} y={1} width={3} height={12} rx={1.5} fill={C.leaf200} opacity={0.6} /> : null))}
  </svg>
);

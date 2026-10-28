import Link from 'next/link';

/**
 * The layered bamboo-shoot mark. `tone="bnb"` (default) is the dark-theme variant: green
 * sheaths with a BNB-yellow tip; `tone="brand"` is the original /brand/sprout-mark.svg colours.
 */
export function Mark({ size = 32, className = '', tone = 'bnb', glow = false }: { size?: number; className?: string; tone?: 'bnb' | 'brand'; glow?: boolean }) {
  const c =
    tone === 'bnb'
      ? { soil: '#3A3F46', l1: '#1F6B43', l2: '#2EBD6B', l3: '#F0B90B', leaf: '#FCD535', vein: '#07080A' }
      : { soil: '#6B4F2A', l1: '#1F6B43', l2: '#2F8F57', l3: '#7CC36E', leaf: '#A8DC7A', vein: '#F4EEDC' };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={`shrink-0 ${className}`}
      style={glow ? { filter: 'drop-shadow(0 0 10px rgba(240,185,11,.45))' } : undefined}
    >
      <path d="M10 56 Q32 50 54 56" stroke={c.soil} strokeWidth="3" strokeLinecap="round" />
      <path d="M15 55 Q32 47 49 55 L43.5 37 Q32 32.5 20.5 37 Z" fill={c.l1} />
      <path d="M20.5 38.5 Q32 33.5 43.5 38.5 L38.5 23 Q32 19.8 25.5 23 Z" fill={c.l2} />
      <path d="M25.6 24.6 Q32 21.6 38.4 24.6 L32 8.5 Z" fill={c.l3} />
      <path d="M32.6 12.4 Q41 3.5 51 7.2 Q44.5 14.6 33.6 13.6 Z" fill={c.leaf} />
      <path d="M32 47.5 L32 38.2 M32 35 L32 25.5" stroke={c.vein} strokeOpacity=".35" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Red square seal stamp with 春笋 (vertical, like a traditional chop). Use sparingly. */
export function Seal({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="春笋"
      className={`zh-glyph relative inline-flex shrink-0 select-none items-center justify-center rounded-[6px] bg-seal text-paper shadow-[inset_0_0_0_2px_rgba(244,238,220,.35),0_0_24px_-6px_rgb(var(--seal)/0.6)] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36, lineHeight: 1.02, transform: 'rotate(-4deg)' }}
    >
      <span className="font-bold" style={{ writingMode: 'vertical-rl', letterSpacing: '0.04em' }}>
        春笋
      </span>
    </span>
  );
}

/** Generic gold coin glyph with a Z stroke — not the official Zcash logo. */
export function ZecGlyph({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className={`shrink-0 ${className}`}>
      <circle cx="8" cy="8" r="7.25" fill="#F4B728" />
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="#07080A" strokeOpacity=".2" strokeWidth=".8" />
      <path d="M5.4 5.2h5.2L5.4 10.8h5.2" fill="none" stroke="#07080A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Generic BNB-style diamond glyph — not the official BNB logo. */
export function BnbGlyph({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className={`shrink-0 ${className}`}>
      <circle cx="8" cy="8" r="7.25" fill="#F0B90B" />
      <path d="M8 3.6 10.2 5.8 8 8 5.8 5.8Z M8 8 10.2 10.2 8 12.4 5.8 10.2Z M3.6 8 4.9 6.7 6.2 8 4.9 9.3Z M12.4 8 11.1 9.3 9.8 8 11.1 6.7Z" fill="#07080A" />
    </svg>
  );
}

/** Small "ZEC" ticker chip. */
export function ZecChip({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[11px] font-medium text-gold ${className}`}>
      <ZecGlyph size={11} />
      ZEC
    </span>
  );
}

/** Logo lockup: mark + "Sprout" + 春笋. `compact` hides the Chinese. */
export function Logo({ compact = false, href = '/' }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="Sprout 春笋 — home">
      <Mark size={30} glow className="transition-transform duration-500 ease-out group-hover:-translate-y-0.5 group-hover:-rotate-6" />
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[20px] font-semibold leading-none tracking-[-0.04em] text-fg">Sprout</span>
        {!compact && <span className="zh-glyph text-[13px] font-bold leading-none text-accent">春笋</span>}
      </span>
    </Link>
  );
}

/** Horizontal bamboo-node divider (CSS version). See fx/NodeDivider for the richer one. */
export function NodeRule({ className = '' }: { className?: string }) {
  return <div className={`bamboo-rule ${className}`} role="presentation" />;
}

/** Decorative neon bamboo stalks with nodes — empty states, page heads. */
export function Stalks({ className = '' }: { className?: string }) {
  const main = [90, 190, 290, 390];
  return (
    <svg viewBox="0 0 220 520" className={className} aria-hidden fill="none" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="stk-y" x1="0" x2="1">
          <stop offset="0" stopColor="#F0B90B" stopOpacity=".05" />
          <stop offset=".5" stopColor="#F0B90B" stopOpacity=".22" />
          <stop offset="1" stopColor="#F0B90B" stopOpacity=".05" />
        </linearGradient>
        <linearGradient id="stk-g" x1="0" x2="1">
          <stop offset="0" stopColor="#2EBD6B" stopOpacity=".04" />
          <stop offset=".5" stopColor="#2EBD6B" stopOpacity=".2" />
          <stop offset="1" stopColor="#2EBD6B" stopOpacity=".04" />
        </linearGradient>
      </defs>
      <g className="origin-bottom animate-sway" style={{ transformBox: 'fill-box' }}>
        <rect x="120" y="20" width="22" height="500" rx="6" fill="url(#stk-y)" stroke="#F0B90B" strokeOpacity=".55" />
        {main.map((y) => (
          <rect key={y} x="114" y={y} width="34" height="5" rx="2.5" fill="#FCD535" opacity=".9" />
        ))}
        <path d="M142 100 Q190 70 214 86 Q180 108 142 108Z" fill="#7CE3A0" fillOpacity=".15" stroke="#7CE3A0" strokeOpacity=".6" />
        <path d="M120 200 Q70 170 40 182 Q78 210 120 208Z" fill="#7CE3A0" fillOpacity=".12" stroke="#7CE3A0" strokeOpacity=".5" />
        <path d="M124 20 L131 -4 L138 20Z" fill="#FCD535" opacity=".85" />
      </g>
      <g opacity=".7">
        <rect x="56" y="140" width="14" height="380" rx="5" fill="url(#stk-g)" stroke="#2EBD6B" strokeOpacity=".5" />
        {[210, 300, 400].map((y) => (
          <rect key={y} x="52" y={y} width="22" height="4" rx="2" fill="#7CE3A0" opacity=".85" />
        ))}
      </g>
      <g opacity=".5">
        <rect x="178" y="240" width="10" height="280" rx="4" fill="url(#stk-g)" stroke="#2EBD6B" strokeOpacity=".5" />
        {[300, 380, 460].map((y) => (
          <rect key={y} x="175" y={y} width="16" height="3.5" rx="1.75" fill="#7CE3A0" opacity=".85" />
        ))}
      </g>
    </svg>
  );
}

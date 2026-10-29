import Link from 'next/link';

// Pixel bamboo shoot on an 18x18 grid (source of truth: brand/src/mark.mjs GRID). Left half #FCD535, right half #F0B90B.
const MARK_HI =
  'M8 0h1v1h-1zM8 1h1v1h-1zM8 2h1v1h-1zM7 3h2v1h-2zM7 4h1v1h-1zM8 5h1v1h-1zM7 6h2v1h-2zM6 7h3v1h-3zM6 8h2v1h-2zM5 9h2v1h-2zM8 9h1v1h-1zM5 10h1v1h-1zM7 10h2v1h-2zM6 11h3v1h-3zM5 12h3v1h-3zM4 13h3v1h-3zM8 13h1v1h-1zM4 14h2v1h-2zM7 14h2v1h-2zM3 15h2v1h-2zM6 15h3v1h-3zM3 16h1v1h-1zM5 16h4v1h-4zM4 17h5v1h-5z';
const MARK_BASE =
  'M9 0h1v1h-1zM9 1h1v1h-1zM9 2h1v1h-1zM9 3h2v1h-2zM10 4h1v1h-1zM9 5h1v1h-1zM9 6h2v1h-2zM9 7h3v1h-3zM10 8h2v1h-2zM9 9h1v1h-1zM11 9h2v1h-2zM9 10h2v1h-2zM12 10h1v1h-1zM9 11h3v1h-3zM10 12h3v1h-3zM9 13h1v1h-1zM11 13h3v1h-3zM9 14h2v1h-2zM12 14h2v1h-2zM9 15h3v1h-3zM13 15h2v1h-2zM9 16h4v1h-4zM14 16h1v1h-1zM9 17h5v1h-5z';

/**
 * The Sprout pixel mark: a flat yellow bamboo shoot on a crisp 18x18 grid (transparent background).
 * `tone` and `glow` are kept for API compatibility; every tone renders the same yellow pixel mark, flat.
 */
export function Mark({ size = 32, className = '' }: { size?: number; className?: string; tone?: 'bnb' | 'brand'; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" shapeRendering="crispEdges" aria-hidden className={`shrink-0 ${className}`}>
      <path d={MARK_HI} fill="#FCD535" />
      <path d={MARK_BASE} fill="#F0B90B" />
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

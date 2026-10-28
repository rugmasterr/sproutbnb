import Link from 'next/link';

export function Mark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src="/brand/sprout-mark.svg" width={size} height={size} alt="" aria-hidden className={className} />;
}

/** Red square seal stamp with 春笋 (vertical, like a traditional chop). */
export function Seal({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="春笋"
      className={`zh-glyph relative inline-flex select-none items-center justify-center rounded-[6px] bg-seal text-paper shadow-[inset_0_0_0_2px_rgba(244,238,220,.35)] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38, lineHeight: 1.02, transform: 'rotate(-4deg)' }}
    >
      <span className="font-bold" style={{ writingMode: 'vertical-rl', letterSpacing: '0.02em' }}>
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
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="#141613" strokeOpacity=".18" strokeWidth=".8" />
      <path d="M5.4 5.2h5.2L5.4 10.8h5.2" fill="none" stroke="#141613" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Small "ZEC" ticker chip. */
export function ZecChip({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold ${className}`}>
      <ZecGlyph size={11} />
      ZEC
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="Sprout home">
      <Mark size={32} className="transition-transform duration-500 group-hover:-rotate-6" />
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[22px] font-semibold leading-none tracking-tight">Sprout</span>
        {!compact && <span className="zh-glyph text-xs font-bold text-seal">春笋</span>}
      </span>
    </Link>
  );
}

/** Horizontal bamboo-node divider. */
export function NodeRule({ className = '' }: { className?: string }) {
  return <div className={`bamboo-rule ${className}`} role="presentation" />;
}

/** Decorative bamboo stalks with nodes — used in hero and empty states. */
export function Stalks({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 520" className={className} aria-hidden fill="none" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id="stk" x1="0" x2="1">
          <stop offset="0" stopColor="#1F6B43" />
          <stop offset=".55" stopColor="#2F8F57" />
          <stop offset="1" stopColor="#1F6B43" />
        </linearGradient>
        <linearGradient id="stk2" x1="0" x2="1">
          <stop offset="0" stopColor="#0E2A1B" />
          <stop offset=".5" stopColor="#1F6B43" />
          <stop offset="1" stopColor="#0E2A1B" />
        </linearGradient>
      </defs>
      <g className="origin-bottom animate-sway" style={{ transformBox: 'fill-box' }}>
        <rect x="120" y="20" width="22" height="500" rx="8" fill="url(#stk)" />
        {[90, 190, 290, 390].map((y) => (
          <rect key={y} x="116" y={y} width="30" height="7" rx="3.5" fill="#7CC36E" opacity=".8" />
        ))}
        <path d="M142 100 Q190 70 214 86 Q180 108 142 108Z" fill="#7CC36E" opacity=".9" />
        <path d="M120 200 Q70 170 40 182 Q78 210 120 208Z" fill="#A8DC7A" opacity=".75" />
        <circle cx="200" cy="118" r="9" fill="#F4B728" opacity=".85" />
      </g>
      <g opacity=".6">
        <rect x="56" y="140" width="14" height="380" rx="6" fill="url(#stk2)" />
        {[210, 300, 400].map((y) => (
          <rect key={y} x="53" y={y} width="20" height="5" rx="2.5" fill="#2F8F57" />
        ))}
      </g>
      <g opacity=".45">
        <rect x="178" y="240" width="10" height="280" rx="5" fill="url(#stk2)" />
        {[300, 380, 460].map((y) => (
          <rect key={y} x="176" y={y} width="14" height="4" rx="2" fill="#2F8F57" />
        ))}
      </g>
    </svg>
  );
}

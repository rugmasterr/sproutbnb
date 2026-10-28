import { Children } from 'react';

type Props = {
  children: React.ReactNode;
  /** Seconds per loop. */
  speed?: number;
  reverse?: boolean;
  /** Pause on hover (default true). */
  pauseOnHover?: boolean;
  className?: string;
  /** Gap between items (Tailwind gap class). */
  gap?: string;
  /** Accessible name for the band. */
  label?: string;
};

/**
 * Infinite horizontal ticker band. Children are rendered twice (second copy aria-hidden) and the
 * track slides -50%, so the loop is seamless. Reduced-motion: static, scrollable row.
 * Wrap in a `border-y border-line` band yourself; see TickerItem for the mono item style.
 */
export function Ticker({ children, speed = 40, reverse = false, pauseOnHover = true, className = '', gap = 'gap-10', label }: Props) {
  const items = Children.toArray(children);
  return (
    <div className={`ticker ${className}`} role="region" aria-label={label}>
      <div
        className="ticker-track"
        data-pause={pauseOnHover ? 'true' : 'false'}
        style={{ ['--ticker-dur' as string]: `${speed}s`, ['--ticker-dir' as string]: reverse ? 'reverse' : 'normal' }}
      >
        <ul className={`flex shrink-0 items-center pr-10 ${gap}`}>
          {items.map((c, i) => (
            <li key={i} className="shrink-0">
              {c}
            </li>
          ))}
        </ul>
        <ul className={`flex shrink-0 items-center pr-10 ${gap}`} aria-hidden>
          {items.map((c, i) => (
            <li key={i} className="shrink-0">
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Mono ticker entry: `KICKER value` with optional tone. */
export function TickerItem({
  k,
  v,
  tone = 'default',
}: {
  k: React.ReactNode;
  v: React.ReactNode;
  tone?: 'default' | 'up' | 'down' | 'accent';
}) {
  const vc = { default: 'text-fg', up: 'text-bamboo-hi', down: 'text-down', accent: 'text-accent-hi' }[tone];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-xs">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{k}</span>
      <span className={`num ${vc}`}>{v}</span>
    </span>
  );
}

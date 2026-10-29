import Link from 'next/link';

type Tone = 'yellow' | 'green';

/**
 * Big glowing panel (launch CTA / feature callout). Radial accent glow from a corner, hairline
 * border that warms on hover, optional faint dot grid. Render as a link with `href` (whole panel
 * clickable - put a `.btn-primary` *span* inside, not a nested link) or as a plain block.
 */
export function GlowPanel({
  children,
  tone = 'yellow',
  grid = true,
  href,
  onClick,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  tone?: Tone;
  grid?: boolean;
  href?: string;
  /** Whole panel acts as a button (used instead of href). */
  onClick?: () => void;
  className?: string;
  as?: 'div' | 'section' | 'aside';
}) {
  const rgb = tone === 'yellow' ? 'var(--accent)' : 'var(--bamboo)';
  const cls = `group relative block overflow-hidden rounded-3xl border border-line-2 p-6 text-fg transition duration-500 ease-out sm:p-10 lg:p-14 ${
    href || onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-accent/50' : ''
  } ${className}`;
  const style = {
    background: `radial-gradient(120% 140% at 0% 0%, rgb(${rgb} / 0.20), transparent 55%), linear-gradient(90deg, rgb(var(--card) / 0.92), rgb(var(--raised) / 0.75) 55%, rgb(var(--raised) / 0.35))`,
  } as React.CSSProperties;
  const inner = (
    <>
      {grid && <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-60" />}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[12%] -top-[45%] aspect-square w-[62%] rounded-full transition-transform duration-700 ease-out group-hover:-translate-x-[6%] group-hover:translate-y-[8%] group-hover:scale-110"
        style={{ background: `radial-gradient(circle, rgb(${rgb} / 0.18), transparent 65%)` }}
      />
      <div className="relative">{children}</div>
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <div
        role="button"
        tabIndex={0}
        className={cls}
        style={style}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {inner}
      </div>
    );
  return (
    <Tag className={cls} style={style}>
      {inner}
    </Tag>
  );
}

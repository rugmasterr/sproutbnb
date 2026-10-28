type Tone = 'accent' | 'green' | 'muted' | 'red';

const toneCls: Record<Tone, string> = {
  accent: 'text-accent',
  green: 'text-bamboo',
  muted: 'text-faint',
  red: 'text-down',
};

/**
 * Tiny uppercase mono label above headings: `// 01 — LAUNCH`.
 * `index` renders a zero-padded number; `node` prefixes a small bamboo node tick.
 */
export function Kicker({
  children,
  tone = 'accent',
  index,
  node = false,
  pill = false,
  className = '',
  as: Tag = 'span',
}: {
  children: React.ReactNode;
  tone?: Tone;
  index?: number;
  node?: boolean;
  /** Bordered pill variant (hero kicker). */
  pill?: boolean;
  className?: string;
  as?: 'span' | 'p' | 'div';
}) {
  const pillCls = pill
    ? tone === 'green'
      ? 'rounded-full border border-bamboo/40 bg-bamboo/10 py-1 pl-1.5 pr-3'
      : 'rounded-full border border-accent/40 bg-accent/10 py-1 pl-1.5 pr-3'
    : '';
  return (
    <Tag className={`kicker ${toneCls[tone]} ${pillCls} ${className}`}>
      {node && (
        <span aria-hidden className="inline-flex h-3 w-1.5 flex-col justify-between">
          <span className="h-[3px] w-1.5 rounded-sm bg-current" />
          <span className="mx-auto h-[4px] w-px bg-current opacity-60" />
          <span className="h-[3px] w-1.5 rounded-sm bg-current" />
        </span>
      )}
      {index !== undefined && <span className="opacity-60">{String(index).padStart(2, '0')}</span>}
      {index !== undefined && <span aria-hidden className="h-px w-4 bg-current opacity-40" />}
      <span className="inline-flex items-center gap-2">{children}</span>
    </Tag>
  );
}

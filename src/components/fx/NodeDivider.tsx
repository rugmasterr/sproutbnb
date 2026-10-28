/**
 * Bamboo-node separator: a hairline stalk interrupted by node rings.
 *   <NodeDivider />                  three rings, centre one yellow
 *   <NodeDivider label="竹节 · 02" /> ring + mono label in the middle
 */
export function NodeDivider({ label, className = '' }: { label?: React.ReactNode; className?: string }) {
  return (
    <div role="presentation" className={`relative flex items-center gap-3 ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-line-2 to-line-2" />
      <NodeRing tone="muted" />
      <span className="h-px w-10 bg-line-2 sm:w-16" />
      {label ? (
        <span className="flex items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">
          <NodeRing tone="yellow" />
          {label}
          <NodeRing tone="green" />
        </span>
      ) : (
        <NodeRing tone="yellow" />
      )}
      <span className="h-px w-10 bg-line-2 sm:w-16" />
      <NodeRing tone="muted" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-line-2 to-line-2" />
    </div>
  );
}

/** One bamboo node ring (horizontal capsule like a stalk joint). */
export function NodeRing({ tone = 'yellow', className = '' }: { tone?: 'yellow' | 'green' | 'muted'; className?: string }) {
  const cls =
    tone === 'yellow'
      ? 'border-accent bg-accent/20 shadow-[0_0_12px_rgb(var(--accent)/0.6)]'
      : tone === 'green'
        ? 'border-bamboo bg-bamboo/20 shadow-[0_0_12px_rgb(var(--bamboo)/0.55)]'
        : 'border-line-2 bg-bg';
  return <span aria-hidden className={`inline-block h-[9px] w-[18px] shrink-0 rounded-full border-[1.5px] ${cls} ${className}`} />;
}

/**
 * Segmented "bamboo stalk" progress: N nodes, filled up to `value` (0..1). Yellow by default,
 * green when `tone="green"`. Has progressbar semantics.
 */
export function BambooBar({
  value,
  segments = 5,
  tone = 'yellow',
  label,
  className = '',
}: {
  value: number;
  segments?: number;
  tone?: 'yellow' | 'green';
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const fill = tone === 'yellow' ? 'from-accent-deep to-accent-hi' : 'from-bamboo-deep to-bamboo-hi';
  const glow = tone === 'yellow' ? 'shadow-[0_0_12px_rgb(var(--accent)/0.6)]' : 'shadow-[0_0_12px_rgb(var(--bamboo)/0.55)]';
  return (
    <div
      className={`flex h-1.5 gap-[3px] ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      {Array.from({ length: segments }, (_, i) => {
        const segFill = Math.max(0, Math.min(1, pct * segments - i));
        return (
          <span key={i} className="relative flex-1 overflow-hidden rounded-full bg-white/[0.07]">
            <span
              className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${fill} ${segFill > 0 ? glow : ''} transition-[width] duration-700 ease-out`}
              style={{ width: `${segFill * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

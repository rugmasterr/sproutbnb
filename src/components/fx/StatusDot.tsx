type Tone = 'green' | 'yellow' | 'red' | 'muted';

const color: Record<Tone, string> = {
  green: 'rgb(var(--bamboo))',
  yellow: 'rgb(var(--accent))',
  red: 'rgb(var(--down))',
  muted: 'rgb(var(--faint))',
};

/** Glowing status dot with an optional pulse ring. Pair with visible text — the dot is decorative. */
export function StatusDot({ tone = 'green', pulse = true, className = '' }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`status-dot ${className}`}
      data-pulse={pulse && tone !== 'muted' ? 'true' : 'false'}
      style={{ ['--dot' as string]: color[tone] }}
    />
  );
}

/** Dot + mono label, e.g. <StatusLine tone="green">BNB Chain · 56</StatusLine> */
export function StatusLine({
  tone = 'green',
  pulse = true,
  children,
  className = '',
}: {
  tone?: Tone;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted ${className}`}>
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}

export type TrackItem = { label: React.ReactNode; when?: React.ReactNode; state?: 'done' | 'now' | 'next' };

/**
 * Roadmap / stage strip: a horizontal bamboo stalk with node rings. `done` nodes are green,
 * `now` is glowing yellow, `next` is hollow. One row from md up; 2 (phone) / 3 (sm) columns below.
 *   <NodeTrack items={[{ when: 'Seed 笋芽', label: '…', state: 'done' }, …]} />
 */
export function NodeTrack({ items, className = '' }: { items: TrackItem[]; className?: string }) {
  const doneCount = items.filter((i) => i.state === 'done').length;
  const nowIdx = items.findIndex((i) => i.state === 'now');
  const reach = (nowIdx >= 0 ? nowIdx + 0.5 : doneCount) / Math.max(1, items.length);
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className="absolute left-0 right-0 top-[5px] hidden h-px bg-line-2 md:block" />
      <span
        aria-hidden
        className="absolute left-0 top-[5px] hidden h-px bg-gradient-to-r from-bamboo via-bamboo to-accent shadow-[0_0_10px_rgb(var(--accent)/0.7)] md:block"
        style={{ width: `${reach * 100}%` }}
      />
      <ol
        className="relative grid grid-cols-2 gap-y-6 sm:grid-cols-3 md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
        style={{ ['--cols' as string]: items.length }}
      >
        {items.map((it, i) => {
          const st = it.state ?? 'next';
          const ring =
            st === 'done'
              ? 'border-bamboo bg-bamboo'
              : st === 'now'
                ? 'border-accent bg-accent shadow-[0_0_14px_rgb(var(--accent))]'
                : 'border-faint bg-bg';
          return (
            <li key={i} className="relative min-w-0 pr-3 pt-6" aria-current={st === 'now' ? 'step' : undefined}>
              <span aria-hidden className={`absolute left-0 top-0 h-[11px] w-[22px] rounded-full border-[1.5px] ${ring}`} />
              {it.when && (
                <span
                  className={`mb-1.5 block font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${
                    st === 'now' ? 'text-accent' : st === 'done' ? 'text-bamboo' : 'text-faint'
                  }`}
                >
                  {it.when}
                </span>
              )}
              <span className={`block text-[15px] font-semibold leading-snug tracking-[-0.02em] ${st === 'next' ? 'text-muted' : 'text-fg'}`}>
                {it.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

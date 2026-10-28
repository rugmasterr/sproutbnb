'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './hooks';

export type Step = { title: React.ReactNode; body?: React.ReactNode; tone?: 'yellow' | 'green' };

/**
 * Numbered steps 01..N whose active item follows scroll (or click). The active step's title
 * brightens, its body expands, and a hairline progress bar under it fills as you scroll through.
 * Not pinned — works in normal flow and on phones. `onActive` lets a sibling visual react.
 */
export function ScrollSteps({
  steps,
  className = '',
  onActive,
}: {
  steps: Step[];
  className?: string;
  onActive?: (i: number) => void;
}) {
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const [prog, setProg] = useState(0);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // progress of the list's travel through the middle band of the viewport
      const start = vh * 0.7;
      const end = vh * 0.3;
      const p = Math.max(0, Math.min(0.9999, (start - r.top) / Math.max(1, r.height + start - end)));
      const idx = Math.min(steps.length - 1, Math.floor(p * steps.length));
      setActive(idx);
      setProg(p * steps.length - idx);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, [steps.length]);

  useEffect(() => onActive?.(active), [active, onActive]);

  return (
    <ol ref={listRef} className={`border-t border-line ${className}`}>
      {steps.map((s, i) => {
        const on = i === active;
        const green = s.tone === 'green';
        const fillW = i < active ? 1 : on ? (reduced ? 1 : prog) : 0;
        return (
          <li key={i} className="relative border-b border-line">
            <button
              type="button"
              onClick={() => setActive(i)}
              aria-expanded={on}
              className="grid w-full grid-cols-[2.6rem_minmax(0,1fr)] items-baseline gap-3 py-4 text-left"
            >
              <span className={`font-mono text-xs transition-colors duration-300 ${on ? (green ? 'text-bamboo' : 'text-accent') : 'text-faint'}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={`font-display text-[1.35rem] font-semibold leading-tight tracking-[-0.035em] transition-colors duration-500 sm:text-[1.75rem] ${
                  on ? 'text-fg' : 'text-fg/30 hover:text-fg/55'
                }`}
              >
                {s.title}
              </span>
            </button>
            {s.body && (
              <div className={`grid transition-[grid-template-rows] duration-500 ease-out ${on ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden pl-[calc(2.6rem+0.75rem)]">
                  <div
                    className={`max-w-[46ch] pb-4 text-[15px] text-muted transition duration-500 ${on ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'}`}
                  >
                    {s.body}
                  </div>
                </div>
              </div>
            )}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-px">
              <span
                className={`block h-full origin-left ${green ? 'bg-bamboo shadow-[0_0_10px_rgb(var(--bamboo))]' : 'bg-accent shadow-[0_0_10px_rgb(var(--accent))]'}`}
                style={{ transform: `scaleX(${fillW})` }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

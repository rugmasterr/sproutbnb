'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from './hooks';

type Props = {
  /** Target value. null/undefined/NaN renders `fallback`. */
  value: number | null | undefined;
  /** Custom formatter (e.g. fmtAmt / fmtUsd from lib/format). Default: locale string with `decimals`. */
  format?: (n: number) => string;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  fallback?: React.ReactNode;
  className?: string;
};

/**
 * Counts from 0 (or the previous value) to `value` when scrolled into view, ease-out.
 * Uses tabular numbers; reduced-motion jumps straight to the value. SSR renders the final value.
 */
export function CountUp({ value, format, decimals = 0, duration = 1400, prefix = '', suffix = '', fallback = '—', className = '' }: Props) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLSpanElement>();
  const ok = typeof value === 'number' && Number.isFinite(value);
  const target = ok ? (value as number) : 0;
  const [shown, setShown] = useState<number>(target);
  const from = useRef(0);
  const armed = useRef(false);

  // Before the first view, sit at 0 so the count is visible (client only).
  useEffect(() => {
    if (!armed.current && !reduced) setShown(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ok) return;
    if (reduced) {
      setShown(target);
      return;
    }
    if (!inView) return;
    armed.current = true;
    const start = performance.now();
    const a = from.current;
    let id = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(a + (target - a) * e);
      if (p < 1) id = requestAnimationFrame(tick);
      else from.current = target;
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, inView, reduced, duration, ok]);

  const fmt = format ?? ((n: number) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  return (
    <span ref={ref} className={`num ${className}`}>
      {ok ? (
        <>
          <span className="sr-only">
            {prefix}
            {fmt(target)}
            {suffix}
          </span>
          <span aria-hidden>
            {prefix}
            {fmt(shown)}
            {suffix}
          </span>
        </>
      ) : (
        fallback
      )}
    </span>
  );
}

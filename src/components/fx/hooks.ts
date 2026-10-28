'use client';

import { useEffect, useRef, useState } from 'react';

/** True when the user asked for reduced motion. SSR/first render: false. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * IntersectionObserver hook. `once` (default) stops observing after the first hit.
 * Returns [ref, inView]. Without IO support it reports in-view immediately.
 */
export function useInView<T extends Element>({
  once = true,
  rootMargin = '0px 0px -10% 0px',
  threshold = 0.15,
}: { once?: boolean; rootMargin?: string; threshold?: number } = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, threshold]);
  return [ref, inView] as const;
}

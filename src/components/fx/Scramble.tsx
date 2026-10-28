'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from './hooks';

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+<>/\\=';
const HEX = '0123456789abcdef';
const HAN = '竹笋节林芽春生长根叶青山';

const isHan = (c: string) => /[㐀-鿿豈-﫿]/.test(c);

function pick(pool: string) {
  return pool[Math.floor(Math.random() * pool.length)];
}

type Props = {
  text: string;
  className?: string;
  /** When to decode. 'view' (default) runs once on first scroll into view. */
  trigger?: 'mount' | 'view' | 'hover';
  /** Total decode time in ms. */
  duration?: number;
  /** Glyph pool for Latin chars. 'hex' suits addresses/hashes. */
  charset?: 'latin' | 'hex';
  /** Delay before starting (ms). */
  delay?: number;
};

/**
 * Decode / scramble text effect. Layout-stable (the final text reserves the space),
 * screen readers get the final text only, reduced-motion shows the final text at once.
 */
export function Scramble({ text, className = '', trigger = 'view', duration = 900, charset = 'latin', delay = 0 }: Props) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [out, setOut] = useState(text);
  const raf = useRef<number>();
  const started = useRef(false);

  const run = useCallback(() => {
    if (reduced) return setOut(text);
    cancelAnimationFrame(raf.current ?? 0);
    const pool = charset === 'hex' ? HEX : LATIN;
    const chars = [...text];
    const t0 = performance.now() + delay;
    let last = 0;
    const tick = (now: number) => {
      const p = Math.max(0, (now - t0) / duration);
      if (now - last > 45 || p >= 1) {
        last = now;
        setOut(
          chars
            .map((c, idx) => {
              if (c === ' ' || /[.,:;·—\-|/()]/.test(c)) return c;
              const settle = idx / chars.length;
              if (p >= settle * 0.85 + 0.15) return c;
              return isHan(c) ? pick(HAN) : pick(pool);
            })
            .join(''),
        );
      }
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setOut(text);
    };
    raf.current = requestAnimationFrame(tick);
  }, [text, duration, charset, delay, reduced]);

  useEffect(() => {
    started.current = false;
    setOut(text);
  }, [text]);

  useEffect(() => {
    if (started.current) return;
    if (trigger === 'mount' || (trigger === 'view' && inView)) {
      started.current = true;
      run();
    }
  }, [trigger, inView, run]);

  useEffect(() => () => cancelAnimationFrame(raf.current ?? 0), []);

  return (
    <span
      ref={ref}
      className={`relative inline-grid min-w-0 max-w-full ${className}`}
      onMouseEnter={trigger === 'hover' ? run : undefined}
      onFocus={trigger === 'hover' ? run : undefined}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre-wrap">
        {text}
      </span>
      <span aria-hidden className="col-start-1 row-start-1 whitespace-pre-wrap">
        {out}
      </span>
    </span>
  );
}

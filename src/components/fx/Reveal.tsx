'use client';

import { createElement, useEffect, useState } from 'react';
import { useInView } from './hooks';

type Props = {
  children: React.ReactNode;
  /** Stagger index: delay = i * 90ms. */
  i?: number;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
};

/**
 * Rise-in on scroll (opacity + 26px + blur → none). Content is visible on the server render and
 * without JS; it is only hidden once mounted and still off-screen, so nothing is ever lost.
 */
export function Reveal({ children, i = 0, as = 'div', className = '', style, id }: Props) {
  const [ref, inView] = useInView<HTMLElement>();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return createElement(
    as,
    {
      ref,
      id,
      className: `reveal ${className}`,
      'data-pre': mounted && !inView ? 'true' : 'false',
      style: { ...style, ['--rd' as string]: i },
    },
    children,
  );
}

/** Hero-style one-shot rise on load (CSS only). Use for above-the-fold copy. */
export function Rise({
  children,
  d = 0,
  as = 'div',
  className = '',
}: {
  children: React.ReactNode;
  /** Stagger index: delay = d * 90ms + 120ms. */
  d?: number;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}) {
  return createElement(as, { className: `rise ${className}`, style: { ['--d' as string]: d } }, children);
}

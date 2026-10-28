'use client';

import type { StatsResponse } from '@/lib/types';
import { Kicker, Reveal, StatusLine, Scramble } from '../fx';
import { StatsRow } from '../StatsRow';
import { C, useL } from './copy';
import { TwoLine } from './TwoLine';

const ICONS = [
  // passkey
  <svg key="k" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3M21 12v2" strokeLinecap="round" />
  </svg>,
  // bridge
  <svg key="b" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M3 16c3-6 6-8 9-8s6 2 9 8" strokeLinecap="round" />
    <path d="M3 16h18M7 16v-3.5M12 16V8M17 16v-3.5" strokeLinecap="round" />
  </svg>,
  // shield
  <svg key="s" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // burn / rootstock
  <svg key="r" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M12 21c-3.5 0-6-2.4-6-5.6 0-3.6 3-5.4 3.6-9.4 2.6 1.6 3.4 4 3.4 5.6 1-.8 1.6-2 1.8-3.2C17 10 18 12.4 18 15.4 18 18.6 15.5 21 12 21z" strokeLinejoin="round" />
  </svg>,
];

export function Protocol({ stats, loading }: { stats?: StatsResponse; loading: boolean }) {
  const L = useL();
  const pre = stats ? !stats.configured : false;
  return (
    <section className="section relative overflow-hidden border-t border-line">
      <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-50" />
      <div className="container relative">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <Kicker index={3} node>
              <Scramble text={L(C.proto.kicker)} />
            </Kicker>
            <h2 className="h2 mt-4 max-w-[20ch]">
              <TwoLine a={L(C.proto.t1)} b={L(C.proto.t2)} />
            </h2>
          </div>
          {pre && (
            <StatusLine tone="yellow" className="normal-case">
              {L(C.proto.pre)}
            </StatusLine>
          )}
        </Reveal>

        <Reveal i={1} className="mt-10">
          <StatsRow s={stats} loading={loading} />
        </Reveal>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {C.proto.cards.map((c, i) => (
            <Reveal key={c.tag} i={i} className="min-w-0">
              <div className="glass group relative h-full overflow-hidden p-5 transition duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/40">
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${i % 2 ? 'glow-green' : 'glow-yellow'}`}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl border border-line-2 bg-bg/60 ${i % 2 ? 'text-bamboo-hi' : 'text-accent'}`}>
                    {ICONS[i]}
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">{c.tag}</span>
                </div>
                <h3 className="relative mt-5 text-lg font-semibold tracking-[-0.025em]">{L(c.t)}</h3>
                <p className="relative mt-2 text-sm text-muted">{L(c.b)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

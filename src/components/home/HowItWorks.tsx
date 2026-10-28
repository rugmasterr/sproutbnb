'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { BambooBar, Kicker, Reveal, ScrollSteps, type Step, Scramble } from '../fx';
import { C, useL } from './copy';
import { TwoLine } from './TwoLine';

const N = 5;
const SEG = 84; // px per stalk segment in the SVG
const BASE = 470; // y of the soil line

/** Sticky visual: a bamboo stalk that grows one node per active step. */
function GrowingStalk({ active }: { active: number }) {
  const segs = Array.from({ length: N }, (_, i) => {
    const y1 = BASE - i * SEG; // bottom
    const y0 = y1 - SEG + 8; // top (leaves a gap for the node ring)
    return { i, y0, y1 };
  });
  return (
    <svg viewBox="0 0 260 500" className="h-full w-full" aria-hidden fill="none">
      <defs>
        <linearGradient id="hw-lit" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0" stopColor="rgb(var(--bamboo))" stopOpacity=".55" />
          <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="hw-shine" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="hw-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* faint scale on the left */}
      {segs.map((s) => (
        <g key={`sc-${s.i}`}>
          <line x1="22" x2="58" y1={s.y0 - 4} y2={s.y0 - 4} stroke="rgb(var(--line-2))" strokeOpacity="1" strokeWidth="1" />
          <text
            x="22"
            y={s.y0 - 12}
            className="font-mono"
            fontSize="11"
            letterSpacing="1"
            fill={s.i <= active ? (s.i >= 3 ? 'rgb(var(--bamboo))' : 'rgb(var(--accent))') : 'rgb(var(--faint))'}
            style={{ transition: 'fill .5s' }}
          >
            {String(s.i + 1).padStart(2, '0')}
          </text>
        </g>
      ))}

      {/* soil */}
      <path d={`M60 ${BASE + 6} Q130 ${BASE - 4} 200 ${BASE + 6}`} stroke="rgb(var(--line-2))" strokeWidth="2" strokeLinecap="round" />

      {segs.map((s) => {
        const lit = s.i <= active;
        const now = s.i === active;
        const green = s.i >= 3;
        const col = green ? 'rgb(var(--bamboo))' : 'rgb(var(--accent))';
        const side = s.i % 2 === 0 ? 1 : -1;
        return (
          <g key={s.i}>
            {/* outline (unlit) */}
            <rect x="116" y={s.y0} width="28" height={s.y1 - s.y0} rx="7" stroke="rgb(var(--line-2))" strokeDasharray="3 4" />
            {/* lit body grows from its base */}
            <g
              style={{
                transformBox: 'fill-box',
                transformOrigin: '50% 100%',
                transform: `scaleY(${lit ? 1 : 0})`,
                opacity: lit ? 1 : 0,
                transition: 'transform .7s cubic-bezier(.22,.8,.2,1), opacity .4s',
              }}
            >
              <rect x="116" y={s.y0} width="28" height={s.y1 - s.y0} rx="7" fill="url(#hw-lit)" stroke={col} strokeWidth="1.5" />
              <rect x="120" y={s.y0 + 4} width="8" height={s.y1 - s.y0 - 8} rx="4" fill="url(#hw-shine)" />
            </g>
            {/* node ring at the top of the segment */}
            <rect
              x="110"
              y={s.y0 - 7}
              width="40"
              height="8"
              rx="4"
              fill={lit ? col : 'rgb(var(--bg))'}
              stroke={lit ? col : 'rgb(var(--line-2))'}
              strokeWidth="1.5"
              style={{ transition: 'fill .5s, stroke .5s' }}
            />
            {now && <rect x="104" y={s.y0 - 11} width="52" height="16" rx="8" fill={col} opacity=".55" filter="url(#hw-glow)" />}
            {/* leaf */}
            <path
              d={
                side === 1
                  ? `M146 ${s.y0 + 18} Q196 ${s.y0 - 8} 232 ${s.y0 + 6} Q192 ${s.y0 + 30} 146 ${s.y0 + 26}Z`
                  : `M114 ${s.y0 + 18} Q64 ${s.y0 - 8} 28 ${s.y0 + 6} Q68 ${s.y0 + 30} 114 ${s.y0 + 26}Z`
              }
              fill={green ? 'rgb(var(--bamboo-hi))' : 'rgb(var(--accent-hi))'}
              fillOpacity=".14"
              stroke={green ? 'rgb(var(--bamboo-hi))' : 'rgb(var(--accent-hi))'}
              strokeOpacity=".7"
              style={{ opacity: lit && s.i > 0 ? 1 : 0, transition: 'opacity .6s .25s' }}
            />
          </g>
        );
      })}
      {/* shoot tip */}
      <path
        d={`M120 ${BASE - N * SEG + 1} L130 ${BASE - N * SEG - 34} L140 ${BASE - N * SEG + 1}Z`}
        fill="rgb(var(--accent-hi))"
        style={{ opacity: active >= N - 1 ? 1 : 0, transition: 'opacity .6s .3s' }}
      />
    </svg>
  );
}

export function HowItWorks() {
  const { t } = useI18n();
  const L = useL();
  const [active, setActive] = useState(0);
  const bodies = [t('home.how1'), L(C.how.b2), L(C.how.b3), L(C.how.b4), t('home.how3')];
  const steps: Step[] = C.how.s.map((s, i) => ({ title: L(s), body: bodies[i], tone: i >= 3 ? 'green' : 'yellow' }));
  const readout = L(C.how.r[active]);

  return (
    <section className="section relative overflow-hidden" id="how">
      <div aria-hidden className="lines-bg fade-mask-b pointer-events-none absolute inset-0 opacity-40" />
      <div className="container relative">
        <Reveal>
          <Kicker index={1} node>
            <Scramble text={L(C.how.kicker)} />
          </Kicker>
          <h2 className="h2 mt-4 max-w-[18ch]">
            <TwoLine a={L(C.how.t1)} b={L(C.how.t2)} />
          </h2>
          <p className="lede mt-5">{L(C.how.sub)}</p>
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
          <div className="min-w-0">
            {/* phone: compact progress readout */}
            <div className="glass mb-6 p-4 lg:hidden">
              <div className="mb-3 flex items-center justify-between gap-3 font-mono text-[10.5px] uppercase tracking-[0.08em]">
                <span className="text-accent">
                  {L(C.how.node)} {String(active + 1).padStart(2, '0')} / 05
                </span>
                <span className="min-w-0 truncate text-muted">{readout}</span>
              </div>
              <BambooBar value={(active + 1) / N} segments={N} tone={active >= 3 ? 'green' : 'yellow'} label={L(C.how.kicker)} />
            </div>
            <ScrollSteps steps={steps} onActive={setActive} />
          </div>

          <div className="hidden lg:block">
            <div className="glass sticky top-24 overflow-hidden p-6">
              <div aria-hidden className={`pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full transition-colors duration-700 ${active >= 3 ? 'glow-green' : 'glow-yellow'}`} />
              <div className="relative flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.1em]">
                <span className="text-faint">{L(C.how.node)}</span>
                <span className={active >= 3 ? 'text-bamboo' : 'text-accent'}>
                  {String(active + 1).padStart(2, '0')} / 05
                </span>
              </div>
              <div className="relative mx-auto mt-2 h-[440px] w-full max-w-[300px]">
                <GrowingStalk active={active} />
              </div>
              <div className="relative mt-2 border-t border-line pt-4">
                <div className="mono-label">{L(C.how.s[active])}</div>
                <div className="mt-1.5 font-mono text-sm text-fg" aria-live="polite">
                  {readout}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

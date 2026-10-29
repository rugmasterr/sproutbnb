'use client';

import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { useSiteConfig } from '@/lib/useApi';
import { ZecGlyph } from '../brand';
import { CountUp, Kicker, NodeRing, Reveal, useInView, useReducedMotion, Scramble } from '../fx';
import { C, useL } from './copy';
import { TwoLine } from './TwoLine';

const PARTS = [
  { pct: 0.5, bar: 'bg-gradient-to-r from-bamboo-deep to-bamboo', dot: 'bg-bamboo', txt: 'text-bamboo-hi' },
  { pct: 0.5, bar: 'bg-gradient-to-r from-bamboo to-bamboo-hi', dot: 'bg-bamboo-hi', txt: 'text-bamboo-hi' },
  { pct: 0.2, bar: 'bg-gradient-to-r from-ink-4 to-faint/70', dot: 'bg-faint', txt: 'text-fg' },
  { pct: 0.8, bar: 'bg-gradient-to-r from-accent-deep via-accent to-accent-hi', dot: 'bg-accent', txt: 'text-accent-hi' },
] as const;

function SplitBar() {
  const { t } = useI18n();
  const L = useL();
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const split = reduced || inView;
  return (
    <div ref={ref} className="glass relative overflow-hidden p-5 sm:p-7">
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mono-label">{L(C.fee.perTrade)}</div>
          <div className="stat-value mt-2">
            <CountUp value={2} decimals={2} suffix="%" />
          </div>
        </div>
        <span className="tag-yellow">
          {t('trade.buy')} · {t('trade.sell')}
        </span>
      </div>

      {/* the bar: one solid 2.00% bar that splits into four on view */}
      <div
        className="relative mt-6 flex h-4 w-full"
        role="img"
        aria-label="2.00% = 0.50% + 0.50% + 0.20% + 0.80%"
        style={{ gap: split ? 6 : 0, transition: 'gap .9s cubic-bezier(.22,.8,.2,1) .15s' }}
      >
        {PARTS.map((p, i) => (
          <div
            key={i}
            className={`h-full min-w-0 ${p.bar} shadow-[0_0_14px_rgb(var(--accent)/0.25)]`}
            style={{
              flex: `${p.pct} 1 0%`,
              borderRadius: split ? 999 : i === 0 ? '999px 0 0 999px' : i === PARTS.length - 1 ? '0 999px 999px 0' : 0,
              transition: `border-radius .6s ${i * 90}ms`,
            }}
          />
        ))}
      </div>

      <ul className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        {PARTS.map((p, i) => {
          const part = C.fee.parts[i];
          return (
            <li key={i} className="min-w-0 bg-raised/95 p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
                <span className="mono-label truncate">{L(part)}</span>
              </div>
              <div className={`num mt-2 font-display text-[1.9rem] font-semibold leading-none tracking-[-0.04em] ${p.txt}`}>
                <CountUp value={p.pct} decimals={2} suffix="%" duration={1200 + i * 150} />
              </div>
              <p className="mt-2 text-xs text-muted">{L(part.d)}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Choices() {
  const { t } = useI18n();
  const L = useL();
  const cfg = useSiteConfig();
  const zfSet = Boolean(cfg.data?.zcashFoundationAddress);
  return (
    <div className="card relative overflow-hidden p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="mono-label text-accent">{L(C.fee.choices)}</div>
        <div className="text-xs text-faint">{L(C.fee.choicesSub)}</div>
      </div>
      <ol className="mt-4 divide-y divide-line border-y border-line">
        {[0, 1, 2, 3, 4].map((m) => {
          const zf = m === 4;
          const locked = zf && !zfSet;
          return (
            <li key={m} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-3.5">
              <span className="pt-0.5 font-mono text-xs text-faint">{String(m + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tracking-[-0.01em]">{t(`mode.${m}` as Key)}</span>
                  {(m === 2 || m === 3 || m === 4) && <ZecGlyph size={13} />}
                  {zf && !locked && <span className="tag-green">{L(C.fee.zfOpen)}</span>}
                  {zf && <span className="tag-muted">{L(C.fee.permanent)}</span>}
                </div>
                <p className="mt-1 text-sm text-muted">{t(`mode.${m}d` as Key)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function FeeSplit() {
  const L = useL();
  return (
    <section className="section relative overflow-hidden border-t border-line">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-20 h-[480px] w-[480px] rounded-full glow-green opacity-50" />
      <div className="container relative">
        <Reveal>
          <Kicker index={2} node>
            <Scramble text={L(C.fee.kicker)} />
          </Kicker>
          <h2 className="h2 mt-4 max-w-[18ch]">
            <TwoLine a={L(C.fee.t1)} b={L(C.fee.t2)} />
          </h2>
          <p className="lede mt-5">{L(C.fee.sub)}</p>
        </Reveal>
        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Reveal className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <SplitBar />
            <div className="mt-4 flex items-center gap-3 px-1 text-xs text-faint">
              <NodeRing tone="green" />
              <span>{L(C.fee.sub2)}</span>
            </div>
          </Reveal>
          <Reveal i={1} className="min-w-0">
            <Choices />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

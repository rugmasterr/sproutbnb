'use client';

import { ZecAmount, useZec } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { big, fmtAmt, fmtNum, weiToNum } from '@/lib/format';
import type { StatsResponse } from '@/lib/types';
import { CountUp } from './fx';

type Cell = {
  label: string;
  value: number | null;
  fmt: (n: number) => string;
  unit?: string;
  est?: boolean;
  hint?: string;
  /** Rendered when `value` is null (e.g. ZEC rate unavailable: fall back to the BNB amount). */
  fallback?: React.ReactNode;
};

/** Protocol counters strip. Every number is read live from /api/stats; counts up on view. */
export function StatsRow({ s, loading }: { s?: StatsResponse; loading?: boolean }) {
  const { t } = useI18n();
  const { bnbWeiToZec } = useZec();
  const l = loading || !s;
  const volWei = big(s?.estVolumeWei);
  const zfWei = big(s?.payouts?.bnbBridgedToFoundationWei);
  const int = (n: number) => fmtNum(Math.round(n));
  const cells: Cell[] = [
    { label: t('stats.planted'), value: s?.coinsPlanted ?? 0, fmt: int },
    {
      label: t('stats.volume'),
      value: bnbWeiToZec(volWei),
      fmt: fmtAmt,
      unit: 'ZEC',
      est: true,
      hint: t('stats.volumeHint'),
      fallback: <ZecAmount wei={volWei} />,
    },
    { label: t('stats.holders'), value: weiToNum(s?.payouts?.zecToHoldersZecWei ?? '0'), fmt: fmtAmt, unit: 'ZEC' },
    { label: t('stats.liquidity'), value: weiToNum(s?.roots?.zecToLiquidityZecWei ?? '0'), fmt: fmtAmt, unit: 'ZEC' },
    { label: t('stats.burned'), value: weiToNum(s?.roots?.sproutBurnedWei ?? '0'), fmt: fmtAmt },
    {
      label: t('stats.zf'),
      value: bnbWeiToZec(zfWei),
      fmt: fmtAmt,
      unit: 'ZEC',
      est: true,
      hint: t('stats.zfHint'),
      fallback: <ZecAmount wei={zfWei} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="group relative min-w-0 bg-bg/95 p-4 transition-colors hover:bg-raised sm:p-5" title={c.hint}>
          <div className="flex min-h-[2rem] items-start gap-1.5 font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.08em] text-faint">
            <span className="line-clamp-2 min-w-0">{c.label}</span>
            {c.est && (
              <span className="mt-px shrink-0 rounded border border-accent/40 px-1 py-px text-[9px] font-medium uppercase leading-3 text-accent">
                {t('ui.est')}
              </span>
            )}
          </div>
          {l ? (
            <div className="skeleton mt-3 h-9 w-24" />
          ) : (
            <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-1.5">
              <span className="stat-value break-all text-[1.85rem] sm:text-[2.2rem]">
                <CountUp value={c.value} format={c.fmt} fallback={c.fallback} />
              </span>
              {c.unit && c.value !== null && <span className="font-mono text-[11px] font-medium text-gold">{c.unit}</span>}
            </div>
          )}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-accent via-accent-hi to-bamboo transition-transform duration-500 ease-out group-hover:scale-x-100"
          />
        </div>
      ))}
    </div>
  );
}

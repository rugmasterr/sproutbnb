'use client';

import Link from 'next/link';
import { ZecAmount, useZec } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { explorerAddr } from '@/lib/config';
import { big, fmtAmt, fmtNum, shortAddr, timeAgo, weiToNum } from '@/lib/format';
import { useStats } from '@/lib/useApi';
import { CountUp, Kicker, NodeRing, Reveal } from './fx';
import { useCopy } from './tradeCopy';
import { CoinImage, Ext, ErrorNote, FeeDest, PrelaunchBanner, Row } from './ui';

type Unit = 'zec' | 'sprout' | null;

/** One cell of a hairline stat grid with a counting number. */
function Cell({
  label,
  value,
  unit = null,
  fallback,
  est,
  hint,
  loading,
  big: isBig = false,
  i = 0,
}: {
  label: string;
  value: number | null;
  unit?: Unit;
  /** Rendered when `value` is null (e.g. the ZEC rate is missing → BNB via ZecAmount). */
  fallback?: React.ReactNode;
  est?: boolean;
  hint?: string;
  loading?: boolean;
  big?: boolean;
  i?: number;
}) {
  const { t } = useI18n();
  return (
    <Reveal i={i} className="group relative min-w-0 bg-ink-2 px-4 py-5 transition-colors hover:bg-ink-3 sm:px-6 sm:py-7">
      <div className="flex min-h-[2rem] items-start gap-1.5" title={hint}>
        <span className="mono-label line-clamp-2 min-w-0 leading-4">{label}</span>
        {est && <span className="tag-yellow shrink-0 px-1.5 py-px text-[9px]">{t('ui.est')}</span>}
      </div>
      {loading ? (
        <div className={`skeleton mt-3 ${isBig ? 'h-12 w-36' : 'h-8 w-28'}`} />
      ) : (
        <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span
            className="stat-value"
            style={{ fontSize: isBig ? 'clamp(2rem, 4vw, 3.4rem)' : 'clamp(1.5rem, 2.6vw, 2.2rem)' }}
          >
            {value === null ? fallback ?? '—' : <CountUp value={value} format={unit ? fmtAmt : (n) => fmtNum(Math.round(n))} />}
          </span>
          {value !== null && unit === 'zec' && <span className="font-mono text-xs font-semibold text-gold">ZEC</span>}
          {value !== null && unit === 'sprout' && <span className="font-mono text-xs font-semibold text-bamboo-hi">$SPROUT</span>}
        </div>
      )}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Reveal>
  );
}

export function StatsView() {
  const { t } = useI18n();
  const c = useCopy();
  const { bnbWeiToZec } = useZec();
  const q = useStats();
  const s = q.data;
  const l = q.isLoading || !s;
  const totalCoins = s?.byMode.reduce((a, m) => a + m.coins, 0) ?? 0;

  // BNB-denominated → ZEC at the live rate (null when the rate is missing; the cell then shows ZecAmount's BNB fallback).
  const bz = (w: string | null | undefined) => bnbWeiToZec(big(w));
  const zecCell = (label: string, w: string | null | undefined, i: number, extra: { est?: boolean; hint?: string; big?: boolean } = {}) => (
    <Cell key={label} i={i} label={label} loading={l} value={bz(w)} unit="zec" fallback={<ZecAmount wei={big(w)} />} {...extra} />
  );

  return (
    <div className="space-y-14 sm:space-y-20">
      {(s && !s.configured) || (s && !s.ok) ? (
        <div className="space-y-4">
          {s && !s.configured && <PrelaunchBanner />}
          {s && !s.ok && <ErrorNote onRetry={() => q.refetch()} detail={s.error} />}
        </div>
      ) : null}

      {/* 01 — network headline numbers */}
      <section>
        <Kicker index={1}>{c('network')}</Kicker>
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-2 bg-line md:grid-cols-3">
          <Cell big i={0} label={t('stats.planted')} loading={l} value={s ? s.coinsPlanted : null} />
          {zecCell(t('stats.volume'), s?.estVolumeWei, 1, { est: true, hint: t('stats.volumeHint'), big: true })}
          <Cell
            big
            i={2}
            label={t('stats.holders')}
            loading={l}
            value={weiToNum(s?.payouts?.zecToHoldersZecWei ?? '0')}
            unit="zec"
          />
          <Cell big i={3} label={t('stats.liquidity')} loading={l} value={weiToNum(s?.roots?.zecToLiquidityZecWei ?? '0')} unit="zec" />
          <Cell big i={4} label={t('stats.burned')} loading={l} value={weiToNum(s?.roots?.sproutBurnedWei ?? '0')} unit="sprout" />
          {zecCell(t('stats.zf'), s?.payouts?.bnbBridgedToFoundationWei, 5, { est: true, hint: t('stats.zfHint'), big: true })}
        </div>
      </section>

      {/* 02 — revenue flow */}
      <section>
        <Kicker index={2}>{c('revenueFlow')}</Kicker>
        <h2 className="h3 mt-3">{t('stats.revenue')}</h2>
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3 xl:grid-cols-5">
          {zecCell(t('stats.revenue'), s?.totalRevenueWei, 0)}
          {zecCell(t('stats.toLiq'), s?.toLiquidityWei, 1)}
          {zecCell(t('stats.toRoot'), s?.toRootstockWei, 2)}
          {zecCell(t('stats.toOps'), s?.toOpsWei, 3)}
          {zecCell(t('stats.toPayee'), s?.toPayeeWei, 4)}
          {zecCell(t('stats.pending'), s?.pendingWei, 5)}
          <Cell i={6} label={t('stats.payees')} loading={l} value={weiToNum(s?.payouts?.zecToPayeesZecWei ?? '0')} unit="zec" />
          {zecCell(t('stats.bridged'), s?.payouts?.bnbBridgedToZcashWei, 7, { est: true })}
          <Cell i={8} label={t('stats.graduated')} loading={l} value={s ? s.graduated : null} />
          <div className="bg-ink-2 md:hidden xl:block" aria-hidden />
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* 03 — by mode */}
        <section className="min-w-0">
          <Kicker index={3}>{c('modes')}</Kicker>
          <h2 className="h3 mt-3">{t('stats.byMode')}</h2>
          <div className="box mt-5">
            {(s?.byMode ?? [0, 1, 2, 3, 4].map((mode) => ({ mode, coins: 0, feesWei: '0' }))).map((m) => {
              const share = totalCoins ? m.coins / totalCoins : 0;
              return (
                <div key={m.mode} className="border-b border-line/70 px-4 py-3.5 last:border-0 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5 font-medium">
                      <span className="font-mono text-[10px] text-faint">{String(m.mode).padStart(2, '0')}</span>
                      {t(`mode.${m.mode}` as Key)}
                    </span>
                    <span className="num font-mono text-xs text-muted">
                      {m.coins} {t('stats.coins')} <span className="text-line-2">·</span> <ZecAmount wei={big(m.feesWei)} />
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-deep to-accent-hi shadow-[0_0_10px_rgb(var(--accent)/0.5)] transition-[width] duration-700 ease-out"
                        style={{ width: `${share * 100}%` }}
                      />
                    </div>
                    <span className="num w-10 text-right font-mono text-[11px] text-faint">{Math.round(share * 100)}%</span>
                  </div>
                  <FeeDest mode={m.mode} className="mt-2" />
                </div>
              );
            })}
          </div>
        </section>

        {/* 04 — roots */}
        <section className="min-w-0">
          <Kicker index={4} tone="green">
            {c('roots')}
          </Kicker>
          <h2 className="h3 mt-3 flex flex-wrap items-baseline gap-x-3">
            {t('stats.roots')}
            <span className="zh-glyph text-base font-medium text-bamboo-hi/80">竹根</span>
          </h2>
          <div className="box relative mt-5">
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full glow-green" />
            <div className="relative grid grid-cols-2 gap-px border-b border-line bg-line">
              <div className="min-w-0 bg-ink-2 px-4 py-4 sm:px-5">
                <div className="mono-label">{t('stats.rootPot')}</div>
                <ZecAmount wei={big(s?.roots?.rootPotWei)} className="mt-1 block truncate font-mono text-lg font-semibold" />
              </div>
              <div className="min-w-0 bg-ink-2 px-4 py-4 sm:px-5">
                <div className="mono-label">{t('stats.lpPot')}</div>
                <ZecAmount wei={big(s?.roots?.lpPotWei)} className="mt-1 block truncate font-mono text-lg font-semibold" />
              </div>
            </div>
            <div className="relative px-4 py-2 sm:px-5">
              <Row
                k={
                  <span className="inline-flex items-center gap-2">
                    <NodeRing tone="green" />
                    {t('stats.lastBurn')}
                  </span>
                }
                v={<span className="font-mono text-xs">{s?.roots?.lastBurnAt ? timeAgo(s.roots.lastBurnAt, t) : t('stats.never')}</span>}
              />
              <Row
                k={
                  <span className="inline-flex items-center gap-2">
                    <NodeRing tone="green" />
                    {t('stats.lastLiq')}
                  </span>
                }
                v={<span className="font-mono text-xs">{s?.roots?.lastLiquidityAt ? timeAgo(s.roots.lastLiquidityAt, t) : t('stats.never')}</span>}
              />
              <Row
                k={
                  <span className="inline-flex items-center gap-2">
                    <NodeRing tone="yellow" />
                    {t('stats.grovePair')}
                  </span>
                }
                v={
                  s?.roots?.grovePair ? (
                    <Ext href={explorerAddr(s.roots.grovePair)} className="link font-mono text-xs">
                      {shortAddr(s.roots.grovePair)}
                    </Ext>
                  ) : (
                    '—'
                  )
                }
              />
            </div>
          </div>
        </section>
      </div>

      {/* 05 — leaderboard */}
      <section>
        <Kicker index={5}>{c('leaderboard')}</Kicker>
        <h2 className="h3 mt-3">{t('stats.top')}</h2>
        <div className="mt-5">
          {s?.topByFees.length ? (
            <div className="box overflow-x-auto">
              <table className="table-tech">
                <thead>
                  <tr>
                    <th className="w-12 pl-4 sm:pl-5">#</th>
                    <th>{c('coin')}</th>
                    <th className="num pr-4 sm:pr-5">{c('fees')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.topByFees.map((cn, i) => (
                    <tr key={cn.address}>
                      <td className="pl-4 font-mono text-xs text-faint sm:pl-5">
                        <span className={i === 0 ? 'text-accent' : ''}>{String(i + 1).padStart(2, '0')}</span>
                      </td>
                      <td className="max-w-0 sm:max-w-none">
                        <Link href={`/coin/${cn.address}`} className="group flex min-w-0 items-center gap-3">
                          <CoinImage src={cn.image} symbol={cn.symbol} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium transition group-hover:text-accent-hi">
                              {cn.name} <span className="font-mono text-[11px] text-faint">${cn.symbol}</span>
                            </span>
                            <FeeDest mode={cn.mode} />
                          </span>
                        </Link>
                      </td>
                      <td className="num whitespace-nowrap pr-4 font-mono text-[13px] font-semibold sm:pr-5">
                        <ZecAmount wei={big(cn.feesWei)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center text-sm text-muted">
              {l ? <div className="skeleton mx-auto h-4 w-48" /> : t('home.plantedEmpty')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { explorerAddr } from '@/lib/config';
import { big, fmtNum, shortAddr, timeAgo } from '@/lib/format';
import { useStats } from '@/lib/useApi';
import { StatsRow } from './StatsRow';
import { CoinImage, Ext, ErrorNote, FeeDest, PrelaunchBanner, Row, SectionHead, Stat, ZecValue } from './ui';

export function StatsView() {
  const { t } = useI18n();
  const q = useStats();
  const s = q.data;
  const l = q.isLoading || !s;
  const totalCoins = s?.byMode.reduce((a, m) => a + m.coins, 0) ?? 0;

  return (
    <div className="space-y-10">
      {s && !s.configured && <PrelaunchBanner />}
      {s && !s.ok && <ErrorNote onRetry={() => q.refetch()} detail={s.error} />}
      <StatsRow s={s} loading={q.isLoading} />

      <section>
        <SectionHead title={t('stats.revenue')} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('stats.revenue')} loading={l} value={<ZecAmount wei={big(s?.totalRevenueWei)} />} />
          <Stat label={t('stats.toLiq')} loading={l} value={<ZecAmount wei={big(s?.toLiquidityWei)} />} />
          <Stat label={t('stats.toRoot')} loading={l} value={<ZecAmount wei={big(s?.toRootstockWei)} />} />
          <Stat label={t('stats.toOps')} loading={l} value={<ZecAmount wei={big(s?.toOpsWei)} />} />
          <Stat label={t('stats.toPayee')} loading={l} value={<ZecAmount wei={big(s?.toPayeeWei)} />} />
          <Stat label={t('stats.pending')} loading={l} value={<ZecAmount wei={big(s?.pendingWei)} />} />
          <Stat label={t('stats.payees')} loading={l} value={<ZecValue zecWei={s?.payouts?.zecToPayeesZecWei ?? '0'} />} />
          <Stat label={t('stats.bridged')} est loading={l} value={<ZecAmount wei={big(s?.payouts?.bnbBridgedToZcashWei)} />} />
          <Stat label={t('stats.graduated')} loading={l} value={fmtNum(s?.graduated ?? 0)} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHead title={t('stats.byMode')} />
          <div className="card divide-y divide-line/50 p-4">
            {(s?.byMode ?? [0, 1, 2, 3, 4].map((mode) => ({ mode, coins: 0, feesWei: '0' }))).map((m) => (
              <div key={m.mode} className="py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{t(`mode.${m.mode}` as Key)}</span>
                  <span className="num text-muted">
                    {m.coins} {t('stats.coins')} · <ZecAmount wei={big(m.feesWei)} />
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-gold/80" style={{ width: `${totalCoins ? (m.coins / totalCoins) * 100 : 0}%` }} />
                </div>
                <FeeDest mode={m.mode} className="mt-1.5" />
              </div>
            ))}
          </div>
        </section>
        <section className="min-w-0">
          <SectionHead title={t('stats.roots')} zh="竹根" />
          <div className="card divide-y divide-line/50 p-4">
            <Row k={t('stats.rootPot')} v={<ZecAmount wei={big(s?.roots?.rootPotWei)} />} />
            <Row k={t('stats.lpPot')} v={<ZecAmount wei={big(s?.roots?.lpPotWei)} />} />
            <Row k={t('stats.lastBurn')} v={s?.roots?.lastBurnAt ? timeAgo(s.roots.lastBurnAt, t) : t('stats.never')} />
            <Row k={t('stats.lastLiq')} v={s?.roots?.lastLiquidityAt ? timeAgo(s.roots.lastLiquidityAt, t) : t('stats.never')} />
            <Row
              k={t('stats.grovePair')}
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
        </section>
      </div>

      <section>
        <SectionHead title={t('stats.top')} />
        {s?.topByFees.length ? (
          <div className="card divide-y divide-line/50 overflow-hidden">
            {s.topByFees.map((c, i) => (
              <Link key={c.address} href={`/coin/${c.address}`} className="flex items-center gap-3 px-4 py-3 hover:bg-raised/60">
                <span className="w-5 text-right font-mono text-xs text-faint">{i + 1}</span>
                <CoinImage src={c.image} symbol={c.symbol} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <FeeDest mode={c.mode} />
                </span>
                <ZecAmount wei={big(c.feesWei)} className="num font-semibold" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('home.plantedEmpty')}</p>
        )}
      </section>
    </div>
  );
}

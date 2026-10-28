'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import { ABOUT_TO_GRADUATE } from '@/lib/stage';
import { useCoins, useStats, useTrades } from '@/lib/useApi';
import { NodeRule, Seal, Stalks, ZecGlyph } from './brand';
import { CoinCard, CoinRow, CoinSkeletons, Explore, TradesFeed } from './coins';
import { StatsRow } from './StatsRow';
import { Empty, ErrorNote, PrelaunchBanner, SectionHead } from './ui';
import type { Coin } from '@/lib/types';

function SplitBar() {
  const { t } = useI18n();
  const parts = [
    { w: 25, cls: 'bg-bamboo-500', label: t('home.splitLiq') },
    { w: 25, cls: 'bg-seal/90', label: t('home.splitRoot') },
    { w: 10, cls: 'bg-soil', label: t('home.splitOps') },
    { w: 40, cls: 'bg-gold', label: t('home.splitChoice') },
  ];
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="kicker">{t('home.split')}</span>
        <span className="font-mono text-faint">2.00%</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.label} className={`${p.cls} border-r border-bg/60 last:border-0`} style={{ width: `${p.w}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs text-muted sm:grid-cols-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${p.cls}`} />
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Hero() {
  const { t, lang } = useI18n();
  return (
    <section className="relative overflow-hidden border-b border-line/60">
      <div className="ink-wash pointer-events-none absolute inset-0" aria-hidden />
      <Stalks className="pointer-events-none absolute -right-10 bottom-0 hidden h-[110%] w-[300px] opacity-50 md:block" />
      <div className="container relative grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Seal size={40} />
            <span className="kicker">{t('home.kicker')}</span>
          </div>
          <h1
            className={`mt-5 text-balance font-semibold ${
              lang === 'zh' ? 'text-[34px] leading-[1.18] sm:text-5xl lg:text-[56px]' : 'text-[40px] leading-[1.04] sm:text-6xl lg:text-[68px]'
            }`}
          >
            {t('brand.headline')}
          </h1>
          <p className="mt-4 font-display text-xl text-gold sm:text-2xl">{t('brand.tagline')}</p>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{t('home.sub')}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/launch" className="btn-seal px-5 py-2.5 text-base">
              {t('home.ctaLaunch')}
            </Link>
            <Link href="/guide/zcash" className="btn-ghost px-5 py-2.5 text-base">
              <ZecGlyph size={16} />
              {t('home.ctaZcash')}
            </Link>
          </div>
          <ul className="mt-6 flex flex-wrap gap-2">
            {(['home.pill1', 'home.pill2', 'home.pill3'] as const).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-xs text-fg">
                <ZecGlyph size={11} />
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 space-y-3">
          <SplitBar />
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {(
              [
                ['home.how1t', 'home.how1'],
                ['home.how2t', 'home.how2'],
                ['home.how3t', 'home.how3'],
              ] as const
            ).map(([h, b], i) => (
              <div key={h} className="card flex gap-3 p-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/50 font-display text-sm text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold">{t(h)}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(b)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Home() {
  const { t, lang } = useI18n();
  const coins = useCoins();
  const stats = useStats();
  const all = coins.data?.coins ?? [];
  const configured = coins.data?.configured ?? true;
  const trades = useTrades(undefined, configured);
  const grove = all.filter((c) => c.stage === 'grove');
  const graduating = all
    .filter((c) => c.stage !== 'grove' && (c.state?.progress ?? 0) >= ABOUT_TO_GRADUATE)
    .sort((a, b) => (b.state?.progress ?? 0) - (a.state?.progress ?? 0));
  const loading = coins.isLoading;
  const zh = lang === 'en';

  return (
    <>
      <Hero />
      <div className="container space-y-14 py-10">
        {coins.data && !coins.data.configured && <PrelaunchBanner />}
        {coins.data && !coins.data.ok && <ErrorNote onRetry={() => coins.refetch()} detail={coins.data.error} />}

        <StatsRow s={stats.data} loading={stats.isLoading} />

        <section>
          <SectionHead title={t('home.grove')} zh={zh ? '竹林' : undefined} sub={t('home.groveSub')} />
          <CoinRow coins={grove} loading={loading} empty={t('home.groveEmpty')} />
        </section>

        <section>
          <SectionHead title={t('home.graduating')} sub={t('home.graduatingSub')} />
          <CoinRow coins={graduating} loading={loading} empty={t('home.graduatingEmpty')} />
        </section>

        <div className="grid gap-10 xl:grid-cols-[1.6fr_1fr]">
          <section className="min-w-0">
            <SectionHead title={t('home.planted')} zh={zh ? '新笋' : undefined} sub={t('home.plantedSub')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <CoinRowCompact loading={loading} coins={all.slice(0, 6)} empty={t('home.plantedEmpty')} />
            </div>
          </section>
          <section className="min-w-0">
            <SectionHead title={t('home.trades')} sub={t('home.tradesSub')} action={<span className="chip">ZEC</span>} />
            <TradesFeed trades={trades.data?.trades ?? []} loading={configured && trades.isLoading} empty={t('home.tradesEmpty')} />
          </section>
        </div>

        <NodeRule />

        <section id="explore">
          <SectionHead title={t('home.explore')} />
          <Explore coins={all} loading={loading} />
        </section>
      </div>
    </>
  );
}

function CoinRowCompact({ coins, loading, empty }: { coins: Coin[]; loading: boolean; empty: string }) {
  if (loading) return <CoinSkeletons n={4} />;
  if (!coins.length)
    return (
      <div className="sm:col-span-2">
        <Empty text={empty} />
      </div>
    );
  return (
    <>
      {coins.map((c, i) => (
        <CoinCard key={c.address} coin={c} i={i} />
      ))}
    </>
  );
}

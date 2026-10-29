'use client';

import { useI18n } from '@/i18n/I18nProvider';
import { ABOUT_TO_GRADUATE } from '@/lib/stage';
import type { Coin, CoinsResponse, Trade } from '@/lib/types';
import { Stalks } from '../brand';
import { CoinCard, CoinRow, CoinSkeletons, Explore, TradesFeed } from '../coins';
import { Kicker, Reveal, Scramble } from '../fx';
import { ActionLink } from '../ComingSoon';
import { ErrorNote } from '../ui';
import { C, useL } from './copy';
import { TwoLine } from './TwoLine';

function SubHead({ title, sub, zh, count }: { title: string; sub?: string; zh?: string; count?: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-baseline gap-x-2.5 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
          {title}
          {zh && <span className="zh-glyph text-sm font-medium tracking-normal text-accent/80">{zh}</span>}
        </h3>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {count !== undefined && <span className="font-mono text-[11px] text-faint">{String(count).padStart(2, '0')}</span>}
    </div>
  );
}

export function Market({
  data,
  loading,
  onRetry,
  trades,
  tradesLoading,
}: {
  data?: CoinsResponse;
  loading: boolean;
  onRetry: () => void;
  trades: Trade[];
  tradesLoading: boolean;
}) {
  const { t, lang } = useI18n();
  const L = useL();
  const all: Coin[] = data?.coins ?? [];
  const grove = all.filter((c) => c.stage === 'grove');
  const graduating = all
    .filter((c) => c.stage !== 'grove' && (c.state?.progress ?? 0) >= ABOUT_TO_GRADUATE)
    .sort((a, b) => (b.state?.progress ?? 0) - (a.state?.progress ?? 0));
  const newest = [...all].sort((a, b) => b.plantedAt - a.plantedAt).slice(0, 6);
  const showZh = lang === 'en';
  const empty = !loading && all.length === 0;

  return (
    <section className="section relative border-t border-line" id="explore">
      <div className="container">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <Kicker index={4} node>
              <Scramble text={L(C.coins.kicker)} />
            </Kicker>
            <h2 className="h2 mt-4 max-w-[20ch]">
              <TwoLine a={L(C.coins.t1)} b={L(C.coins.t2)} />
            </h2>
          </div>
          <ActionLink href="/launch" className="btn-ghost">
            {t('home.ctaLaunch')} <span className="arr">→</span>
          </ActionLink>
        </Reveal>

        {data && !data.ok && (
          <div className="mt-10">
            <ErrorNote onRetry={onRetry} detail={data.error} />
          </div>
        )}

        {empty ? (
          <Reveal className="mt-6">
            <div className="card relative grid items-center gap-8 overflow-hidden p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_auto]">
              <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-60" />
              <div className="relative min-w-0">
                <span className="kicker">
                  <span aria-hidden className="status-dot" data-pulse="true" style={{ ['--dot' as string]: 'rgb(var(--bamboo))' }} />
                  {L(C.band.live)} · BNB Chain
                </span>
                <h3 className="h3 mt-3">{L(C.coins.emptyT)}</h3>
                <p className="mt-2 max-w-xl text-sm text-muted">{t('home.plantedEmpty')}</p>
                <div className="mt-5 grid max-w-xl gap-3 sm:grid-cols-3">
                  {(['grove', 'graduating', 'trades'] as const).map((k) => (
                    <div key={k} className="rounded-xl border border-line-2 bg-ink-2/70 px-3 py-2.5">
                      <div className="mono-label">{t(`home.${k}`)}</div>
                      <div className="num mt-1 font-mono text-sm text-muted">0</div>
                    </div>
                  ))}
                </div>
              </div>
              <Stalks className="relative mx-auto hidden h-44 w-24 md:block" />
            </div>
          </Reveal>
        ) : (
          <div className="mt-6 space-y-12">
            {(loading || graduating.length > 0 || grove.length === 0) && (
              <Reveal>
                <SubHead title={t('home.graduating')} sub={t('home.graduatingSub')} count={loading ? undefined : graduating.length} />
                <CoinRow coins={graduating} loading={loading} empty={t('home.graduatingEmpty')} />
              </Reveal>
            )}
            {(loading || grove.length > 0) && (
              <Reveal>
                <SubHead title={t('home.grove')} zh={showZh ? '竹林' : undefined} sub={t('home.groveSub')} count={loading ? undefined : grove.length} />
                <CoinRow coins={grove} loading={loading} empty={t('home.groveEmpty')} />
              </Reveal>
            )}

            <div className="grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Reveal className="min-w-0">
                <SubHead title={t('home.planted')} zh={showZh ? '新笋' : undefined} sub={t('home.plantedSub')} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {loading ? <CoinSkeletons n={4} /> : newest.map((c, i) => <CoinCard key={c.address} coin={c} i={i} />)}
                </div>
              </Reveal>
              <Reveal i={1} className="min-w-0">
                <SubHead title={t('home.trades')} sub={t('home.tradesSub')} />
                <TradesFeed trades={trades} loading={tradesLoading} empty={t('home.tradesEmpty')} />
              </Reveal>
            </div>

            <div>
              <SubHead title={t('home.explore')} />
              <Explore coins={all} loading={loading} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
